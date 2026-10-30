<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\EcosystemRecord;
use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Services\CloudinaryService;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AnalyticsController extends Controller
{
    public function __construct(
        private AnalyticsService $analytics,
        private CloudinaryService $cloudinary,
    ) {}

    /** MENRO/admin — clear field observations while preserving restoration sites. */
    public function resetRestorationData(Request $request): JsonResponse
    {
        $result = DB::transaction(function () use ($request) {
            $siteIds = RestorationSite::withTrashed()
                ->lockForUpdate()
                ->pluck('id');
            $plantations = PlantationRecord::query()
                ->select(['id', 'image_public_id'])
                ->lockForUpdate()
                ->get();
            $plantationIds = $plantations->pluck('id');
            $monitoringCount = $plantationIds->isEmpty()
                ? 0
                : MonitoringRecord::whereIn('plantation_record_id', $plantationIds)->count();
            $ecosystemCount = EcosystemRecord::whereIn('restoration_site_id', $siteIds)->count();
            $plantedAreaSites = RestorationSite::withTrashed()
                ->whereNotNull('planted_hectares')
                ->where('planted_hectares', '!=', 0)
                ->count();

            if ($plantationIds->isNotEmpty()) {
                MonitoringRecord::whereIn('plantation_record_id', $plantationIds)->delete();
                PlantationRecord::whereIn('id', $plantationIds)->delete();
            }

            if ($siteIds->isNotEmpty()) {
                EcosystemRecord::whereIn('restoration_site_id', $siteIds)->delete();
                RestorationSite::withTrashed()
                    ->whereIn('id', $siteIds)
                    ->update(['planted_hectares' => 0]);
            }

            $counts = [
                'sites_preserved' => $siteIds->count(),
                'plantation_records_deleted' => $plantations->count(),
                'monitoring_records_deleted' => $monitoringCount,
                'ecosystem_records_deleted' => $ecosystemCount,
                'planted_area_values_reset' => $plantedAreaSites,
            ];
            ActivityLog::record('restoration.analytics_reset', null, [], $counts);

            return [
                ...$counts,
                'public_ids' => $plantations->pluck('image_public_id')->filter()->unique()->values()->all(),
            ];
        });

        $mediaCleanupFailed = false;
        foreach ($result['public_ids'] as $publicId) {
            try {
                if (! $this->cloudinary->delete($publicId)) {
                    $mediaCleanupFailed = true;
                    Log::warning('Restoration analytics reset left a plantation image in storage.', [
                        'public_id' => $publicId,
                    ]);
                }
            } catch (\Throwable $exception) {
                $mediaCleanupFailed = true;
                Log::warning('Restoration analytics reset could not remove a plantation image.', [
                    'public_id' => $publicId,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        unset($result['public_ids']);

        return response()->json([
            'message' => 'Restoration activity data was cleared. Site records and site areas were preserved.',
            ...$result,
            'media_cleanup_failed' => $mediaCleanupFailed,
        ]);
    }

    /** menro / admin — full analytics for a site */
    public function show(RestorationSite $restorationSite, Request $request): JsonResponse
    {
        if ($request->user()?->role === 'field_worker' && (int) $restorationSite->assigned_to !== (int) $request->user()->id) {
            abort(403, 'You can only view analytics for your assigned site.');
        }
        $ecosystemAvgs = $this->analytics->ecosystemMonthlyAverages($restorationSite->id);

        try {
            $eventAccomplishments = \App\Models\EventAccomplishmentReport::with([
                'event:id,name,scheduled_at',
                'user:id,name',
                'species:id,scientific_name,local_name',
                'report.updates.updater:id,name',
            ])
                ->where('restoration_site_id', $restorationSite->id)
                ->latest('submitted_at')
                ->get();
        } catch (\Throwable $e) {
            $eventAccomplishments = [];
        }

        return response()->json([
            'site'                       => $restorationSite->load('speciesList:id,scientific_name,local_name'),
            'survival_rate'              => $this->analytics->survivalRate($restorationSite->id),
            'survival_by_species'        => $this->analytics->survivalBySpecies($restorationSite->id),
            'growth_stage_distribution'  => $this->analytics->growthStageDistribution($restorationSite->id),
            'species_distribution'       => $this->analytics->speciesDistribution($restorationSite->id),
            'monthly_growth_trend'       => $this->analytics->monthlyGrowthTrend($restorationSite->id),
            'ecosystem_monthly_avgs'     => $ecosystemAvgs,
            'ecosystem_monthly_averages' => $ecosystemAvgs,
            'event_accomplishments'      => $eventAccomplishments,
        ]);
    }

    /** Bantay Bakawan: the one site assigned to the authenticated worker. */
    public function mine(Request $request): JsonResponse
    {
        $site = RestorationSite::where('assigned_to', $request->user()->id)->first();
        if (! $site) {
            return response()->json(['site' => null]);
        }
        return $this->show($site, $request);
    }

    /** menro / admin — predictive growth forecast for a site */
    public function predictGrowth(RestorationSite $restorationSite, Request $request): JsonResponse
    {
        if ($request->user()?->role === 'field_worker' && (int) $restorationSite->assigned_to !== (int) $request->user()->id) abort(403);
        $monthsAhead = (int) $request->get('months_ahead', 6);
        $monthsAhead = min(max($monthsAhead, 1), 24); // clamp 1–24

        $result = $this->analytics->predictGrowth($restorationSite->id, $monthsAhead);

        return response()->json($result ?? ['error' => 'Prediction unavailable.']);
    }
}

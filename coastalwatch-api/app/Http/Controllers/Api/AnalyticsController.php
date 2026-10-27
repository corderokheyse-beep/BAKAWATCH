<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestorationSite;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

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

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Services\CloudinaryService;
use App\Services\GeoVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlantationRecordController extends Controller
{
    public function __construct(
        private GeoVerificationService $geoService,
        private CloudinaryService $cloudinary
    ) {}

    /** field_worker / volunteer — submit a plantation record */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restoration_site_id' => 'required|exists:restoration_sites,id',
            'species_name'        => 'required|string|max:255',
            'date_planted'        => 'required|date|before_or_equal:' . now()->addDays(7)->toDateString(),
            // New submissions must use one of the canonical sources. Legacy
            // free-text values remain in the DB and are displayed as-is; only
            // this (form-driven) endpoint is constrained. CSV imports go
            // through IntegrationService and are not affected by this rule.
            'seedling_source'     => 'required|string|in:Provincial,PENRO,Nursery',
            'latitude'            => 'required|numeric|between:-90,90',
            'longitude'           => 'required|numeric|between:-180,180',
            'image'               => 'nullable|image|mimes:jpeg,png,webp|max:10240',
            // GPS provenance + geofence override + replacement metadata
            'gps_source'          => 'nullable|in:gps,manual',
            'gps_accuracy_m'      => 'nullable|numeric|min:0|max:100000',
            'geo_override_reason' => 'nullable|string|max:1000',
            'is_replacement'      => 'nullable|boolean',
            'client_key'          => 'nullable|uuid',
        ]);

        // Idempotency: if this offline draft was already synced, return the
        // existing record instead of creating a duplicate.
        if (! empty($validated['client_key'])) {
            $existing = PlantationRecord::where('client_key', $validated['client_key'])->first();
            if ($existing) {
                return response()->json(array_merge($existing->toArray(), [
                    'record'    => $existing,
                    'warning'   => null,
                    'duplicate' => true,
                ]), 200);
            }
        }

        $site = RestorationSite::findOrFail($validated['restoration_site_id']);

        if ($site->status === 'inactive') {
            return response()->json(['message' => 'This restoration site is currently inactive.'], 422);
        }

        // Geo-verification. An out-of-boundary observation is NEVER silently
        // rejected — it is accepted and flagged for reviewer attention. If the
        // submitter supplied an override reason, we record it as an authorized
        // override so reviewers understand why it was submitted off-boundary.
        $withinSite   = $this->geoService->isWithinSite(
            (float) $validated['latitude'],
            (float) $validated['longitude'],
            $site
        );

        $geoMismatch  = ! $withinSite;
        $overrideReason = trim((string) ($validated['geo_override_reason'] ?? '')) ?: null;
        $geoOverride  = $geoMismatch && $overrideReason !== null;

        // Manually-entered coordinates are marked unverified until reviewed.
        $gpsSource        = $validated['gps_source'] ?? 'gps';
        $locationVerified = $gpsSource !== 'manual';

        // Off-boundary records are flagged for review regardless of override;
        // the override just attaches a recorded justification.
        $status = $geoMismatch ? 'flagged' : 'active';

        // Optional image upload — skip silently if Cloudinary is not configured
        $imageUrl      = null;
        $imagePublicId = null;
        if ($request->hasFile('image') && $request->file('image')->isValid()) {
            try {
                $result = $this->cloudinary->upload($request->file('image'), 'plantation-records');
                $imageUrl      = $result['secure_url'] ?? null;
                $imagePublicId = $result['public_id']  ?? null;
            } catch (\Throwable $e) {
                // Log but don't fail — image upload is optional
                \Illuminate\Support\Facades\Log::warning('Plantation image upload skipped: ' . $e->getMessage());
            }
        }

        $record = PlantationRecord::create([
            'restoration_site_id' => $site->id,
            'submitted_by'        => $request->user()->id,
            'species_name'        => $validated['species_name'],
            'date_planted'        => $validated['date_planted'],
            'seedling_source'     => $validated['seedling_source'] ?? null,
            'latitude'            => $validated['latitude'],
            'longitude'           => $validated['longitude'],
            'status'              => $status,
            'geo_mismatch'        => $geoMismatch,
            'geo_override'        => $geoOverride,
            'geo_override_reason' => $overrideReason,
            'gps_source'          => $gpsSource,
            'gps_accuracy_m'      => $validated['gps_accuracy_m'] ?? null,
            'is_replacement'      => (bool) ($validated['is_replacement'] ?? false),
            'location_verified'   => $locationVerified,
            'client_key'          => $validated['client_key'] ?? null,
            'image_url'           => $imageUrl,
            'image_public_id'     => $imagePublicId,
        ]);

        // Store PostGIS point (PostgreSQL only)
        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement(
                "UPDATE plantation_records
                 SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)
                 WHERE id = ?",
                [$validated['longitude'], $validated['latitude'], $record->id]
            ); } catch (\Exception $e) {}
        }

        ActivityLog::record('plantation_record.created', $record, [], $record->toArray());

        // Surface a boundary warning so the client can inform the field user
        // that the record was accepted but flagged for review.
        $warning = $geoMismatch
            ? ($geoOverride
                ? 'Recorded outside the site boundary. Your override reason was saved; this record is flagged for reviewer verification.'
                : 'This location appears to be outside the assigned site boundary. The record was accepted and flagged for review.')
            : null;

        // Response contract: the record fields are returned at the top level
        // (so `id` etc. remain directly accessible), with the warning + a
        // convenience `record` alias added alongside.
        $payload = array_merge($record->toArray(), [
            'record'  => $record,
            'warning' => $warning,
        ]);

        return response()->json($payload, 201);
    }

    /** field_worker / volunteer — own records */
    public function mine(Request $request): JsonResponse
    {
        $records = PlantationRecord::with('site:id,name')
            ->where('submitted_by', $request->user()->id)
            ->orderBy('date_planted', 'desc')
            ->get();

        return response()->json($records);
    }

    /** menro / admin — all records for a site */
    public function bySite(RestorationSite $restorationSite): JsonResponse
    {
        $records = PlantationRecord::with('submitter:id,name')
            ->where('restoration_site_id', $restorationSite->id)
            ->orderBy('date_planted', 'desc')
            ->get();

        return response()->json($records);
    }
}

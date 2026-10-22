<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\EcosystemRecord;
use App\Models\RestorationSite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EcosystemRecordController extends Controller
{
    /** field_worker — submit an ecosystem record */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restoration_site_id' => 'required|exists:restoration_sites,id',
            'measurement_date'    => 'required|date|before_or_equal:' . now()->addDays(7)->toDateString(),
            'soil_salinity_ppt'   => 'required|numeric|min:0',
            'water_ph'            => 'required|numeric|between:0,14',
            'water_temp_celsius'  => 'required|numeric',
            'tidal_condition'     => 'required|in:low,mid,high,storm',
            'latitude'            => 'nullable|numeric|between:-90,90',
            'longitude'           => 'nullable|numeric|between:-180,180',
            'client_key'          => 'nullable|uuid',
        ]);

        // Idempotency for offline sync — same key returns the existing record.
        if (! empty($validated['client_key'])) {
            $existing = EcosystemRecord::where('client_key', $validated['client_key'])->first();
            if ($existing) {
                return response()->json(array_merge($existing->toArray(), ['duplicate' => true]), 200);
            }
        }

        $record = EcosystemRecord::create([
            'restoration_site_id' => $validated['restoration_site_id'],
            'submitted_by'        => $request->user()->id,
            'measurement_date'    => $validated['measurement_date'],
            'soil_salinity_ppt'   => $validated['soil_salinity_ppt'],
            'water_ph'            => $validated['water_ph'],
            'water_temp_celsius'  => $validated['water_temp_celsius'],
            'tidal_condition'     => $validated['tidal_condition'],
            'latitude'            => $validated['latitude'] ?? null,
            'longitude'           => $validated['longitude'] ?? null,
            'client_key'          => $validated['client_key'] ?? null,
        ]);

        // Store PostGIS point if coordinates provided (skip on SQLite — no PostGIS support)
        if (!empty($validated['latitude']) && !empty($validated['longitude']) && DB::getDriverName() !== 'sqlite') {
            try { DB::statement(
                "UPDATE ecosystem_records
                 SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)
                 WHERE id = ?",
                [$validated['longitude'], $validated['latitude'], $record->id]
            ); } catch (\Exception $e) {}
        }

        ActivityLog::record('ecosystem_record.created', $record, [], $record->toArray());

        return response()->json($record, 201);
    }

    /** menro / admin — all ecosystem records for a site */
    public function bySite(RestorationSite $restorationSite): JsonResponse
    {
        $records = EcosystemRecord::with('submitter:id,name')
            ->where('restoration_site_id', $restorationSite->id)
            ->orderBy('measurement_date', 'desc')
            ->get();

        return response()->json($records);
    }
}

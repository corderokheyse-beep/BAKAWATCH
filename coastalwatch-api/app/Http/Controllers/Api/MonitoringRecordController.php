<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MonitoringRecordController extends Controller
{
    /** field_worker — own submitted monitoring records */
    public function mine(Request $request): JsonResponse
    {
        $records = MonitoringRecord::with('plantationRecord:id,species_name,restoration_site_id,date_planted')
            ->where('submitted_by', $request->user()->id)
            ->orderBy('monitoring_date', 'desc')
            ->get();

        return response()->json($records);
    }

    /** field_worker — submit a monitoring record */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'plantation_record_id' => 'required|exists:plantation_records,id',
            'monitoring_date'      => 'required|date|before_or_equal:' . now()->addDays(7)->toDateString(),
            'height_cm'            => 'required|numeric|min:0',
            'diameter_cm'          => 'required|numeric|min:0',
            'survival_status'      => 'required|in:alive,dead',
            'growth_stage'         => 'required|in:seedling,sapling,juvenile,mature',
            'disease_observation'  => 'nullable|string',
            'latitude'             => 'required|numeric|between:-90,90',
            'longitude'            => 'required|numeric|between:-180,180',
            'client_key'           => 'nullable|uuid',
        ]);

        // Idempotency: an offline draft re-synced with the same key returns the
        // existing record instead of creating a duplicate.
        if (! empty($validated['client_key'])) {
            $existing = MonitoringRecord::where('client_key', $validated['client_key'])->first();
            if ($existing) {
                return response()->json(array_merge($existing->toArray(), ['duplicate' => true]), 200);
            }
        }

        $record = MonitoringRecord::create([
            'plantation_record_id' => $validated['plantation_record_id'],
            'submitted_by'         => $request->user()->id,
            'monitoring_date'      => $validated['monitoring_date'],
            'height_cm'            => $validated['height_cm'],
            'diameter_cm'          => $validated['diameter_cm'],
            'survival_status'      => $validated['survival_status'],
            'growth_stage'         => $validated['growth_stage'],
            'disease_observation'  => $validated['disease_observation'] ?? null,
            'latitude'             => $validated['latitude'],
            'longitude'            => $validated['longitude'],
            'client_key'           => $validated['client_key'] ?? null,
        ]);

        // Store PostGIS point (skip on SQLite — test environment)
        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement(
                "UPDATE monitoring_records
                 SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)
                 WHERE id = ?",
                [$validated['longitude'], $validated['latitude'], $record->id]
            ); } catch (\Exception $e) {}
        }

        // If dead, set mortality_date on the plantation record
        if ($validated['survival_status'] === 'dead') {
            PlantationRecord::where('id', $validated['plantation_record_id'])
                ->update([
                    'mortality_date' => $validated['monitoring_date'],
                    'status'         => 'dead',
                ]);
        }

        ActivityLog::record('monitoring_record.created', $record, [], $record->toArray());

        return response()->json($record, 201);
    }

    /** menro / admin — all monitoring records for a site */
    public function bySite(RestorationSite $restorationSite): JsonResponse
    {
        $records = MonitoringRecord::with('plantationRecord:id,species_name,restoration_site_id')
            ->whereHas('plantationRecord', fn($q) =>
                $q->where('restoration_site_id', $restorationSite->id)
            )
            ->orderBy('monitoring_date', 'desc')
            ->get();

        return response()->json($records);
    }
}

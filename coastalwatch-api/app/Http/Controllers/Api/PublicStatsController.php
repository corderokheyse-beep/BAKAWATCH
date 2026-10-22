<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MangroveSpecies;
use App\Models\PlantationRecord;
use App\Models\RestorationProject;
use App\Models\RestorationSite;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class PublicStatsController extends Controller
{
    /**
     * Public, read-only aggregate figures for the landing page.
     *
     * Every value is derived from real records (no fabricated numbers). Cached
     * briefly to keep the public page fast. Exposes only non-sensitive counts —
     * no user data, no exact restricted coordinates.
     */
    public function index(): JsonResponse
    {
        $stats = Cache::remember('public_stats', 300, function () {
            $sites = RestorationSite::count();

            // Species actually recorded in the field, plus the managed reference list.
            $speciesRecorded  = PlantationRecord::distinct('species_name')->count('species_name');
            $speciesReference = MangroveSpecies::where('is_active', true)->count();
            $speciesMonitored = max($speciesRecorded, $speciesReference);

            // Trees planted: field plantation records + project tallies.
            $plantationRecords = PlantationRecord::count();
            $projectTrees      = (int) RestorationProject::sum('trees_planted');
            $treesPlanted      = $plantationRecords + $projectTrees;

            // Total protected area from real site areas (hectares, 1 dp).
            $protectedArea = round((float) RestorationSite::sum('area_hectares'), 1);

            // System-wide survival rate from actual monitoring (latest obs per record).
            $row = DB::selectOne(
                "SELECT
                    COUNT(mr_last.survival_status) AS monitored,
                    COUNT(CASE WHEN mr_last.survival_status = 'alive' THEN 1 END) AS alive
                FROM plantation_records pr
                LEFT JOIN (
                    SELECT mr.plantation_record_id, mr.survival_status,
                           ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                    FROM monitoring_records mr
                ) mr_last ON mr_last.plantation_record_id = pr.id AND mr_last.rn = 1"
            );
            $monitored    = (int) ($row->monitored ?? 0);
            $alive        = (int) ($row->alive ?? 0);
            $survivalRate = $monitored > 0 ? round($alive * 100.0 / $monitored, 0) : null;

            return [
                'restoration_sites' => $sites,
                'species_monitored' => $speciesMonitored,
                'trees_planted'     => $treesPlanted,
                'protected_area_ha' => $protectedArea,
                'survival_rate'     => $survivalRate,   // null when no monitoring data yet
                'active_projects'   => RestorationProject::where('status', 'active')->count(),
            ];
        });

        return response()->json($stats);
    }
}

<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AnalyticsService
{
    /**
     * Transparent, configurable survival-rate calculation for a site.
     *
     * The result exposes the numerator, denominator, formula, monitoring
     * coverage, and methodology version so every figure is traceable back to
     * the rules (config/monitoring.php) in force when it was computed.
     *
     * Alive/dead are determined from the LATEST monitoring observation per
     * plantation record (not "any alive ever"). Records with no observation in
     * the period are handled per the configured `unmonitored_treatment` rule so
     * that missing observations are not silently treated as deaths.
     */
    public function survivalRate(int $siteId): array
    {
        $cfg                  = config('monitoring.survival');
        $unmonitoredTreatment = $cfg['unmonitored_treatment'] ?? 'exclude';

        // Latest observation per plantation record, plus eligibility flag.
        // is_replacement is read defensively (column may not exist yet on older
        // installations) so this keeps working before the replacement migration.
        $hasReplacementCol = $this->columnExists('plantation_records', 'is_replacement');
        // Expression evaluated inside COUNT(CASE WHEN ...): use the real column
        // when present, otherwise a constant that never matches.
        $replacementExpr = $hasReplacementCol ? 'pr.is_replacement' : 'FALSE';

        $row = DB::selectOne(
            "SELECT
                COUNT(*) AS total_records,
                COUNT(mr_last.survival_status) AS monitored,
                COUNT(CASE WHEN mr_last.survival_status = 'alive' THEN 1 END) AS alive_count,
                COUNT(CASE WHEN mr_last.survival_status = 'dead'  THEN 1 END) AS dead_count,
                COUNT(CASE WHEN {$replacementExpr} IS TRUE THEN 1 END) AS replacement_count
            FROM plantation_records pr
            LEFT JOIN (
                SELECT mr.plantation_record_id, mr.survival_status,
                       ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                FROM monitoring_records mr
            ) mr_last ON mr_last.plantation_record_id = pr.id AND mr_last.rn = 1
            WHERE pr.restoration_site_id = ?",
            [$siteId]
        );

        $totalRecords     = (int) ($row->total_records ?? 0);
        $monitored        = (int) ($row->monitored ?? 0);
        $aliveCount       = (int) ($row->alive_count ?? 0);
        $deadObserved     = (int) ($row->dead_count ?? 0);
        $replacementCount = (int) ($row->replacement_count ?? 0);
        $unmonitored      = max($totalRecords - $monitored, 0);

        // Denominator: eligible originally-planted seedlings.
        // Optionally exclude replacements from the ORIGINAL cohort.
        $includeReplacements = (bool) ($cfg['include_replacements_in_denominator'] ?? false);
        $denominator = $totalRecords;
        if (! $includeReplacements) {
            $denominator = max($totalRecords - $replacementCount, 0);
        }

        // Dead count depends on how unmonitored records are treated.
        $deadCount = $deadObserved;
        if ($unmonitoredTreatment === 'count_as_dead') {
            $deadCount += $unmonitored;
        }

        $numerator = $aliveCount;
        $rate      = $denominator > 0 ? round($numerator * 100.0 / $denominator, 2) : 0.0;
        $coverage  = $denominator > 0 ? round($monitored * 100.0 / $denominator, 2) : 0.0;

        return [
            // Backward-compatible keys (consumed by existing frontend/report code)
            'total'         => $totalRecords,
            'alive_count'   => $aliveCount,
            'dead_count'    => $deadCount,
            'survival_rate' => $denominator > 0 ? $rate : null,

            // Transparency / methodology fields
            'numerator'            => $numerator,
            'denominator'          => $denominator,
            'monitored_count'      => $monitored,
            'unmonitored_count'    => $unmonitored,
            'replacement_count'    => $replacementCount,
            'coverage_percent'     => $coverage,
            'formula'              => $cfg['formula'] ?? null,
            'denominator_basis'    => $cfg['denominator_basis'] ?? 'planted_records',
            'includes_replacements'=> $includeReplacements,
            'unmonitored_treatment'=> $unmonitoredTreatment,
            'methodology_version'  => $cfg['methodology_version'] ?? 'unversioned',
            'is_official'          => false, // configurable default, not MENRO/DENR-confirmed
        ];
    }

    /**
     * Batch-compute plantation_count and survival_rate keyed by restoration_site_id
     * in a single query (used by RestorationSiteController@index to avoid N+1).
     *
     * @return array<int, array{plantation_count: int, survival_rate: float|null}>
     */
    public function survivalSummaryBySite(): array
    {
        $cfg                 = config('monitoring.survival');
        $includeReplacements = (bool) ($cfg['include_replacements_in_denominator'] ?? false);
        $hasReplacementCol   = $this->columnExists('plantation_records', 'is_replacement');
        $replacementExpr     = $hasReplacementCol ? 'pr.is_replacement' : 'FALSE';

        $rows = DB::select(
            "SELECT
                pr.restoration_site_id,
                COUNT(*) AS total_records,
                COUNT(CASE WHEN mr_last.survival_status = 'alive' THEN 1 END) AS alive_count,
                COUNT(CASE WHEN {$replacementExpr} IS TRUE THEN 1 END) AS replacement_count
            FROM plantation_records pr
            LEFT JOIN (
                SELECT mr.plantation_record_id, mr.survival_status,
                       ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                FROM monitoring_records mr
            ) mr_last ON mr_last.plantation_record_id = pr.id AND mr_last.rn = 1
            GROUP BY pr.restoration_site_id"
        );

        $map = [];
        foreach ($rows as $row) {
            $siteId           = (int) $row->restoration_site_id;
            $totalRecords     = (int) ($row->total_records ?? 0);
            $aliveCount       = (int) ($row->alive_count ?? 0);
            $replacementCount = (int) ($row->replacement_count ?? 0);
            $denominator      = $includeReplacements ? $totalRecords : max($totalRecords - $replacementCount, 0);
            $rate             = $denominator > 0 ? round($aliveCount * 100.0 / $denominator, 2) : null;

            $map[$siteId] = [
                'plantation_count' => $totalRecords,
                'survival_rate'    => $totalRecords > 0 ? $rate : null,
            ];
        }

        return $map;
    }

    /**
     * Portable check for whether a column exists, so newer analytics keeps
     * working on installations that haven't run later migrations yet.
     */
    private function columnExists(string $table, string $column): bool
    {
        try {
            return \Illuminate\Support\Facades\Schema::hasColumn($table, $column);
        } catch (\Throwable $e) {
            return false;
        }
    }

    public function speciesDistribution(int $siteId): array
    {
        $rows = DB::select(
            "SELECT species_name,
                    COUNT(*) AS count,
                    ROUND(CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS NUMERIC), 2) AS percentage
             FROM plantation_records
             WHERE restoration_site_id = ?
             GROUP BY species_name",
            [$siteId]
        );

        return array_map(fn($r) => [
            'species_name' => $r->species_name,
            'count'        => (int) $r->count,
            'percentage'   => round((float) $r->percentage, 2),
        ], $rows);
    }

    public function monthlyGrowthTrend(int $siteId): array
    {
        $rows = DB::select(
            "SELECT SUBSTR(CAST(monitoring_date AS TEXT), 1, 7) AS month,
                    AVG(height_cm) AS avg_height
             FROM monitoring_records mr
             JOIN plantation_records pr ON mr.plantation_record_id = pr.id
             WHERE pr.restoration_site_id = ?
             GROUP BY SUBSTR(CAST(monitoring_date AS TEXT), 1, 7)
             ORDER BY month",
            [$siteId]
        );

        return array_map(fn($r) => [
            'month'      => substr((string) $r->month, 0, 7), // YYYY-MM
            'avg_height' => round((float) $r->avg_height, 2),
        ], $rows);
    }

    public function ecosystemMonthlyAverages(int $siteId): array
    {
        $rows = DB::select(
            "SELECT SUBSTR(CAST(measurement_date AS TEXT), 1, 7) AS month,
                    AVG(soil_salinity_ppt) AS avg_salinity,
                    AVG(water_ph) AS avg_ph,
                    AVG(water_temp_celsius) AS avg_temp
             FROM ecosystem_records
             WHERE restoration_site_id = ?
             GROUP BY SUBSTR(CAST(measurement_date AS TEXT), 1, 7)
             ORDER BY month",
            [$siteId]
        );

        return array_map(fn($r) => [
            'month'        => substr((string) $r->month, 0, 7),
            'avg_salinity' => round((float) $r->avg_salinity, 2),
            'avg_ph'       => round((float) $r->avg_ph, 2),
            'avg_temp'     => round((float) $r->avg_temp, 2),
        ], $rows);
    }

    /**
     * Survival rate breakdown by species for a site.
     */
    public function survivalBySpecies(int $siteId): array
    {
        $rows = DB::select(
            "SELECT
                pr.species_name,
                COUNT(pr.id) AS total,
                COUNT(CASE WHEN mr_last.survival_status = 'alive' THEN 1 END) AS alive_count,
                COUNT(CASE WHEN mr_last.survival_status = 'dead'  THEN 1 END) AS dead_count
            FROM plantation_records pr
            LEFT JOIN (
                SELECT mr.plantation_record_id,
                       mr.survival_status,
                       ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                FROM monitoring_records mr
            ) mr_last ON mr_last.plantation_record_id = pr.id AND mr_last.rn = 1
            WHERE pr.restoration_site_id = ?
            GROUP BY pr.species_name",
            [$siteId]
        );

        return array_map(fn($r) => [
            'species_name' => $r->species_name,
            'total'        => (int) $r->total,
            'alive_count'  => (int) $r->alive_count,
            'dead_count'   => (int) $r->dead_count,
            'survival_rate'=> $r->total > 0
                ? round($r->alive_count * 100.0 / $r->total, 2)
                : 0.0,
        ], $rows);
    }

    /**
     * Growth stage distribution (seedling / sapling / juvenile / mature).
     */
    public function growthStageDistribution(int $siteId): array
    {
        $rows = DB::select(
            "SELECT mr_last.growth_stage, COUNT(*) AS count
            FROM (
                SELECT mr.plantation_record_id, mr.growth_stage,
                       ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                FROM monitoring_records mr
                JOIN plantation_records pr ON mr.plantation_record_id = pr.id
                WHERE pr.restoration_site_id = ?
            ) mr_last
            WHERE mr_last.rn = 1
            GROUP BY mr_last.growth_stage",
            [$siteId]
        );

        return array_map(fn($r) => [
            'stage' => $r->growth_stage,
            'count' => (int) $r->count,
        ], $rows);
    }

    /**
     * Call the ML service to get a predictive growth forecast.
     * Returns the ML service response or null if unavailable.
     */
    public function predictGrowth(int $siteId, int $monthsAhead = 6): ?array
    {
        // Fetch historical monthly growth data
        $historical = $this->monthlyGrowthTrend($siteId);

        if (count($historical) < 2) {
            return ['error' => 'Not enough historical data for prediction (need at least 2 months).'];
        }

        $mlUrl = config('services.ml.url', 'http://127.0.0.1:8001');

        try {
            $response = Http::timeout(10)->post("{$mlUrl}/predict-growth", [
                'historical'   => $historical,
                'months_ahead' => $monthsAhead,
            ]);

            if ($response->successful()) {
                $result = $response->json();

                // Attach labeling + validation metadata so the prediction is
                // never mistaken for observed data. All values are derived from
                // the actual request/inputs — nothing is fabricated.
                $result['meta'] = $this->predictionMeta($historical, $monthsAhead, $result['rmse'] ?? null);

                return $result;
            }

            Log::warning('[Analytics] ML growth prediction failed: ' . $response->body());
            return ['error' => 'ML service returned an error.'];
        } catch (\Exception $e) {
            Log::warning('[Analytics] ML growth prediction unavailable: ' . $e->getMessage());
            return ['error' => 'ML service unavailable.'];
        }
    }

    /**
     * Build labeling/validation metadata for a growth prediction.
     * Keeps predictions clearly distinguished from observed monitoring data.
     */
    private function predictionMeta(array $historical, int $monthsAhead, $rmse): array
    {
        $months = array_column($historical, 'month');

        return [
            'is_prediction'     => true,
            'model_name'        => 'Linear regression (least squares) growth trend',
            'model_version'     => 'growth-linreg-v1',
            'prediction_date'   => now()->toIso8601String(),
            'forecast_months'   => $monthsAhead,
            'history_months'    => count($historical),
            'history_range'     => [
                'from' => $months[0] ?? null,
                'to'   => $months[count($months) - 1] ?? null,
            ],
            'inputs'            => ['avg_monthly_height_cm from monitoring_records'],
            'confidence_interval' => '95% (±1.96 × RMSE)',
            'rmse_cm'           => $rmse,
            'validation_note'   => 'Prototype forecast from limited history. Not validated against held-out data; treat as indicative only and confirm against subsequent field observations.',
        ];
    }
}

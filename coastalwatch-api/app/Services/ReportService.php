<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class ReportService
{
    public function __construct(private AnalyticsService $analytics) {}

    // SQLite-compatible AVG rounding — avoids PostgreSQL ::numeric cast
    private function avgRound(string $col, int $decimals = 2): string
    {
        return "ROUND(CAST(AVG({$col}) AS REAL), {$decimals})";
    }

    /**
     * Generate a monthly report for a site (YYYY-MM format).
     * If siteId is 0 or null, aggregates across all sites.
     */
    public function generateMonthly(int $siteId, string $yearMonth): array
    {
        $dateFrom = "{$yearMonth}-01";
        $dateTo   = date('Y-m-t', strtotime($dateFrom)); // last day of month

        $survival = $siteId > 0
            ? $this->analytics->survivalRate($siteId)
            : $this->survivalRateForRange($dateFrom, $dateTo);

        $speciesQuery = $siteId > 0
            ? "SELECT species_name, COUNT(*) AS count
               FROM plantation_records
               WHERE restoration_site_id = ?
                 AND date_planted BETWEEN ? AND ?
               GROUP BY species_name"
            : "SELECT species_name, COUNT(*) AS count
               FROM plantation_records
               WHERE date_planted BETWEEN ? AND ?
               GROUP BY species_name";

        $species = $siteId > 0
            ? DB::select($speciesQuery, [$siteId, $dateFrom, $dateTo])
            : DB::select($speciesQuery, [$dateFrom, $dateTo]);

        $avg = $this->avgRound('soil_salinity_ppt');
        $avgPh = $this->avgRound('water_ph');
        $avgTemp = $this->avgRound('water_temp_celsius');

        $ecoQuery = $siteId > 0
            ? "SELECT {$avg} AS avg_salinity,
                      {$avgPh} AS avg_ph,
                      {$avgTemp} AS avg_temp
               FROM ecosystem_records
               WHERE restoration_site_id = ?
                 AND measurement_date BETWEEN ? AND ?"
            : "SELECT {$avg} AS avg_salinity,
                      {$avgPh} AS avg_ph,
                      {$avgTemp} AS avg_temp
               FROM ecosystem_records
               WHERE measurement_date BETWEEN ? AND ?";

        $ecosystem = $siteId > 0
            ? DB::selectOne($ecoQuery, [$siteId, $dateFrom, $dateTo])
            : DB::selectOne($ecoQuery, [$dateFrom, $dateTo]);

        return [
            'report_type'       => 'monthly',
            'site_id'           => $siteId ?: null,
            'period'            => $yearMonth,
            'total_planted'     => $survival['total'],
            'total_alive'       => $survival['alive_count'],
            'total_dead'        => $survival['dead_count'],
            'survival_rate'     => $survival['survival_rate'],
            'species_breakdown' => array_map(fn($r) => [
                'species_name' => $r->species_name,
                'count'        => (int) $r->count,
            ], $species),
            'avg_salinity'      => (float) ($ecosystem->avg_salinity ?? 0),
            'avg_ph'            => (float) ($ecosystem->avg_ph ?? 0),
            'avg_temp'          => (float) ($ecosystem->avg_temp ?? 0),
        ];
    }

    /**
     * Survival rate across all sites for a date range.
     */
    private function survivalRateForRange(string $dateFrom, string $dateTo): array
    {
        $row = DB::selectOne(
            "SELECT COUNT(*) AS total,
                    COUNT(CASE WHEN EXISTS (
                        SELECT 1 FROM monitoring_records mr
                        WHERE mr.plantation_record_id = pr.id AND mr.survival_status = 'alive'
                    ) THEN 1 END) AS alive_count
             FROM plantation_records pr
             WHERE pr.date_planted BETWEEN ? AND ?",
            [$dateFrom, $dateTo]
        );
        $total = (int) ($row->total ?? 0);
        $alive = (int) ($row->alive_count ?? 0);
        return [
            'total'         => $total,
            'alive_count'   => $alive,
            'dead_count'    => $total - $alive,
            'survival_rate' => $total > 0 ? round($alive * 100.0 / $total, 2) : 0.0,
        ];
    }

    /**
     * Generate an LGU-wide report across all sites for a date range.
     */
    public function generateLgu(string $dateFrom, string $dateTo): array
    {
        $totals = DB::selectOne(
            "SELECT COUNT(*) AS total_planted,
                    COUNT(CASE WHEN EXISTS (
                        SELECT 1 FROM monitoring_records mr
                        WHERE mr.plantation_record_id = pr.id AND mr.survival_status = 'alive'
                    ) THEN 1 END) AS total_alive
             FROM plantation_records pr
             WHERE pr.date_planted BETWEEN ? AND ?",
            [$dateFrom, $dateTo]
        );

        $total   = (int) ($totals->total_planted ?? 0);
        $alive   = (int) ($totals->total_alive ?? 0);
        $dead    = $total - $alive;
        $rate    = $total > 0 ? round($alive * 100.0 / $total, 2) : 0.0;

        $species = DB::select(
            "SELECT species_name, COUNT(*) AS count
             FROM plantation_records
             WHERE date_planted BETWEEN ? AND ?
             GROUP BY species_name",
            [$dateFrom, $dateTo]
        );

        $avg = $this->avgRound('soil_salinity_ppt');
        $avgPh = $this->avgRound('water_ph');
        $avgTemp = $this->avgRound('water_temp_celsius');

        $ecosystem = DB::selectOne(
            "SELECT {$avg} AS avg_salinity,
                    {$avgPh} AS avg_ph,
                    {$avgTemp} AS avg_temp
             FROM ecosystem_records
             WHERE measurement_date BETWEEN ? AND ?",
            [$dateFrom, $dateTo]
        );

        return [
            'report_type'       => 'lgu',
            'date_from'         => $dateFrom,
            'date_to'           => $dateTo,
            'total_planted'     => $total,
            'total_alive'       => $alive,
            'total_dead'        => $dead,
            'survival_rate'     => $rate,
            'species_breakdown' => array_map(fn($r) => [
                'species_name' => $r->species_name,
                'count'        => (int) $r->count,
            ], $species),
            'avg_salinity'      => (float) ($ecosystem->avg_salinity ?? 0),
            'avg_ph'            => (float) ($ecosystem->avg_ph ?? 0),
            'avg_temp'          => (float) ($ecosystem->avg_temp ?? 0),
        ];
    }

    /**
     * Generate a DENR-template report for a specific site and date range.
     */
    public function generateDenr(int $siteId, string $dateFrom, string $dateTo): array
    {
        $survival = $this->analytics->survivalRate($siteId);

        $species = DB::select(
            "SELECT species_name, COUNT(*) AS count
             FROM plantation_records
             WHERE restoration_site_id = ?
               AND date_planted BETWEEN ? AND ?
             GROUP BY species_name",
            [$siteId, $dateFrom, $dateTo]
        );

        $avg = $this->avgRound('soil_salinity_ppt');
        $avgPh = $this->avgRound('water_ph');
        $avgTemp = $this->avgRound('water_temp_celsius');

        $ecosystem = DB::selectOne(
            "SELECT {$avg} AS avg_salinity,
                    {$avgPh} AS avg_ph,
                    {$avgTemp} AS avg_temp
             FROM ecosystem_records
             WHERE restoration_site_id = ?
               AND measurement_date BETWEEN ? AND ?",
            [$siteId, $dateFrom, $dateTo]
        );

        $site = DB::selectOne(
            "SELECT name, barangay, area_hectares, established_year FROM restoration_sites WHERE id = ?",
            [$siteId]
        );

        return [
            'report_type'       => 'denr',
            'site_id'           => $siteId,
            'site_name'         => $site->name ?? '',
            'barangay'          => $site->barangay ?? '',
            'area_hectares'     => (float) ($site->area_hectares ?? 0),
            'established_year'  => (int) ($site->established_year ?? 0),
            'date_from'         => $dateFrom,
            'date_to'           => $dateTo,
            'total_planted'     => $survival['total'],
            'total_alive'       => $survival['alive_count'],
            'total_dead'        => $survival['dead_count'],
            'survival_rate'     => $survival['survival_rate'],
            'species_breakdown' => array_map(fn($r) => [
                'species_name' => $r->species_name,
                'count'        => (int) $r->count,
            ], $species),
            'avg_salinity'      => (float) ($ecosystem->avg_salinity ?? 0),
            'avg_ph'            => (float) ($ecosystem->avg_ph ?? 0),
            'avg_temp'          => (float) ($ecosystem->avg_temp ?? 0),
        ];
    }

    /**
     * Generate a nursery management report from seedling_inventories.
     *
     * All figures are derived from real inventory rows (no static values):
     *   - totals: received / planted(transferred) / damaged / remaining stock
     *   - per-species breakdown (joined to mangrove_species for local names)
     *   - stage distribution (seedling / propagule / cutting)
     *   - per-source-nursery grouping
     *   - batch records (acts as the nursery activity log)
     *
     * Optional filters: site, date-received range, species.
     */
    public function generateNursery(int $siteId, ?string $dateFrom, ?string $dateTo, ?string $speciesName = null): array
    {
        $where   = [];
        $params  = [];
        if ($siteId > 0)          { $where[] = 'restoration_site_id = ?'; $params[] = $siteId; }
        if ($dateFrom)            { $where[] = 'date_received >= ?';       $params[] = $dateFrom; }
        if ($dateTo)              { $where[] = 'date_received <= ?';       $params[] = $dateTo; }
        if ($speciesName)         { $where[] = 'species_name = ?';         $params[] = $speciesName; }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        // ── Inventory totals ─────────────────────────────────────────────────
        $totals = DB::selectOne(
            "SELECT
                COALESCE(SUM(quantity_received), 0) AS total_received,
                COALESCE(SUM(quantity_planted), 0)  AS total_transferred,
                COALESCE(SUM(quantity_damaged), 0)  AS total_damaged,
                COALESCE(SUM(MAX(quantity_received - quantity_planted - quantity_damaged, 0)), 0) AS remaining_stock,
                COUNT(*) AS batch_count
             FROM seedling_inventories {$whereSql}",
            $params
        );

        $totalReceived    = (int) ($totals->total_received ?? 0);
        $totalTransferred = (int) ($totals->total_transferred ?? 0);
        $totalDamaged     = (int) ($totals->total_damaged ?? 0);
        $remainingStock   = (int) ($totals->remaining_stock ?? 0);

        // ── Per-species breakdown (local name from mangrove_species) ─────────
        // Full accounting: received = transferred + damaged + remaining.
        $species = DB::select(
            "SELECT si.species_name,
                    ms.local_name,
                    COALESCE(SUM(si.quantity_received), 0) AS received,
                    COALESCE(SUM(si.quantity_planted), 0)  AS transferred,
                    COALESCE(SUM(si.quantity_damaged), 0)  AS damaged,
                    COALESCE(SUM(MAX(si.quantity_received - si.quantity_planted - si.quantity_damaged, 0)), 0) AS remaining
             FROM seedling_inventories si
             LEFT JOIN mangrove_species ms ON ms.scientific_name = si.species_name
             {$whereSql}
             GROUP BY si.species_name, ms.local_name
             ORDER BY remaining DESC, received DESC",
            $params
        );

        // ── Stock composition by stage (seedling / propagule / cutting) ──────
        // This is the recorded NURSERY STOCK stage, not field growth monitoring.
        $stages = DB::select(
            "SELECT stage,
                    COALESCE(SUM(quantity_received), 0) AS received,
                    COALESCE(SUM(MAX(quantity_received - quantity_planted - quantity_damaged, 0)), 0) AS remaining,
                    COUNT(*) AS batches
             FROM seedling_inventories {$whereSql}
             GROUP BY stage
             ORDER BY received DESC",
            $params
        );

        // ── Per-source-nursery grouping (full accounting) ────────────────────
        $nurseries = DB::select(
            "SELECT COALESCE(NULLIF(source_nursery, ''), 'Unspecified') AS source,
                    COALESCE(SUM(quantity_received), 0) AS received,
                    COALESCE(SUM(quantity_planted), 0)  AS transferred,
                    COALESCE(SUM(quantity_damaged), 0)  AS damaged,
                    COALESCE(SUM(MAX(quantity_received - quantity_planted - quantity_damaged, 0)), 0) AS remaining
             FROM seedling_inventories {$whereSql}
             GROUP BY source
             ORDER BY received DESC",
            $params
        );

        // ── Batch records (acts as the nursery activity log) ─────────────────
        $recordsSql =
            "SELECT si.date_received, si.species_name, si.stage, si.quantity_received,
                    si.quantity_planted, si.quantity_damaged,
                    COALESCE(NULLIF(si.source_nursery, ''), 'Unspecified') AS source,
                    si.notes, u.name AS recorded_by
             FROM seedling_inventories si
             LEFT JOIN users u ON u.id = si.recorded_by
             {$whereSql}
             ORDER BY si.date_received DESC
             LIMIT 100";
        $records = DB::select($recordsSql, $params);

        $site = $siteId > 0
            ? DB::selectOne("SELECT name, barangay FROM restoration_sites WHERE id = ?", [$siteId])
            : null;

        // Only report a stock-composition breakdown when it carries information
        // (more than one stage present). Otherwise it's a meaningless 100% row.
        $stageRows = array_map(fn($r) => [
            'stage'     => $r->stage,
            'received'  => (int) $r->received,
            'remaining' => (int) $r->remaining,
            'batches'   => (int) $r->batches,
        ], $stages);
        $hasStockComposition = count($stageRows) > 1;

        return [
            'report_type'        => 'nursery',
            'site_id'            => $siteId ?: null,
            'site_name'          => $site->name ?? null,
            'barangay'           => $site->barangay ?? null,
            'scope'              => $siteId > 0 ? 'site' : 'municipality',
            'date_from'          => $dateFrom,
            'date_to'            => $dateTo,
            'species_filter'     => $speciesName,

            // ── Inventory summary (four clear, non-overlapping terms) ────────
            //   received  = total propagated/received into the nursery
            //   transferred = moved out to planting sites (quantity_planted)
            //   damaged   = lost/non-viable
            //   remaining = current available stock (received - transferred - damaged)
            'total_received'     => $totalReceived,
            'total_transferred'  => $totalTransferred,
            'total_damaged'      => $totalDamaged,
            'remaining_stock'    => $remainingStock,
            'batch_count'        => (int) ($totals->batch_count ?? 0),

            'species_breakdown'  => array_map(fn($r) => [
                'species_name' => $r->species_name,
                'local_name'   => $r->local_name,
                'received'     => (int) $r->received,
                'transferred'  => (int) $r->transferred,
                'damaged'      => (int) $r->damaged,
                'remaining'    => (int) $r->remaining,
            ], $species),

            // Nursery stock composition by stage (only when meaningful)
            'has_stock_composition' => $hasStockComposition,
            'stock_composition'  => $stageRows,

            'nursery_sources'    => array_map(fn($r) => [
                'source'      => $r->source,
                'received'    => (int) $r->received,
                'transferred' => (int) $r->transferred,
                'damaged'     => (int) $r->damaged,
                'remaining'   => (int) $r->remaining,
            ], $nurseries),

            'records'            => array_map(fn($r) => [
                'date_received'     => $r->date_received,
                'species_name'      => $r->species_name,
                'stage'             => $r->stage,
                'quantity_received' => (int) $r->quantity_received,
                'quantity_planted'  => (int) $r->quantity_planted,
                'quantity_damaged'  => (int) $r->quantity_damaged,
                'source'            => $r->source,
                'notes'             => $r->notes,
                'recorded_by'       => $r->recorded_by,
            ], $records),
        ];
    }

    /**
     * Monthly Mangrove Threat Monitoring report. Summarises threat cases in a
     * date range and includes each case's info, before/after photos, and full
     * monitoring timeline (status history + follow-up updates).
     */
    public function generateThreatMonitoring(string $dateFrom, string $dateTo, int $siteId = 0): array
    {
        $reports = \App\Models\Report::query()
            ->with(['user:id,name,role', 'updates.updater:id,name', 'statusHistory.changer:id,name'])
            ->whereDate('created_at', '>=', $dateFrom)
            ->whereDate('created_at', '<=', $dateTo)
            ->orderBy('created_at')
            ->get();

        // Status counts for the summary section.
        $counts = [
            'total'             => $reports->count(),
            'pending'           => $reports->where('status', 'pending')->count(),
            'under_review'      => $reports->where('status', 'under_review')->count(),
            'resolved'          => $reports->where('status', 'resolved')->count(),
        ];
        $counts['active'] = $counts['total'] - $counts['resolved'];

        $cases = $reports->map(function ($r) {
            $updates = $r->updates->sortByDesc('created_at')->values()->map(function ($u) {
                $fields = is_array($u->fields) ? $u->fields : [];
                $photos = collect($u->photos ?? [])
                    ->filter(fn ($photo) => is_array($photo) && !empty($photo['url']))
                    ->values();

                if ($photos->isEmpty() && $u->image_url) {
                    $photos->push(['url' => $u->image_url]);
                }

                return [
                    'id'          => $u->id,
                    'date'        => optional($u->update_date ?? $u->created_at)->toDateString(),
                    'recorded_at' => optional($u->created_at)->toIso8601String(),
                    'type'        => $u->type,
                    'fields'      => $fields,
                    'observation' => $u->observation ?: ($fields['notes'] ?? $fields['maintenance_remarks'] ?? null),
                    'action_taken'=> $u->action_taken,
                    'latitude'    => $u->latitude,
                    'longitude'   => $u->longitude,
                    'updated_by'  => $u->updater->name ?? 'Unknown',
                    'photos'      => $photos->all(),
                ];
            })->values();

            $latestPhoto = $updates
                ->first(fn ($update) => !empty($update['photos']))['photos'][0]['url'] ?? null;
            $timeline = $r->statusHistory->map(fn($h) => [
                'date'   => optional($h->created_at)->toDateString(),
                'recorded_at' => optional($h->created_at)->toIso8601String(),
                'label'  => 'Status: ' . $h->new_status,
                'note'   => $h->note,
            ])->concat($updates->map(fn($u) => [
                'date'   => $u['date'],
                'recorded_at' => $u['recorded_at'],
                'label'  => $u['fields']['threat_status'] ?? $u['fields']['health'] ?? ($u['type'] === 'growth_monitoring' ? 'Growth monitoring update' : 'Threat progress update'),
                'note'   => $u['observation'] ?? $u['fields']['next_step'] ?? $u['fields']['area_trend'] ?? null,
            ]))->sortByDesc('recorded_at')->values();

            return [
                'id'            => $r->id,
                'ref'           => sprintf('BW-THREAT-%s-%06d', optional($r->created_at)->format('Y'), $r->id),
                'title'         => $r->title,
                'threat_type'   => $r->threat_type,
                'category'      => $r->category,
                'severity'      => $r->severity,
                'description'   => $r->description,
                'location_name' => $r->location_name,
                'latitude'      => $r->latitude,
                'longitude'     => $r->longitude,
                'date_reported' => optional($r->created_at)->toDateString(),
                'reported_by'   => $r->user->name ?? 'Unknown',
                'reporter_role' => $r->user->role ?? null,
                'status'        => $r->status,
                'before_photo'  => $r->image_url,
                'after_photo'   => $latestPhoto,
                'updates'       => $updates->all(),
                'timeline'      => $timeline,
            ];
        })->values();

        return [
            'report_type' => 'threat_monitoring',
            'date_from'   => $dateFrom,
            'date_to'     => $dateTo,
            'period'      => date('F Y', strtotime($dateFrom)),
            'counts'      => $counts,
            'cases'       => $cases->all(),
        ];
    }

    /**
     * Export report data as a CSV string.
     */
    public function exportToCsv(array $reportData, string $reportType): string
    {
        // Nursery reports have a different shape — use a dedicated CSV layout.
        if ($reportType === 'nursery') {
            return $this->exportNurseryToCsv($reportData);
        }
        if ($reportType === 'threat_monitoring') {
            return $this->exportThreatMonitoringToCsv($reportData);
        }

        $lines = [];

        $lines[] = implode(',', [
            'Report Type', 'Period / Date Range',
            'Total Planted', 'Total Alive', 'Total Dead', 'Survival Rate (%)',
        ]);

        $period = $reportData['period']
            ?? (($reportData['date_from'] ?? '') . ' to ' . ($reportData['date_to'] ?? ''));

        $lines[] = implode(',', [
            $reportType,
            $period,
            $reportData['total_planted']  ?? 0,
            $reportData['total_alive']    ?? 0,
            $reportData['total_dead']     ?? 0,
            $reportData['survival_rate']  ?? 0,
        ]);

        if (!empty($reportData['species_breakdown'])) {
            $lines[] = '';
            $lines[] = 'Species Breakdown';
            $lines[] = 'Species Name,Count';
            foreach ($reportData['species_breakdown'] as $row) {
                $lines[] = implode(',', [
                    '"' . str_replace('"', '""', $row['species_name']) . '"',
                    $row['count'],
                ]);
            }
        }

        return implode("\n", $lines);
    }

    /** CSV layout for the monthly threat-monitoring report. */
    private function exportThreatMonitoringToCsv(array $d): string
    {
        $q = fn($v) => '"' . str_replace('"', '""', (string) $v) . '"';
        $lines = [];
        $lines[] = 'Mangrove Threat Monitoring Report';
        $lines[] = implode(',', ['Period', $q($d['period'] ?? '')]);
        $lines[] = '';

        $c = $d['counts'] ?? [];
        $lines[] = 'Summary';
        $lines[] = 'Total,Active,Under Observation,Recovering,Resolved,Rejected';
        $lines[] = implode(',', [
            $c['total'] ?? 0, $c['active'] ?? 0, $c['under_observation'] ?? 0,
            $c['recovering'] ?? 0, $c['resolved'] ?? 0, $c['rejected'] ?? 0,
        ]);
        $lines[] = '';

        $lines[] = 'Cases';
        $lines[] = 'Ref,Title,Threat Type,Severity,Location,Coordinates,Date Reported,Reported By,Status';
        foreach ($d['cases'] ?? [] as $case) {
            $coords = ($case['latitude'] ?? '') . ' ' . ($case['longitude'] ?? '');
            $lines[] = implode(',', [
                $q($case['ref']), $q($case['title']), $q($case['threat_type'] ?? ''),
                $q($case['severity'] ?? ''), $q($case['location_name'] ?? ''), $q($coords),
                $q($case['date_reported'] ?? ''), $q($case['reported_by'] ?? ''), $q($case['status'] ?? ''),
            ]);
        }
        return implode("\n", $lines);
    }

    /** CSV layout for the nursery report (seedling inventory shape). */
    private function exportNurseryToCsv(array $d): string
    {
        $q = fn($v) => '"' . str_replace('"', '""', (string) $v) . '"';
        $lines = [];

        $period = ($d['date_from'] ?? '') . ' to ' . ($d['date_to'] ?? '');
        $lines[] = 'Nursery Report';
        $lines[] = implode(',', ['Site', $q($d['site_name'] ?? 'All sites')]);
        $lines[] = implode(',', ['Period', $q($period)]);
        if (!empty($d['species_filter'])) {
            $lines[] = implode(',', ['Species Filter', $q($d['species_filter'])]);
        }
        $lines[] = '';

        $lines[] = implode(',', ['Scope', $q(($d['scope'] ?? '') === 'site' ? 'Site-specific' : 'Municipality-wide')]);
        $lines[] = '';

        $lines[] = 'Executive Summary (Inventory)';
        $lines[] = 'Total Received,Transferred,Damaged,Remaining Stock,Batches';
        $lines[] = implode(',', [
            $d['total_received']     ?? 0,
            $d['total_transferred']  ?? 0,
            $d['total_damaged']      ?? 0,
            $d['remaining_stock']    ?? 0,
            $d['batch_count']        ?? 0,
        ]);
        $lines[] = '';

        if (!empty($d['species_breakdown'])) {
            $lines[] = 'Species Inventory';
            $lines[] = 'Species,Local Name,Received,Transferred,Damaged,Remaining';
            foreach ($d['species_breakdown'] as $r) {
                $lines[] = implode(',', [
                    $q($r['species_name']), $q($r['local_name'] ?? ''),
                    $r['received'], $r['transferred'], $r['damaged'] ?? 0, $r['remaining'],
                ]);
            }
            // Totals row so figures reconcile to the summary.
            $lines[] = implode(',', [
                $q('TOTAL'), '',
                $d['total_received'] ?? 0, $d['total_transferred'] ?? 0,
                $d['total_damaged'] ?? 0, $d['remaining_stock'] ?? 0,
            ]);
            $lines[] = '';
        }

        if (!empty($d['has_stock_composition']) && !empty($d['stock_composition'])) {
            $lines[] = 'Stock Composition (by stage)';
            $lines[] = 'Stage,Received,Remaining,Batches';
            foreach ($d['stock_composition'] as $r) {
                $lines[] = implode(',', [$q($r['stage']), $r['received'], $r['remaining'], $r['batches']]);
            }
            $lines[] = '';
        }

        if (!empty($d['nursery_sources'])) {
            $lines[] = 'Source Nurseries';
            $lines[] = 'Source,Received,Transferred,Damaged,Remaining';
            foreach ($d['nursery_sources'] as $r) {
                $lines[] = implode(',', [
                    $q($r['source']), $r['received'], $r['transferred'] ?? 0, $r['damaged'] ?? 0, $r['remaining'],
                ]);
            }
            $lines[] = '';
        }

        if (!empty($d['records'])) {
            $lines[] = 'Nursery Records';
            $lines[] = 'Date,Species,Stage,Received,Transferred,Damaged,Source,Recorded By,Notes';
            foreach ($d['records'] as $r) {
                $lines[] = implode(',', [
                    $q($r['date_received']), $q($r['species_name']), $q($r['stage']),
                    $r['quantity_received'], $r['quantity_planted'], $r['quantity_damaged'],
                    $q($r['source']), $q($r['recorded_by'] ?? ''), $q($r['notes'] ?? ''),
                ]);
            }
        }

        return implode("\n", $lines);
    }
}

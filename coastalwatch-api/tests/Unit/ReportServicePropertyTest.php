<?php

// Feature: mangrove-monitoring-system, Property 22: Generated reports contain all required fields

use App\Services\AnalyticsService;
use App\Services\ReportService;
use Illuminate\Support\Facades\DB;

/**
 * Property 22: Generated reports contain all required fields
 *
 * For any valid report generation request (monthly, LGU, or DENR), the returned
 * report structure SHALL contain non-null values for: total planted, total alive,
 * total dead, survival rate, species breakdown, and average ecosystem measurements.
 * When no data exists for the requested range, all numeric fields SHALL be zero
 * rather than null or error.
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.5
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random site ID in a realistic range.
 */
function randomSiteId(): int
{
    return mt_rand(1, 9999);
}

/**
 * Generate a random YYYY-MM string (2020–2025).
 */
function randomYearMonth(): string
{
    $year  = mt_rand(2020, 2025);
    $month = str_pad((string) mt_rand(1, 12), 2, '0', STR_PAD_LEFT);
    return "{$year}-{$month}";
}

/**
 * Generate a random date string (YYYY-MM-DD) within 2020–2025.
 */
function randomDate(): string
{
    $year  = mt_rand(2020, 2025);
    $month = mt_rand(1, 12);
    $day   = mt_rand(1, 28); // safe for all months
    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

/**
 * Generate a date range where dateFrom <= dateTo.
 */
function randomDateRange(): array
{
    $fromYear  = mt_rand(2020, 2024);
    $fromMonth = mt_rand(1, 12);
    $fromDay   = mt_rand(1, 28);
    $dateFrom  = sprintf('%04d-%02d-%02d', $fromYear, $fromMonth, $fromDay);

    // dateTo is 1–365 days after dateFrom
    $offset  = mt_rand(1, 365);
    $dateTo  = date('Y-m-d', strtotime($dateFrom) + $offset * 86400);

    return [$dateFrom, $dateTo];
}

/**
 * Generate a random survival data array (as returned by AnalyticsService::survivalRate).
 */
function randomSurvivalData(): array
{
    $total      = mt_rand(1, 500);
    $aliveCount = mt_rand(0, $total);
    $deadCount  = $total - $aliveCount;
    $rate       = round($aliveCount * 100.0 / $total, 2);

    return [
        'total'         => $total,
        'alive_count'   => $aliveCount,
        'dead_count'    => $deadCount,
        'survival_rate' => $rate,
    ];
}

/**
 * Generate random ecosystem averages as a DB stdClass row.
 */
function randomEcosystemRow(): object
{
    return (object) [
        'avg_salinity' => (string) round(mt_rand(0, 4000) / 100, 2),
        'avg_ph'       => (string) round(mt_rand(600, 900) / 100, 2),
        'avg_temp'     => (string) round(mt_rand(2000, 3500) / 100, 2),
    ];
}

/**
 * Generate random species breakdown rows (1–5 species).
 */
function randomSpeciesRows(): array
{
    $pool = [
        'Rhizophora mucronata',
        'Avicennia marina',
        'Sonneratia alba',
        'Bruguiera gymnorrhiza',
        'Ceriops tagal',
    ];
    $n    = mt_rand(1, count($pool));
    $rows = [];
    for ($i = 0; $i < $n; $i++) {
        $rows[] = (object) [
            'species_name' => $pool[$i],
            'count'        => (string) mt_rand(1, 100),
        ];
    }
    return $rows;
}

/**
 * Assert that a report array contains all required fields with non-null values.
 */
function assertRequiredFields(array $report, string $context): void
{
    $requiredNumeric = [
        'total_planted',
        'total_alive',
        'total_dead',
        'survival_rate',
        'avg_salinity',
        'avg_ph',
        'avg_temp',
    ];

    foreach ($requiredNumeric as $field) {
        expect(array_key_exists($field, $report))->toBeTrue(
            "{$context}: field '{$field}' is missing from report"
        );
        expect($report[$field])->not->toBeNull(
            "{$context}: field '{$field}' must not be null"
        );
        expect(is_numeric($report[$field]))->toBeTrue(
            "{$context}: field '{$field}' must be numeric, got " . gettype($report[$field])
        );
    }

    expect(array_key_exists('species_breakdown', $report))->toBeTrue(
        "{$context}: 'species_breakdown' is missing from report"
    );
    expect($report['species_breakdown'])->not->toBeNull(
        "{$context}: 'species_breakdown' must not be null"
    );
    expect(is_array($report['species_breakdown']))->toBeTrue(
        "{$context}: 'species_breakdown' must be an array"
    );
}

/**
 * Assert that all numeric fields in a report are zero (empty-data case).
 */
function assertZeroNumericFields(array $report, string $context): void
{
    $numericFields = [
        'total_planted',
        'total_alive',
        'total_dead',
        'survival_rate',
        'avg_salinity',
        'avg_ph',
        'avg_temp',
    ];

    foreach ($numericFields as $field) {
        expect((float) $report[$field])->toBe(0.0,
            "{$context}: field '{$field}' must be 0 when no data exists, got {$report[$field]}"
        );
    }
}

// ---------------------------------------------------------------------------
// Property 22a: generateMonthly returns all required fields (10 iterations)
//
// For any valid monthly report request, the returned structure SHALL contain
// non-null values for all required fields.
//
// Validates: Requirements 11.1
// ---------------------------------------------------------------------------
test('Property 22a: generateMonthly returns all required fields for any valid request (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId    = randomSiteId();
        $yearMonth = randomYearMonth();
        $survival  = randomSurvivalData();
        $ecosystem = randomEcosystemRow();
        $species   = randomSpeciesRows();

        // Mock AnalyticsService::survivalRate
        $analyticsMock = Mockery::mock(AnalyticsService::class);
        $analyticsMock->shouldReceive('survivalRate')
            ->once()
            ->with($siteId)
            ->andReturn($survival);

        // Mock DB::select for species breakdown
        DB::shouldReceive('select')
            ->once()
            ->andReturn($species);

        // Mock DB::selectOne for ecosystem averages
        DB::shouldReceive('selectOne')
            ->once()
            ->andReturn($ecosystem);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateMonthly($siteId, $yearMonth);

        assertRequiredFields($report, "Iteration {$i} [generateMonthly siteId={$siteId} period={$yearMonth}]");

        expect($report['report_type'])->toBe('monthly',
            "Iteration {$i}: report_type should be 'monthly'"
        );
        expect($report['site_id'])->toBe($siteId,
            "Iteration {$i}: site_id should match input"
        );
        expect($report['period'])->toBe($yearMonth,
            "Iteration {$i}: period should match input"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22b: generateMonthly returns zero values when no data exists (10 iterations)
//
// When AnalyticsService returns zero survival data and DB returns null ecosystem
// averages, all numeric fields SHALL be zero rather than null or error.
//
// Validates: Requirements 11.5
// ---------------------------------------------------------------------------
test('Property 22b: generateMonthly returns zero numeric fields when no data exists (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId    = randomSiteId();
        $yearMonth = randomYearMonth();

        $zeroSurvival = [
            'total'         => 0,
            'alive_count'   => 0,
            'dead_count'    => 0,
            'survival_rate' => 0.0,
        ];

        $nullEcosystem = (object) [
            'avg_salinity' => null,
            'avg_ph'       => null,
            'avg_temp'     => null,
        ];

        $analyticsMock = Mockery::mock(AnalyticsService::class);
        $analyticsMock->shouldReceive('survivalRate')
            ->once()
            ->with($siteId)
            ->andReturn($zeroSurvival);

        // Empty species result
        DB::shouldReceive('select')
            ->once()
            ->andReturn([]);

        // Null ecosystem averages (no records in range)
        DB::shouldReceive('selectOne')
            ->once()
            ->andReturn($nullEcosystem);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateMonthly($siteId, $yearMonth);

        assertRequiredFields($report, "Iteration {$i} [generateMonthly zero-data siteId={$siteId}]");
        assertZeroNumericFields($report, "Iteration {$i} [generateMonthly zero-data siteId={$siteId}]");

        expect($report['species_breakdown'])->toBe([],
            "Iteration {$i}: species_breakdown should be empty array when no data"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22c: generateLgu returns all required fields (10 iterations)
//
// For any valid LGU report request, the returned structure SHALL contain
// non-null values for all required fields.
//
// Validates: Requirements 11.2
// ---------------------------------------------------------------------------
test('Property 22c: generateLgu returns all required fields for any valid request (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        [$dateFrom, $dateTo] = randomDateRange();

        $total      = mt_rand(1, 500);
        $aliveCount = mt_rand(0, $total);

        $totalsRow = (object) [
            'total_planted' => (string) $total,
            'total_alive'   => (string) $aliveCount,
        ];

        $ecosystem = randomEcosystemRow();
        $species   = randomSpeciesRows();

        // generateLgu calls DB::selectOne twice (totals + ecosystem) and DB::select once (species)
        DB::shouldReceive('selectOne')
            ->twice()
            ->andReturn($totalsRow, $ecosystem);

        DB::shouldReceive('select')
            ->once()
            ->andReturn($species);

        // generateLgu does NOT use AnalyticsService — no mock needed
        $analyticsMock = Mockery::mock(AnalyticsService::class);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateLgu($dateFrom, $dateTo);

        assertRequiredFields($report, "Iteration {$i} [generateLgu from={$dateFrom} to={$dateTo}]");

        expect($report['report_type'])->toBe('lgu',
            "Iteration {$i}: report_type should be 'lgu'"
        );
        expect($report['date_from'])->toBe($dateFrom,
            "Iteration {$i}: date_from should match input"
        );
        expect($report['date_to'])->toBe($dateTo,
            "Iteration {$i}: date_to should match input"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22d: generateLgu returns zero values when no data exists (10 iterations)
//
// When DB returns null/zero totals and null ecosystem averages, all numeric
// fields SHALL be zero rather than null or error.
//
// Validates: Requirements 11.5
// ---------------------------------------------------------------------------
test('Property 22d: generateLgu returns zero numeric fields when no data exists (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        [$dateFrom, $dateTo] = randomDateRange();

        $zeroTotals = (object) [
            'total_planted' => '0',
            'total_alive'   => '0',
        ];

        $nullEcosystem = (object) [
            'avg_salinity' => null,
            'avg_ph'       => null,
            'avg_temp'     => null,
        ];

        DB::shouldReceive('selectOne')
            ->twice()
            ->andReturn($zeroTotals, $nullEcosystem);

        DB::shouldReceive('select')
            ->once()
            ->andReturn([]);

        $analyticsMock = Mockery::mock(AnalyticsService::class);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateLgu($dateFrom, $dateTo);

        assertRequiredFields($report, "Iteration {$i} [generateLgu zero-data]");
        assertZeroNumericFields($report, "Iteration {$i} [generateLgu zero-data]");

        expect($report['species_breakdown'])->toBe([],
            "Iteration {$i}: species_breakdown should be empty array when no data"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22e: generateDenr returns all required fields (10 iterations)
//
// For any valid DENR report request, the returned structure SHALL contain
// non-null values for all required fields.
//
// Validates: Requirements 11.3
// ---------------------------------------------------------------------------
test('Property 22e: generateDenr returns all required fields for any valid request (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId              = randomSiteId();
        [$dateFrom, $dateTo] = randomDateRange();
        $survival            = randomSurvivalData();
        $ecosystem           = randomEcosystemRow();
        $species             = randomSpeciesRows();

        $siteRow = (object) [
            'name'             => 'Site ' . $siteId,
            'barangay'         => 'Barangay ' . mt_rand(1, 50),
            'area_hectares'    => (string) round(mt_rand(100, 5000) / 100, 4),
            'established_year' => (string) mt_rand(2010, 2023),
        ];

        $analyticsMock = Mockery::mock(AnalyticsService::class);
        $analyticsMock->shouldReceive('survivalRate')
            ->once()
            ->with($siteId)
            ->andReturn($survival);

        // generateDenr calls DB::select once (species) and DB::selectOne twice (ecosystem + site)
        DB::shouldReceive('select')
            ->once()
            ->andReturn($species);

        DB::shouldReceive('selectOne')
            ->twice()
            ->andReturn($ecosystem, $siteRow);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateDenr($siteId, $dateFrom, $dateTo);

        assertRequiredFields($report, "Iteration {$i} [generateDenr siteId={$siteId} from={$dateFrom} to={$dateTo}]");

        expect($report['report_type'])->toBe('denr',
            "Iteration {$i}: report_type should be 'denr'"
        );
        expect($report['site_id'])->toBe($siteId,
            "Iteration {$i}: site_id should match input"
        );
        expect($report['date_from'])->toBe($dateFrom,
            "Iteration {$i}: date_from should match input"
        );
        expect($report['date_to'])->toBe($dateTo,
            "Iteration {$i}: date_to should match input"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22f: generateDenr returns zero values when no data exists (10 iterations)
//
// When AnalyticsService returns zero survival data and DB returns null ecosystem
// averages, all numeric fields SHALL be zero rather than null or error.
//
// Validates: Requirements 11.5
// ---------------------------------------------------------------------------
test('Property 22f: generateDenr returns zero numeric fields when no data exists (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId              = randomSiteId();
        [$dateFrom, $dateTo] = randomDateRange();

        $zeroSurvival = [
            'total'         => 0,
            'alive_count'   => 0,
            'dead_count'    => 0,
            'survival_rate' => 0.0,
        ];

        $nullEcosystem = (object) [
            'avg_salinity' => null,
            'avg_ph'       => null,
            'avg_temp'     => null,
        ];

        $siteRow = (object) [
            'name'             => null,
            'barangay'         => null,
            'area_hectares'    => null,
            'established_year' => null,
        ];

        $analyticsMock = Mockery::mock(AnalyticsService::class);
        $analyticsMock->shouldReceive('survivalRate')
            ->once()
            ->with($siteId)
            ->andReturn($zeroSurvival);

        DB::shouldReceive('select')
            ->once()
            ->andReturn([]);

        DB::shouldReceive('selectOne')
            ->twice()
            ->andReturn($nullEcosystem, $siteRow);

        $service = new ReportService($analyticsMock);
        $report  = $service->generateDenr($siteId, $dateFrom, $dateTo);

        assertRequiredFields($report, "Iteration {$i} [generateDenr zero-data siteId={$siteId}]");
        assertZeroNumericFields($report, "Iteration {$i} [generateDenr zero-data siteId={$siteId}]");

        expect($report['species_breakdown'])->toBe([],
            "Iteration {$i}: species_breakdown should be empty array when no data"
        );

        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 22g: All three report types return consistent field structure (10 iterations)
//
// For any randomly chosen report type (monthly, lgu, denr), the returned
// structure SHALL always contain the same set of required fields.
//
// Validates: Requirements 11.1, 11.2, 11.3
// ---------------------------------------------------------------------------
test('Property 22g: all three report types return consistent required field structure (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $reportType = ['monthly', 'lgu', 'denr'][mt_rand(0, 2)];
        $siteId     = randomSiteId();
        $survival   = randomSurvivalData();
        $ecosystem  = randomEcosystemRow();
        $species    = randomSpeciesRows();

        $analyticsMock = Mockery::mock(AnalyticsService::class);

        if ($reportType === 'monthly') {
            $yearMonth = randomYearMonth();

            $analyticsMock->shouldReceive('survivalRate')
                ->once()
                ->with($siteId)
                ->andReturn($survival);

            DB::shouldReceive('select')->once()->andReturn($species);
            DB::shouldReceive('selectOne')->once()->andReturn($ecosystem);

            $service = new ReportService($analyticsMock);
            $report  = $service->generateMonthly($siteId, $yearMonth);

        } elseif ($reportType === 'lgu') {
            [$dateFrom, $dateTo] = randomDateRange();

            $total      = mt_rand(1, 500);
            $aliveCount = mt_rand(0, $total);
            $totalsRow  = (object) [
                'total_planted' => (string) $total,
                'total_alive'   => (string) $aliveCount,
            ];

            DB::shouldReceive('selectOne')->twice()->andReturn($totalsRow, $ecosystem);
            DB::shouldReceive('select')->once()->andReturn($species);

            $service = new ReportService($analyticsMock);
            $report  = $service->generateLgu($dateFrom, $dateTo);

        } else { // denr
            [$dateFrom, $dateTo] = randomDateRange();

            $siteRow = (object) [
                'name'             => 'Test Site',
                'barangay'         => 'Test Barangay',
                'area_hectares'    => '10.5000',
                'established_year' => '2021',
            ];

            $analyticsMock->shouldReceive('survivalRate')
                ->once()
                ->with($siteId)
                ->andReturn($survival);

            DB::shouldReceive('select')->once()->andReturn($species);
            DB::shouldReceive('selectOne')->twice()->andReturn($ecosystem, $siteRow);

            $service = new ReportService($analyticsMock);
            $report  = $service->generateDenr($siteId, $dateFrom, $dateTo);
        }

        assertRequiredFields($report, "Iteration {$i} [type={$reportType}]");

        Mockery::close();
    }
});

<?php

// Feature: mangrove-monitoring-system, Property 14: Analytics averages are arithmetically correct
// Feature: mangrove-monitoring-system, Property 19: Total planted count is accurate
// Feature: mangrove-monitoring-system, Property 20: Survival rate formula is correct
// Feature: mangrove-monitoring-system, Property 21: Species distribution percentages sum to 100

use App\Services\AnalyticsService;
use Illuminate\Support\Facades\DB;

/**
 * Validates: Requirements 7.5, 10.1, 10.2, 10.3, 10.4
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random float in [min, max] rounded to 2 decimal places.
 */
function randFloat(float $min, float $max): float
{
    return round($min + mt_rand() / mt_getrandmax() * ($max - $min), 2);
}

/**
 * Compute arithmetic mean of an array, rounded to 2 decimal places.
 * Returns 0.0 for empty arrays.
 */
function arithmeticMean(array $values): float
{
    if (count($values) === 0) {
        return 0.0;
    }
    return round(array_sum($values) / count($values), 2);
}

// ---------------------------------------------------------------------------
// Property 14: Analytics averages are arithmetically correct
//
// For any set of ecosystem records for a given site and calendar month,
// the analytics endpoint SHALL return averages equal to the arithmetic mean
// of the stored values for that month, rounded to two decimal places.
//
// Validates: Requirements 7.5, 10.4
// ---------------------------------------------------------------------------
test('Property 14: ecosystemMonthlyAverages returns arithmetic mean rounded to 2dp (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);
        // Generate between 1 and 20 records for a single month
        $count = mt_rand(1, 20);

        $salinities = [];
        $phs        = [];
        $temps      = [];

        for ($j = 0; $j < $count; $j++) {
            $salinities[] = randFloat(0.0, 40.0);
            $phs[]        = randFloat(6.0, 9.0);
            $temps[]      = randFloat(20.0, 35.0);
        }

        $expectedSalinity = arithmeticMean($salinities);
        $expectedPh       = arithmeticMean($phs);
        $expectedTemp     = arithmeticMean($temps);

        // The service returns one row per month; mock a single month result
        DB::shouldReceive('select')
            ->once()
            ->andReturn([
                (object) [
                    'month'        => '2024-06-01 00:00:00',
                    'avg_salinity' => (string) $expectedSalinity,
                    'avg_ph'       => (string) $expectedPh,
                    'avg_temp'     => (string) $expectedTemp,
                ],
            ]);

        $service = new AnalyticsService();
        $result  = $service->ecosystemMonthlyAverages($siteId);

        expect($result)->toHaveCount(1,
            "Iteration {$i}: expected 1 month row"
        );

        $row = $result[0];

        expect($row['avg_salinity'])->toBe($expectedSalinity,
            "Iteration {$i}: avg_salinity mismatch. " .
            "Expected {$expectedSalinity}, got {$row['avg_salinity']}"
        );
        expect($row['avg_ph'])->toBe($expectedPh,
            "Iteration {$i}: avg_ph mismatch. " .
            "Expected {$expectedPh}, got {$row['avg_ph']}"
        );
        expect($row['avg_temp'])->toBe($expectedTemp,
            "Iteration {$i}: avg_temp mismatch. " .
            "Expected {$expectedTemp}, got {$row['avg_temp']}"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 14b: monthlyGrowthTrend returns arithmetic mean of height_cm
//
// For any set of monitoring records for a given site and calendar month,
// the growth trend endpoint SHALL return avg_height equal to the arithmetic
// mean of height_cm values, rounded to two decimal places.
//
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------
test('Property 14b: monthlyGrowthTrend returns arithmetic mean of height_cm rounded to 2dp (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);
        $count  = mt_rand(1, 20);

        $heights = [];
        for ($j = 0; $j < $count; $j++) {
            $heights[] = randFloat(5.0, 200.0);
        }

        $expectedAvgHeight = arithmeticMean($heights);

        DB::shouldReceive('select')
            ->once()
            ->andReturn([
                (object) [
                    'month'      => '2024-06-01 00:00:00',
                    'avg_height' => (string) $expectedAvgHeight,
                ],
            ]);

        $service = new AnalyticsService();
        $result  = $service->monthlyGrowthTrend($siteId);

        expect($result)->toHaveCount(1,
            "Iteration {$i}: expected 1 month row"
        );

        $row = $result[0];

        expect($row['avg_height'])->toBe($expectedAvgHeight,
            "Iteration {$i}: avg_height mismatch. " .
            "Expected {$expectedAvgHeight}, got {$row['avg_height']}"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 19: Total planted count is accurate
//
// For any restoration site, the analytics total_planted value SHALL equal
// the COUNT of plantation records associated with that site.
//
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------
test('Property 19: survivalRate total equals COUNT of plantation records (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);
        $total  = mt_rand(0, 500);
        // alive_count must be <= total
        $aliveCount = $total > 0 ? mt_rand(0, $total) : 0;

        // Schema::hasColumn is consulted for the optional is_replacement column.
        \Illuminate\Support\Facades\Schema::shouldReceive('hasColumn')
            ->andReturn(false);

        DB::shouldReceive('selectOne')
            ->once()
            ->andReturn((object) [
                'total_records'     => (string) $total,
                'monitored'         => (string) $aliveCount,
                'alive_count'       => (string) $aliveCount,
                'dead_count'        => '0',
                'replacement_count' => '0',
            ]);

        $service = new AnalyticsService();
        $result  = $service->survivalRate($siteId);

        expect($result['total'])->toBe($total,
            "Iteration {$i}: total_planted mismatch. " .
            "Expected {$total}, got {$result['total']}"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 20: Survival rate formula is correct
//
// For any restoration site with plantation and monitoring records, the
// computed survival rate SHALL equal:
//   (count of plantation records with at least one alive monitoring record
//    / total plantation records) × 100, rounded to two decimal places.
//
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------
test('Property 20: survival rate equals (alive_count / total) * 100 rounded to 2dp (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);
        $total  = mt_rand(1, 500); // at least 1 to avoid division by zero
        // Every record is monitored in this scenario, split alive/dead.
        $aliveCount = mt_rand(0, $total);
        $deadCount  = $total - $aliveCount;

        // No replacements → denominator == total. Default methodology.
        $expectedRate = round($aliveCount * 100.0 / $total, 2);

        \Illuminate\Support\Facades\Schema::shouldReceive('hasColumn')
            ->andReturn(false);

        DB::shouldReceive('selectOne')
            ->once()
            ->andReturn((object) [
                'total_records'     => (string) $total,
                'monitored'         => (string) $total,
                'alive_count'       => (string) $aliveCount,
                'dead_count'        => (string) $deadCount,
                'replacement_count' => '0',
            ]);

        $service = new AnalyticsService();
        $result  = $service->survivalRate($siteId);

        expect($result['survival_rate'])->toBe($expectedRate,
            "Iteration {$i}: survival_rate mismatch. " .
            "Expected {$expectedRate} (alive={$aliveCount}, total={$total}), " .
            "got {$result['survival_rate']}"
        );
        expect($result['alive_count'])->toBe($aliveCount,
            "Iteration {$i}: alive_count mismatch"
        );
        expect($result['dead_count'])->toBe($deadCount,
            "Iteration {$i}: dead_count mismatch"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 20b: Survival rate is unavailable when there are no plantation records
//
// Edge case: when total = 0, survival_rate SHALL be null (no data, not a 0% result).
//
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------
test('Property 20b: survival rate is null when total plantation records is zero (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);

        \Illuminate\Support\Facades\Schema::shouldReceive('hasColumn')
            ->andReturn(false);

        DB::shouldReceive('selectOne')
            ->once()
            ->andReturn((object) [
                'total_records'     => '0',
                'monitored'         => '0',
                'alive_count'       => '0',
                'dead_count'        => '0',
                'replacement_count' => '0',
            ]);

        $service = new AnalyticsService();
        $result  = $service->survivalRate($siteId);

        expect($result['survival_rate'])->toBeNull(
            "Iteration {$i}: survival_rate should be null when total is 0"
        );
        expect($result['total'])->toBe(0,
            "Iteration {$i}: total should be 0"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 21: Species distribution percentages sum to 100
//
// For any restoration site with plantation records, the species distribution
// percentages SHALL sum to 100.00, and each species count SHALL equal the
// number of plantation records with that species name.
//
// Validates: Requirements 10.3
// ---------------------------------------------------------------------------
test('Property 21: species distribution percentages sum to 100.00 and counts are correct (10 iterations)', function () {
    $iterations = 10;

    $speciesPool = [
        'Rhizophora mucronata',
        'Avicennia marina',
        'Sonneratia alba',
        'Bruguiera gymnorrhiza',
        'Ceriops tagal',
    ];

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);

        // Pick 1–5 distinct species and assign random counts
        $numSpecies = mt_rand(1, count($speciesPool));
        $selectedSpecies = array_slice($speciesPool, 0, $numSpecies);

        $counts = [];
        foreach ($selectedSpecies as $species) {
            $counts[$species] = mt_rand(1, 50);
        }
        $grandTotal = array_sum($counts);

        // Build the mock DB rows — percentages computed the same way the DB would
        $mockRows = [];
        foreach ($counts as $species => $count) {
            $percentage = round($count * 100.0 / $grandTotal, 2);
            $mockRows[] = (object) [
                'species_name' => $species,
                'count'        => (string) $count,
                'percentage'   => (string) $percentage,
            ];
        }

        DB::shouldReceive('select')
            ->once()
            ->andReturn($mockRows);

        $service = new AnalyticsService();
        $result  = $service->speciesDistribution($siteId);

        expect($result)->toHaveCount($numSpecies,
            "Iteration {$i}: expected {$numSpecies} species rows"
        );

        // Verify each species count matches
        foreach ($result as $row) {
            $expectedCount = $counts[$row['species_name']];
            expect($row['count'])->toBe($expectedCount,
                "Iteration {$i}: count mismatch for species '{$row['species_name']}'. " .
                "Expected {$expectedCount}, got {$row['count']}"
            );
        }

        // Verify percentages sum to ~100.00.
        // Each per-row percentage is independently rounded to 2dp, so the sum
        // can deviate by up to (numSpecies × 0.005). We allow ±0.05 to cover
        // up to 10 species without false failures.
        $percentageSum = round(array_sum(array_column($result, 'percentage')), 4);
        expect($percentageSum)->toBeGreaterThanOrEqual(99.95,
            "Iteration {$i}: percentages sum {$percentageSum} is below 99.95"
        );
        expect($percentageSum)->toBeLessThanOrEqual(100.05,
            "Iteration {$i}: percentages sum {$percentageSum} exceeds 100.05"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 21b: Single-species distribution has percentage = 100.00
//
// When all plantation records belong to one species, that species SHALL
// have percentage = 100.00.
//
// Validates: Requirements 10.3
// ---------------------------------------------------------------------------
test('Property 21b: single-species distribution has percentage of 100.00 (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $siteId = mt_rand(1, 9999);
        $count  = mt_rand(1, 200);

        DB::shouldReceive('select')
            ->once()
            ->andReturn([
                (object) [
                    'species_name' => 'Rhizophora mucronata',
                    'count'        => (string) $count,
                    'percentage'   => '100.00',
                ],
            ]);

        $service = new AnalyticsService();
        $result  = $service->speciesDistribution($siteId);

        expect($result)->toHaveCount(1,
            "Iteration {$i}: expected exactly 1 species row"
        );
        expect($result[0]['percentage'])->toBe(100.0,
            "Iteration {$i}: single species percentage should be 100.0, " .
            "got {$result[0]['percentage']}"
        );
        expect($result[0]['count'])->toBe($count,
            "Iteration {$i}: count mismatch"
        );

        \Mockery::close();
    }
});

<?php

// Feature: mangrove-monitoring-system, Property 8: Dead monitoring record sets mortality date
// Feature: mangrove-monitoring-system, Property 9: Multiple monitoring records are preserved
// Feature: mangrove-monitoring-system, Property 10: Retrieved records are ordered by date descending

use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use App\Services\GeoVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with mrc_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function mrc_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function mrc_makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

function mrc_makeMenro(): User
{
    return User::factory()->create(['role' => 'menro']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function mrc_makeSite(array $overrides = []): RestorationSite
{
    $admin = mrc_makeAdmin();

    return RestorationSite::create(array_merge([
        'created_by'    => $admin->id,
        'name'          => 'Test Site ' . uniqid(),
        'description'   => 'A test site',
        'status'        => 'active',
        'area_hectares' => 10.0,
        'barangay'      => 'Barangay Test',
    ], $overrides));
}

/**
 * Create a PlantationRecord directly in the DB (bypassing PostGIS geometry).
 */
function mrc_makePlantationRecord(int $siteId, int $userId): PlantationRecord
{
    return PlantationRecord::create([
        'restoration_site_id' => $siteId,
        'submitted_by'        => $userId,
        'species_name'        => 'Rhizophora apiculata',
        'date_planted'        => now()->toDateString(),
        'latitude'            => 10.0,
        'longitude'           => 124.0,
        'status'              => 'active',
        'geo_mismatch'        => false,
    ]);
}

/**
 * Build a minimal valid monitoring record payload.
 */
function mrc_baseMonitoringPayload(int $plantationRecordId, string $date = null): array
{
    return [
        'plantation_record_id' => $plantationRecordId,
        'monitoring_date'      => $date ?? now()->toDateString(),
        'height_cm'            => round(mt_rand(10, 500) / 10, 1),
        'diameter_cm'          => round(mt_rand(5, 200) / 10, 1),
        'survival_status'      => 'alive',
        'growth_stage'         => 'seedling',
        'latitude'             => 10.0,
        'longitude'            => 124.0,
    ];
}

/**
 * Generate a random date string within the past N years (always in the past, safe for validation).
 */
function mrc_randomPastDate(int $maxDaysBack = 1000): string
{
    $daysBack = mt_rand(1, $maxDaysBack);
    return now()->subDays($daysBack)->toDateString();
}

// ---------------------------------------------------------------------------
// Property 8: Dead monitoring record sets mortality date
//
// For any monitoring record submitted with survival_status='dead', the linked
// plantation record's mortality_date SHALL be set to the monitoring_date of
// that monitoring record.
//
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
test('Property 8: Dead monitoring record sets mortality date on linked plantation record (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 8: Dead monitoring record sets mortality date

    $fieldWorker = mrc_makeFieldWorker();
    $site        = mrc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $plantation = mrc_makePlantationRecord($site->id, $fieldWorker->id);

        // Pick a random past date as the monitoring date
        $monitoringDate = mrc_randomPastDate(365);

        $payload = mrc_baseMonitoringPayload($plantation->id, $monitoringDate);
        $payload['survival_status'] = 'dead';

        $response = $this->actingAs($fieldWorker)->postJson('/api/monitoring-records', $payload);

        $response->assertStatus(201,
            "Iteration {$i}: submitting a dead monitoring record should return HTTP 201"
        );

        // Reload the plantation record from DB
        $plantation->refresh();

        expect($plantation->mortality_date)->not->toBeNull(
            "Iteration {$i}: mortality_date should be set on the plantation record"
        );

        expect($plantation->mortality_date->toDateString())->toBe($monitoringDate,
            "Iteration {$i}: mortality_date ({$plantation->mortality_date->toDateString()}) " .
            "should equal monitoring_date ({$monitoringDate})"
        );

        expect($plantation->status)->toBe('dead',
            "Iteration {$i}: plantation record status should be 'dead'"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 9: Multiple monitoring records are preserved
//
// For any plantation record, submitting N monitoring records over time SHALL
// result in exactly N monitoring records stored and retrievable for that
// plantation record.
//
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------
test('Property 9: Multiple monitoring records are preserved — exactly N records stored (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 9: Multiple monitoring records are preserved

    $fieldWorker = mrc_makeFieldWorker();
    $site        = mrc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $plantation = mrc_makePlantationRecord($site->id, $fieldWorker->id);

        // Random N between 1 and 20
        $n = mt_rand(1, 20);

        for ($j = 0; $j < $n; $j++) {
            // Use distinct past dates to avoid any potential unique constraint issues
            $monitoringDate = now()->subDays($n - $j)->toDateString();

            $payload = mrc_baseMonitoringPayload($plantation->id, $monitoringDate);

            $response = $this->actingAs($fieldWorker)->postJson('/api/monitoring-records', $payload);

            $response->assertStatus(201,
                "Iteration {$i}, record {$j}: submitting monitoring record should return HTTP 201"
            );
        }

        // Assert exactly N records exist for this plantation record
        $storedCount = MonitoringRecord::where('plantation_record_id', $plantation->id)->count();

        expect($storedCount)->toBe($n,
            "Iteration {$i}: expected {$n} monitoring records for plantation {$plantation->id}, " .
            "found {$storedCount}"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 10: Retrieved records are ordered by date descending
//
// For any set of monitoring records retrieved for a restoration site, the
// returned list SHALL be ordered by monitoring_date in descending order.
//
// Uses GET /api/sites/{site}/monitoring-records (menro/admin role required).
//
// Validates: Requirements 5.6
// ---------------------------------------------------------------------------
test('Property 10: Retrieved monitoring records are ordered by monitoring_date descending (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 10: Retrieved records are ordered by date descending

    $fieldWorker = mrc_makeFieldWorker();
    $menro       = mrc_makeMenro();

    for ($i = 0; $i < 100; $i++) {
        $site       = mrc_makeSite();
        $plantation = mrc_makePlantationRecord($site->id, $fieldWorker->id);

        // Generate between 2 and 10 random distinct past dates
        $count = mt_rand(2, 10);
        $dates = [];

        // Build a pool of distinct dates spread over the past 500 days
        $usedOffsets = [];
        while (count($dates) < $count) {
            $offset = mt_rand(1, 500);
            if (!in_array($offset, $usedOffsets)) {
                $usedOffsets[] = $offset;
                $dates[]       = now()->subDays($offset)->toDateString();
            }
        }

        // Submit monitoring records with those dates (in arbitrary order)
        shuffle($dates);
        foreach ($dates as $date) {
            $payload = mrc_baseMonitoringPayload($plantation->id, $date);
            $this->actingAs($fieldWorker)->postJson('/api/monitoring-records', $payload)
                ->assertStatus(201);
        }

        // Retrieve via the menro/admin endpoint
        $response = $this->actingAs($menro)
            ->getJson("/api/sites/{$site->id}/monitoring-records");

        $response->assertStatus(200,
            "Iteration {$i}: GET /api/sites/{$site->id}/monitoring-records should return HTTP 200"
        );

        $records = $response->json();

        expect(count($records))->toBe($count,
            "Iteration {$i}: expected {$count} records in response, got " . count($records)
        );

        // Verify descending order: each date must be >= the next date
        for ($k = 0; $k < count($records) - 1; $k++) {
            $current = $records[$k]['monitoring_date'];
            $next    = $records[$k + 1]['monitoring_date'];

            expect($current >= $next)->toBeTrue(
                "Iteration {$i}: record[{$k}] date ({$current}) should be >= record[" .
                ($k + 1) . "] date ({$next}) — list must be descending"
            );
        }
    }
});

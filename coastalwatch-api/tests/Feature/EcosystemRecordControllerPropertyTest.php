<?php

// Feature: mangrove-monitoring-system, Property 10: Retrieved records are ordered by date descending
// Feature: mangrove-monitoring-system, Property 26: All CUD operations are audit-logged

use App\Models\ActivityLog;
use App\Models\EcosystemRecord;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with erc_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function erc_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function erc_makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

function erc_makeMenro(): User
{
    return User::factory()->create(['role' => 'menro']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function erc_makeSite(array $overrides = []): RestorationSite
{
    $admin = erc_makeAdmin();

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
 * Build a minimal valid ecosystem record payload for a given site and date.
 */
function erc_basePayload(int $siteId, string $date): array
{
    $tidalConditions = ['low', 'mid', 'high', 'storm'];

    return [
        'restoration_site_id' => $siteId,
        'measurement_date'    => $date,
        'soil_salinity_ppt'   => round(mt_rand(0, 4000) / 100, 2),   // 0.00 – 40.00 ppt
        'water_ph'            => round(mt_rand(0, 1400) / 100, 2),   // 0.00 – 14.00
        'water_temp_celsius'  => round(mt_rand(1500, 3500) / 100, 2), // 15.00 – 35.00 °C
        'tidal_condition'     => $tidalConditions[array_rand($tidalConditions)],
        'latitude'            => round(mt_rand(-8500, 8500) / 100, 6),
        'longitude'           => round(mt_rand(-17900, 17900) / 100, 6),
    ];
}

/**
 * Generate N distinct past date strings spread over the past $maxDaysBack days.
 *
 * @return string[]
 */
function erc_distinctPastDates(int $n, int $maxDaysBack = 500): array
{
    $usedOffsets = [];
    $dates       = [];

    while (count($dates) < $n) {
        $offset = mt_rand(1, $maxDaysBack);
        if (!in_array($offset, $usedOffsets, true)) {
            $usedOffsets[] = $offset;
            $dates[]       = now()->subDays($offset)->toDateString();
        }
    }

    return $dates;
}

// ---------------------------------------------------------------------------
// Property 10 (ecosystem variant): Retrieved records are ordered by date descending
//
// For any set of ecosystem records retrieved for a restoration site, the
// returned list SHALL be ordered by measurement_date in descending order.
//
// Uses GET /api/sites/{site}/ecosystem-records (menro/admin role required).
//
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------
test('Property 10 (ecosystem): Retrieved ecosystem records are ordered by measurement_date descending (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 10: Retrieved records are ordered by date descending

    $fieldWorker = erc_makeFieldWorker();
    $menro       = erc_makeMenro();

    for ($i = 0; $i < 100; $i++) {
        $site = erc_makeSite();

        // Generate between 2 and 10 random distinct past dates
        $count = mt_rand(2, 10);
        $dates = erc_distinctPastDates($count);

        // Submit ecosystem records in arbitrary (shuffled) order
        shuffle($dates);
        foreach ($dates as $date) {
            $payload  = erc_basePayload($site->id, $date);
            $response = $this->actingAs($fieldWorker)->postJson('/api/ecosystem-records', $payload);

            $response->assertStatus(201,
                "Iteration {$i}: POST /api/ecosystem-records should return HTTP 201 for date {$date}"
            );
        }

        // Retrieve via the menro/admin endpoint
        $response = $this->actingAs($menro)
            ->getJson("/api/sites/{$site->id}/ecosystem-records");

        $response->assertStatus(200,
            "Iteration {$i}: GET /api/sites/{$site->id}/ecosystem-records should return HTTP 200"
        );

        $records = $response->json();

        expect(count($records))->toBe($count,
            "Iteration {$i}: expected {$count} records in response, got " . count($records)
        );

        // Verify descending order: each measurement_date must be >= the next
        for ($k = 0; $k < count($records) - 1; $k++) {
            $current = $records[$k]['measurement_date'];
            $next    = $records[$k + 1]['measurement_date'];

            expect($current >= $next)->toBeTrue(
                "Iteration {$i}: record[{$k}] date ({$current}) should be >= record[" .
                ($k + 1) . "] date ({$next}) — list must be in descending order"
            );
        }
    }
});

// ---------------------------------------------------------------------------
// Property 26 (ecosystem variant): All CUD operations are audit-logged
//
// For any create operation on ecosystem_records, a corresponding entry SHALL
// be created in the activity_logs table.
//
// Validates: Requirements 12.4
// ---------------------------------------------------------------------------
test('Property 26 (ecosystem): Create ecosystem record produces an ActivityLog entry (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 26: All CUD operations are audit-logged

    $fieldWorker = erc_makeFieldWorker();
    $site        = erc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Use a past date to avoid future-date validation errors
        $date    = now()->subDays(mt_rand(1, 365))->toDateString();
        $payload = erc_basePayload($site->id, $date);

        $logCountBefore = ActivityLog::where('action', 'ecosystem_record.created')->count();

        $response = $this->actingAs($fieldWorker)->postJson('/api/ecosystem-records', $payload);

        $response->assertStatus(201,
            "Iteration {$i}: POST /api/ecosystem-records should return HTTP 201"
        );

        $recordId = $response->json('id');

        // Assert exactly one new activity log entry was created for this record
        $logCountAfter = ActivityLog::where('action', 'ecosystem_record.created')->count();

        expect($logCountAfter)->toBe($logCountBefore + 1,
            "Iteration {$i}: expected one new ActivityLog entry for ecosystem_record.created, " .
            "before={$logCountBefore}, after={$logCountAfter}"
        );

        // Assert the log entry references the correct model
        $logEntry = ActivityLog::where('action', 'ecosystem_record.created')
            ->where('model_type', EcosystemRecord::class)
            ->where('model_id', $recordId)
            ->latest()
            ->first();

        expect($logEntry)->not->toBeNull(
            "Iteration {$i}: ActivityLog entry should reference EcosystemRecord id={$recordId}"
        );

        expect($logEntry->user_id)->toBe($fieldWorker->id,
            "Iteration {$i}: ActivityLog user_id should match the submitting field worker"
        );
    }
});

<?php

// Feature: mangrove-monitoring-system, Property 6: GeoTag is required for field records
// Feature: mangrove-monitoring-system, Property 7: Server timestamp is independent of client date
// Feature: mangrove-monitoring-system, Property 24: Future dates beyond 7 days are rejected
// Feature: mangrove-monitoring-system, Property 25: Out-of-boundary records are flagged (integration layer)
// Feature: mangrove-monitoring-system, Property 26: All CUD operations are audit-logged

use App\Models\ActivityLog;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use App\Services\GeoVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (local to this file — prefixed to avoid collision with other test files)
// ---------------------------------------------------------------------------

/**
 * Create an admin user.
 */
function prc_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

/**
 * Create a field_worker user.
 */
function prc_makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function prc_makeSite(array $overrides = []): RestorationSite
{
    $admin = prc_makeAdmin();

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
 * Generate a random valid latitude in [-85, 85].
 */
function prc_randomLat(): float
{
    return round(mt_rand(-8500, 8500) / 100, 6);
}

/**
 * Generate a random valid longitude in [-179, 179].
 */
function prc_randomLon(): float
{
    return round(mt_rand(-17900, 17900) / 100, 6);
}

/**
 * Build a minimal valid plantation record payload.
 */
function prc_basePayload(int $siteId): array
{
    return [
        'restoration_site_id' => $siteId,
        'species_name'        => 'Rhizophora apiculata',
        'date_planted'        => now()->toDateString(),
        'latitude'            => prc_randomLat(),
        'longitude'           => prc_randomLon(),
    ];
}

// ---------------------------------------------------------------------------
// Property 6: GeoTag is required for field records
//
// For any plantation record or monitoring record submission that omits
// latitude or longitude, the API SHALL return a validation error (HTTP 422).
//
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------
test('Property 6: GeoTag is required — missing latitude returns 422 (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $payload = prc_basePayload($site->id);
        unset($payload['latitude']); // omit latitude

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(422,
            "Iteration {$i}: missing latitude should return HTTP 422"
        );

        $errors = $response->json('errors');
        expect(array_key_exists('latitude', $errors))->toBeTrue(
            "Iteration {$i}: errors should contain 'latitude' key"
        );
    }
});

test('Property 6: GeoTag is required — missing longitude returns 422 (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $payload = prc_basePayload($site->id);
        unset($payload['longitude']); // omit longitude

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(422,
            "Iteration {$i}: missing longitude should return HTTP 422"
        );

        $errors = $response->json('errors');
        expect(array_key_exists('longitude', $errors))->toBeTrue(
            "Iteration {$i}: errors should contain 'longitude' key"
        );
    }
});

test('Property 6: GeoTag is required — missing both latitude and longitude returns 422 (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $payload = prc_basePayload($site->id);
        unset($payload['latitude'], $payload['longitude']); // omit both

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(422,
            "Iteration {$i}: missing both lat/lon should return HTTP 422"
        );

        $errors = $response->json('errors');
        expect(array_key_exists('latitude', $errors))->toBeTrue(
            "Iteration {$i}: errors should contain 'latitude' key"
        );
        expect(array_key_exists('longitude', $errors))->toBeTrue(
            "Iteration {$i}: errors should contain 'longitude' key"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 7: Server timestamp is independent of client date
//
// For any plantation record, the server-set created_at SHALL be set to the
// server's current time regardless of any client-supplied date fields.
//
// We submit records with varied date_planted values (past, today, up to 7
// days in the future) and assert that the stored created_at is within a few
// seconds of now(), not equal to date_planted.
//
// Validates: Requirements 4.5, 12.3
// ---------------------------------------------------------------------------
test('Property 7: Server timestamp is independent of client date_planted (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    // Offsets in days: past dates and future dates within the 7-day window
    $offsets = array_merge(
        range(-365, -1),   // past dates
        range(0, 7)        // today through 7 days ahead (boundary)
    );

    for ($i = 0; $i < 100; $i++) {
        $offsetDays  = $offsets[array_rand($offsets)];
        $datePlanted = now()->addDays($offsetDays)->toDateString();

        $payload = prc_basePayload($site->id);
        $payload['date_planted'] = $datePlanted;

        $before   = now()->subSeconds(2);
        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);
        $after    = now()->addSeconds(2);

        $response->assertStatus(201,
            "Iteration {$i}: valid record with date_planted={$datePlanted} should return 201"
        );

        $recordId  = $response->json('id');
        $stored    = PlantationRecord::find($recordId);

        expect($stored)->not->toBeNull(
            "Iteration {$i}: record should be stored"
        );

        $createdAt = \Carbon\Carbon::parse($stored->created_at);

        // created_at must be within the server-time window, not equal to date_planted
        expect($createdAt->greaterThanOrEqualTo($before))->toBeTrue(
            "Iteration {$i}: created_at {$createdAt} should be >= {$before}"
        );
        expect($createdAt->lessThanOrEqualTo($after))->toBeTrue(
            "Iteration {$i}: created_at {$createdAt} should be <= {$after}"
        );

        // created_at should NOT equal date_planted (unless today by coincidence — check timestamp vs date)
        // The key invariant: created_at is a full timestamp set by the server
        expect($stored->created_at)->not->toBeNull(
            "Iteration {$i}: created_at must not be null"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 24: Future dates beyond 7 days are rejected
//
// For any date_planted value more than 7 days in the future relative to the
// server's current date, the submission SHALL return a validation error (422).
// Boundary: exactly 7 days in the future should be accepted (201).
//
// Validates: Requirements 12.1
// ---------------------------------------------------------------------------
test('Property 24: date_planted more than 7 days in the future returns 422 (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Generate a date 8 to 3650 days in the future
        $daysAhead   = mt_rand(8, 3650);
        $datePlanted = now()->addDays($daysAhead)->toDateString();

        $payload = prc_basePayload($site->id);
        $payload['date_planted'] = $datePlanted;

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(422,
            "Iteration {$i}: date_planted={$datePlanted} ({$daysAhead} days ahead) should return HTTP 422"
        );

        $errors = $response->json('errors');
        expect(array_key_exists('date_planted', $errors))->toBeTrue(
            "Iteration {$i}: errors should contain 'date_planted' key"
        );
    }
});

test('Property 24: date_planted exactly 7 days in the future is accepted (boundary check)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    $datePlanted = now()->addDays(7)->toDateString();

    $payload = prc_basePayload($site->id);
    $payload['date_planted'] = $datePlanted;

    $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

    $response->assertStatus(201,
        "date_planted exactly 7 days in the future should be accepted (HTTP 201)"
    );
});

// ---------------------------------------------------------------------------
// Property 25: Out-of-boundary records are flagged (integration layer)
//
// For any plantation record submitted with a GeoTag whose distance from the
// specified restoration site boundary exceeds 500 meters, the stored record
// SHALL have geo_mismatch=true and status='flagged'.
//
// GeoVerificationService is mocked to return false (outside boundary) since
// the test environment uses SQLite (no PostGIS).
//
// Validates: Requirements 12.2
// ---------------------------------------------------------------------------
test('Property 25: Out-of-boundary records are stored with geo_mismatch=true and status=flagged (10 iterations)', function () {
    // Mock GeoVerificationService to always return false (outside boundary)
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(false);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $payload = prc_basePayload($site->id);

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(201,
            "Iteration {$i}: out-of-boundary record should still be stored (HTTP 201), not rejected"
        );

        $recordId = $response->json('id');
        $stored   = PlantationRecord::find($recordId);

        expect($stored)->not->toBeNull(
            "Iteration {$i}: record should be stored in the DB"
        );

        expect((bool) $stored->geo_mismatch)->toBeTrue(
            "Iteration {$i}: geo_mismatch should be true for out-of-boundary record"
        );

        expect($stored->status)->toBe('flagged',
            "Iteration {$i}: status should be 'flagged' for out-of-boundary record"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 26: All CUD operations are audit-logged
//
// For any create operation on plantation_records, a corresponding entry
// SHALL be created in the activity_logs table.
//
// Validates: Requirements 12.4
// ---------------------------------------------------------------------------
test('Property 26: Creating a plantation record creates an activity_log entry (10 iterations)', function () {
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = prc_makeFieldWorker();
    $site        = prc_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $logCountBefore = ActivityLog::where('action', 'plantation_record.created')->count();

        $payload  = prc_basePayload($site->id);
        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', $payload);

        $response->assertStatus(201,
            "Iteration {$i}: valid record should return HTTP 201"
        );

        $recordId = $response->json('id');

        $logCountAfter = ActivityLog::where('action', 'plantation_record.created')->count();

        expect($logCountAfter)->toBe($logCountBefore + 1,
            "Iteration {$i}: exactly one new activity_log entry should be created"
        );

        // Verify the log entry references the correct model
        $logEntry = ActivityLog::where('action', 'plantation_record.created')
            ->where('model_type', PlantationRecord::class)
            ->where('model_id', $recordId)
            ->first();

        expect($logEntry)->not->toBeNull(
            "Iteration {$i}: activity_log entry should reference the created PlantationRecord (id={$recordId})"
        );

        expect($logEntry->user_id)->toBe($fieldWorker->id,
            "Iteration {$i}: activity_log entry should be attributed to the submitting user"
        );
    }
});

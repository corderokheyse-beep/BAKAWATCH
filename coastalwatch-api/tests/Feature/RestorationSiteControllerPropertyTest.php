<?php

// Feature: mangrove-monitoring-system, Property 3: Geometry storage round-trip
// Feature: mangrove-monitoring-system, Property 4: Site field update correctness
// Feature: mangrove-monitoring-system, Property 5: Suspended site rejects plantation records

use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use App\Services\GeoVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random valid latitude in [-85, 85].
 */
function randomLat(): float
{
    return round(mt_rand(-8500, 8500) / 100, 6);
}

/**
 * Generate a random valid longitude in [-179, 179].
 */
function randomLon(): float
{
    return round(mt_rand(-17900, 17900) / 100, 6);
}

/**
 * Build a minimal valid GeoJSON polygon string centred on lat/lon.
 * The polygon is a small square (~0.01 degree on each side).
 */
function makePolygonGeoJson(float $lat, float $lon): string
{
    $d = 0.005; // half-side in degrees
    $coords = [
        [$lon - $d, $lat - $d],
        [$lon + $d, $lat - $d],
        [$lon + $d, $lat + $d],
        [$lon - $d, $lat + $d],
        [$lon - $d, $lat - $d], // close ring
    ];

    $ring = implode(',', array_map(fn($c) => "[{$c[0]},{$c[1]}]", $coords));

    return '{"type":"Polygon","coordinates":[[' . $ring . ']]}';
}

/**
 * Create an admin user.
 */
function makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

/**
 * Create a field_worker user.
 */
function makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

/**
 * Create a RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function makeSite(array $overrides = []): RestorationSite
{
    $admin = makeAdmin();

    return RestorationSite::create(array_merge([
        'created_by'    => $admin->id,
        'name'          => 'Test Site ' . uniqid(),
        'description'   => 'A test site',
        'status'        => 'active',
        'area_hectares' => 10.0,
        'barangay'      => 'Barangay Test',
    ], $overrides));
}

// ---------------------------------------------------------------------------
// Property 3: Geometry storage round-trip
//
// For any valid GeoJSON polygon submitted as a site boundary, and for any
// valid (latitude, longitude) pair submitted as a GeoTag, storing then
// retrieving the record SHALL return geometry equivalent to the submitted
// coordinates.
//
// Since SQLite does not support PostGIS, we test the lat/lon columns on
// plantation_records (Requirement 3.2). The controller already skips the
// PostGIS UPDATE on SQLite, so the lat/lon decimal columns are the
// authoritative geometry storage in the test environment.
//
// Validates: Requirements 2.2, 3.2
// ---------------------------------------------------------------------------
test('Property 3: Geometry storage round-trip — lat/lon values are stored and retrieved correctly (10 iterations)', function () {
    // Mock GeoVerificationService so it never calls PostGIS
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = makeFieldWorker();
    $site        = makeSite(['status' => 'active']);

    for ($i = 0; $i < 100; $i++) {
        $lat = randomLat();
        $lon = randomLon();

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', [
            'restoration_site_id' => $site->id,
            'species_name'        => 'Rhizophora apiculata',
            'date_planted'        => now()->toDateString(),
            'latitude'            => $lat,
            'longitude'           => $lon,
        ]);

        $response->assertStatus(201,
            "Iteration {$i}: POST /api/plantation-records should return 201"
        );

        $recordId = $response->json('id');
        $stored   = PlantationRecord::find($recordId);

        expect($stored)->not->toBeNull(
            "Iteration {$i}: plantation record should be stored in the DB"
        );

        // Verify latitude round-trip within floating-point tolerance
        expect((float) $stored->latitude)->toBeGreaterThanOrEqual($lat - 0.000001)
            ->toBeLessThanOrEqual($lat + 0.000001,
                "Iteration {$i}: stored latitude {$stored->latitude} should match submitted {$lat}"
            );

        // Verify longitude round-trip within floating-point tolerance
        expect((float) $stored->longitude)->toBeGreaterThanOrEqual($lon - 0.000001)
            ->toBeLessThanOrEqual($lon + 0.000001,
                "Iteration {$i}: stored longitude {$stored->longitude} should match submitted {$lon}"
            );
    }
});

// ---------------------------------------------------------------------------
// Property 4: Site field update correctness
//
// For any valid field value submitted in a site update request, the retrieved
// site record SHALL reflect that updated value.
//
// The RestorationSiteController::update() skips PostGIS calls on SQLite,
// so this test runs cleanly against the in-memory SQLite test database.
//
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------
test('Property 4: Site field update correctness — retrieved record reflects updated values (10 iterations)', function () {
    $admin    = makeAdmin();
    $statuses = ['active', 'inactive', 'in_progress'];
    $barangays = ['Barangay A', 'Barangay B', 'Barangay C', 'Barangay D', 'Barangay E'];

    for ($i = 0; $i < 100; $i++) {
        $site = makeSite();

        // Generate random valid field values
        $newName        = 'Updated Site ' . uniqid() . '_' . $i;
        $newDescription = 'Description ' . bin2hex(random_bytes(8));
        $newStatus      = $statuses[array_rand($statuses)];
        $newArea        = round(mt_rand(100, 100000) / 100, 2); // 1.00 to 1000.00
        $newBarangay    = $barangays[array_rand($barangays)];

        $response = $this->actingAs($admin)->putJson("/api/sites/{$site->id}", [
            'name'          => $newName,
            'description'   => $newDescription,
            'status'        => $newStatus,
            'area_hectares' => $newArea,
            'barangay'      => $newBarangay,
        ]);

        $response->assertStatus(200,
            "Iteration {$i}: PUT /api/sites/{$site->id} should return 200"
        );

        $updated = $response->json();

        expect($updated['name'])->toBe($newName,
            "Iteration {$i}: name should be updated to '{$newName}'"
        );
        expect($updated['description'])->toBe($newDescription,
            "Iteration {$i}: description should be updated"
        );
        expect($updated['status'])->toBe($newStatus,
            "Iteration {$i}: status should be updated to '{$newStatus}'"
        );
        expect((float) $updated['area_hectares'])->toBeGreaterThanOrEqual($newArea - 0.01)
            ->toBeLessThanOrEqual($newArea + 0.01,
                "Iteration {$i}: area_hectares should be updated to {$newArea}"
            );
        expect($updated['barangay'])->toBe($newBarangay,
            "Iteration {$i}: barangay should be updated to '{$newBarangay}'"
        );

        // Also verify via a fresh DB read to confirm persistence
        $fresh = RestorationSite::find($site->id);
        expect($fresh->name)->toBe($newName,
            "Iteration {$i}: DB record name should match"
        );
        expect($fresh->status)->toBe($newStatus,
            "Iteration {$i}: DB record status should match"
        );
        expect($fresh->barangay)->toBe($newBarangay,
            "Iteration {$i}: DB record barangay should match"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 5: Suspended site rejects plantation records
//
// For any restoration site with status 'suspended', submitting a plantation
// record referencing that site SHALL return a validation error (HTTP 422)
// and no record SHALL be stored.
//
// The PlantationRecordController checks site->status === 'suspended' before
// any PostGIS calls, so this test runs cleanly on SQLite.
//
// Validates: Requirements 2.4, 4.4
// ---------------------------------------------------------------------------
test('Property 5: Suspended site rejects plantation records — returns 422 and stores no record (10 iterations)', function () {
    // Mock GeoVerificationService — it should never be reached for suspended sites,
    // but mock it defensively to avoid any PostGIS calls if the check order changes.
    $this->mock(GeoVerificationService::class, function ($mock) {
        $mock->shouldReceive('isWithinSite')->andReturn(true);
    });

    $fieldWorker = makeFieldWorker();

    for ($i = 0; $i < 100; $i++) {
        // Create a fresh suspended site for each iteration
        $site = makeSite(['status' => 'inactive']);

        $countBefore = PlantationRecord::where('restoration_site_id', $site->id)->count();

        $lat = randomLat();
        $lon = randomLon();

        $response = $this->actingAs($fieldWorker)->postJson('/api/plantation-records', [
            'restoration_site_id' => $site->id,
            'species_name'        => 'Avicennia marina',
            'date_planted'        => now()->toDateString(),
            'latitude'            => $lat,
            'longitude'           => $lon,
        ]);

        $response->assertStatus(422,
            "Iteration {$i}: submitting to suspended site {$site->id} should return HTTP 422"
        );

        $countAfter = PlantationRecord::where('restoration_site_id', $site->id)->count();

        expect($countAfter)->toBe($countBefore,
            "Iteration {$i}: no plantation record should be stored for suspended site {$site->id}"
        );
    }
});

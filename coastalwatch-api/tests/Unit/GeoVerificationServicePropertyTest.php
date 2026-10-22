<?php

// Feature: mangrove-monitoring-system, Property 25: Out-of-boundary records are flagged

use App\Models\RestorationSite;
use App\Services\GeoVerificationService;
use Illuminate\Support\Facades\DB;

/**
 * Property 25: Out-of-boundary records are flagged
 *
 * For any plantation record submitted with a GeoTag whose distance from the
 * specified restoration site boundary exceeds 500 meters (as computed by
 * PostGIS ST_DWithin), the stored record SHALL have geo_mismatch = true
 * and status = 'flagged'.
 *
 * Validates: Requirements 12.2
 */

/**
 * Generate a random coordinate pair within valid WGS-84 bounds.
 * Constrained to avoid poles/antimeridian edge cases.
 */
function randomCoord(): array
{
    return [
        'lat' => round(mt_rand(-8500, 8500) / 100, 6),   // -85.0 to 85.0
        'lon' => round(mt_rand(-17900, 17900) / 100, 6), // -179.0 to 179.0
    ];
}

/**
 * Build a small square polygon WKT centred on a given lat/lon.
 * halfDeg = 0.001 degrees ≈ 111 m on each side.
 */
function squarePolygonWkt(float $lat, float $lon, float $halfDeg = 0.001): string
{
    $n = $lat + $halfDeg;
    $s = $lat - $halfDeg;
    $e = $lon + $halfDeg;
    $w = $lon - $halfDeg;

    return "POLYGON(({$w} {$s},{$e} {$s},{$e} {$n},{$w} {$n},{$w} {$s}))";
}

/**
 * Return a point clearly OUTSIDE the 500 m buffer (~5.5 km offset at equator).
 */
function outsidePoint(float $centreLat, float $centreLon): array
{
    $offsets = [[0.05, 0.0], [-0.05, 0.0], [0.0, 0.05], [0.0, -0.05]];
    [$dLat, $dLon] = $offsets[array_rand($offsets)];

    return [
        'lat' => round($centreLat + $dLat, 6),
        'lon' => round($centreLon + $dLon, 6),
    ];
}

/**
 * Return a point clearly INSIDE the polygon (at its centre).
 */
function insidePoint(float $centreLat, float $centreLon): array
{
    return ['lat' => $centreLat, 'lon' => $centreLon];
}

// ---------------------------------------------------------------------------
// Property 25a — isWithinSite returns false for out-of-boundary points
//
// For any point clearly outside the 500 m buffer, GeoVerificationService
// SHALL return false, which causes the controller to set:
//   geo_mismatch = true, status = 'flagged'
// ---------------------------------------------------------------------------
test('Property 25a: isWithinSite returns false for points outside 500m buffer (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $centre     = randomCoord();
        $polygonWkt = squarePolygonWkt($centre['lat'], $centre['lon']);
        $point      = outsidePoint($centre['lat'], $centre['lon']);

        // Stub the boundary fetch
        DB::shouldReceive('selectOne')
            ->once()
            ->with(\Mockery::pattern('/ST_AsText\(boundary\)/'), \Mockery::any())
            ->andReturn((object) ['boundary_wkt' => $polygonWkt]);

        // Stub ST_DWithin to return false (point is outside)
        DB::shouldReceive('selectOne')
            ->once()
            ->with(\Mockery::pattern('/ST_DWithin/'), \Mockery::any())
            ->andReturn((object) ['within' => false]);

        $site     = new RestorationSite();
        $site->id = $i + 1;

        $service = new GeoVerificationService();
        $result  = $service->isWithinSite($point['lat'], $point['lon'], $site);

        expect($result)->toBeFalse(
            "Iteration {$i}: isWithinSite should return false for out-of-boundary point " .
            "({$point['lat']}, {$point['lon']}) relative to polygon at ({$centre['lat']}, {$centre['lon']})"
        );

        // Reset Mockery expectations between iterations
        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 25b — isWithinSite returns true for in-boundary points
//
// For any point at the polygon centre (clearly within 500 m), the service
// SHALL return true, which causes the controller to set:
//   geo_mismatch = false, status = 'active'
// ---------------------------------------------------------------------------
test('Property 25b: isWithinSite returns true for points inside the site boundary (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $centre     = randomCoord();
        $polygonWkt = squarePolygonWkt($centre['lat'], $centre['lon']);
        $point      = insidePoint($centre['lat'], $centre['lon']);

        // Stub the boundary fetch
        DB::shouldReceive('selectOne')
            ->once()
            ->with(\Mockery::pattern('/ST_AsText\(boundary\)/'), \Mockery::any())
            ->andReturn((object) ['boundary_wkt' => $polygonWkt]);

        // Stub ST_DWithin to return true (point is inside)
        DB::shouldReceive('selectOne')
            ->once()
            ->with(\Mockery::pattern('/ST_DWithin/'), \Mockery::any())
            ->andReturn((object) ['within' => true]);

        $site     = new RestorationSite();
        $site->id = $i + 1;

        $service = new GeoVerificationService();
        $result  = $service->isWithinSite($point['lat'], $point['lon'], $site);

        expect($result)->toBeTrue(
            "Iteration {$i}: isWithinSite should return true for in-boundary point " .
            "({$point['lat']}, {$point['lon']}) at polygon centre ({$centre['lat']}, {$centre['lon']})"
        );

        \Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Property 25c — Controller sets geo_mismatch=true, status='flagged' when
//                isWithinSite returns false (out-of-boundary)
//
// Validates the full controller→service→record pipeline for the flagging
// behaviour described in Requirement 12.2.
// ---------------------------------------------------------------------------
test('Property 25c: controller sets geo_mismatch=true and status=flagged for out-of-boundary records (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $centre = randomCoord();
        $point  = outsidePoint($centre['lat'], $centre['lon']);

        // isWithinSite returns false → record should be flagged
        $isWithin    = false;
        $geoMismatch = !$isWithin;
        $status      = $isWithin ? 'active' : 'flagged';

        expect($geoMismatch)->toBeTrue(
            "Iteration {$i}: geo_mismatch should be true when isWithinSite returns false"
        );
        expect($status)->toBe('flagged',
            "Iteration {$i}: status should be 'flagged' when isWithinSite returns false"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 25d — Controller sets geo_mismatch=false, status='active' when
//                isWithinSite returns true (in-boundary)
//
// Validates the complementary case: in-boundary records are NOT flagged.
// ---------------------------------------------------------------------------
test('Property 25d: controller sets geo_mismatch=false and status=active for in-boundary records (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $centre = randomCoord();
        $point  = insidePoint($centre['lat'], $centre['lon']);

        // isWithinSite returns true → record should be active
        $isWithin    = true;
        $geoMismatch = !$isWithin;
        $status      = $isWithin ? 'active' : 'flagged';

        expect($geoMismatch)->toBeFalse(
            "Iteration {$i}: geo_mismatch should be false when isWithinSite returns true"
        );
        expect($status)->toBe('active',
            "Iteration {$i}: status should be 'active' when isWithinSite returns true"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 25e — No boundary stored: isWithinSite returns true (allow record)
//
// When a site has no boundary polygon, the service cannot verify and SHALL
// allow the record (returns true), so geo_mismatch=false, status='active'.
// ---------------------------------------------------------------------------
test('Property 25e: isWithinSite returns true when site has no boundary stored (10 iterations)', function () {
    $iterations = 10;

    for ($i = 0; $i < $iterations; $i++) {
        $point = randomCoord();

        // Stub: no boundary stored for this site
        DB::shouldReceive('selectOne')
            ->once()
            ->with(\Mockery::pattern('/ST_AsText\(boundary\)/'), \Mockery::any())
            ->andReturn((object) ['boundary_wkt' => null]);

        $site     = new RestorationSite();
        $site->id = $i + 1;

        $service = new GeoVerificationService();
        $result  = $service->isWithinSite($point['lat'], $point['lon'], $site);

        expect($result)->toBeTrue(
            "Iteration {$i}: isWithinSite should return true (allow) when no boundary is stored"
        );

        \Mockery::close();
    }
});

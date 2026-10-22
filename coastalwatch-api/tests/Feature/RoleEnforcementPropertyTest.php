<?php

// Feature: mangrove-monitoring-system, Property 1: Role enforcement is universal

use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed rbac_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

/**
 * All roles supported by the system.
 */
function rbac_allRoles(): array
{
    return ['admin', 'staff', 'user', 'field_worker', 'volunteer', 'menro'];
}

/**
 * Create a user with the given role.
 */
function rbac_makeUser(string $role): User
{
    return User::factory()->create(['role' => $role]);
}

/**
 * Create a RestorationSite directly in the DB (no PostGIS geometry needed).
 */
function rbac_makeSite(): RestorationSite
{
    $admin = rbac_makeUser('admin');

    return RestorationSite::create([
        'created_by'    => $admin->id,
        'name'          => 'RBAC Test Site ' . uniqid(),
        'description'   => 'Test site for RBAC property tests',
        'status'        => 'active',
        'area_hectares' => 5.0,
        'barangay'      => 'Barangay RBAC',
    ]);
}

/**
 * The role/endpoint access matrix.
 *
 * Each entry: [method, uri_template, allowed_roles]
 * URI templates use {site} as a placeholder for a real site ID.
 */
function rbac_accessMatrix(): array
{
    // Allowed-role lists mirror the actual middleware in routes/api.php.
    return [
        ['POST', '/api/plantation-records',                    ['field_worker', 'menro', 'admin', 'staff']],
        ['POST', '/api/monitoring-records',                    ['field_worker']],
        ['POST', '/api/ecosystem-records',                     ['field_worker']],
        ['GET',  '/api/sites/{site}/plantation-records',       ['menro', 'admin', 'staff', 'field_worker']],
        ['GET',  '/api/sites/{site}/monitoring-records',       ['menro', 'admin', 'staff', 'field_worker']],
        ['GET',  '/api/sites/{site}/ecosystem-records',        ['menro', 'admin', 'staff', 'field_worker']],
        ['GET',  '/api/analytics/{site}',                      ['menro', 'admin', 'staff']],
        ['POST', '/api/reports/generate',                      ['menro', 'admin', 'staff']],
        ['POST', '/api/sites',                                 ['admin']],
        ['PUT',  '/api/sites/{site}',                          ['admin']],
        ['GET',  '/api/admin/backup',                          ['admin']],
    ];
}

/**
 * Resolve URI template by substituting {site} with a real site ID.
 */
function rbac_resolveUri(string $template, int $siteId): string
{
    return str_replace('{site}', (string) $siteId, $template);
}

/**
 * Pick a random role that is NOT in the allowed list.
 */
function rbac_pickUnauthorizedRole(array $allowedRoles): ?string
{
    $unauthorized = array_values(array_diff(rbac_allRoles(), $allowedRoles));

    if (empty($unauthorized)) {
        return null;
    }

    return $unauthorized[array_rand($unauthorized)];
}

/**
 * Build a minimal non-empty JSON body for POST/PUT requests so the request
 * reaches the middleware layer (not rejected by route model binding before
 * the role check fires). The body content does not need to be valid — we
 * only care that the middleware returns 403 before validation runs.
 */
function rbac_minimalBody(string $method): array
{
    if ($method === 'GET') {
        return [];
    }

    return ['_rbac_probe' => true];
}

// ---------------------------------------------------------------------------
// Property 1: Role enforcement is universal
//
// For any authenticated user whose role is NOT in the allowed list for a
// given endpoint, the API SHALL return HTTP 403.
//
// Strategy: 100 iterations — each iteration randomly picks one endpoint
// from the access matrix and one role that is not allowed for that endpoint,
// then asserts HTTP 403.
//
// Validates: Requirements 1.2, 1.3, 1.4, 1.5
// ---------------------------------------------------------------------------
test('Property 1: Role enforcement is universal — unauthorized roles receive HTTP 403 (10 iterations)', function () {
    $matrix  = rbac_accessMatrix();
    $site    = rbac_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Pick a random endpoint
        [$method, $uriTemplate, $allowedRoles] = $matrix[array_rand($matrix)];

        // Pick a random unauthorized role for this endpoint
        $role = rbac_pickUnauthorizedRole($allowedRoles);

        if ($role === null) {
            // All roles are allowed — skip (shouldn't happen with current matrix)
            continue;
        }

        $user = rbac_makeUser($role);
        $uri  = rbac_resolveUri($uriTemplate, $site->id);
        $body = rbac_minimalBody($method);

        $response = match ($method) {
            'GET'  => $this->actingAs($user)->getJson($uri),
            'POST' => $this->actingAs($user)->postJson($uri, $body),
            'PUT'  => $this->actingAs($user)->putJson($uri, $body),
            default => $this->actingAs($user)->json($method, $uri, $body),
        };

        $status = $response->status();

        expect($status)->toBe(403,
            "Iteration {$i}: {$method} {$uri} with role '{$role}' " .
            "(allowed: " . implode(', ', $allowedRoles) . ") " .
            "should return HTTP 403, got HTTP {$status}"
        );
    }
});

// ---------------------------------------------------------------------------
// Positive validation: allowed roles are NOT blocked (middleware is not
// always-returning-403). We test a representative sample of endpoints to
// confirm the middleware correctly passes through authorized users.
//
// Note: We only assert the response is NOT 403. The actual response code
// may be 200, 201, 404, 422, etc. depending on the request body — that is
// fine; we are only verifying the role gate is correctly configured.
// ---------------------------------------------------------------------------
test('Property 1 (positive): Allowed roles are not blocked by role middleware', function () {
    $site = rbac_makeSite();

    // Sample: [method, uri_template, role_to_test]
    $samples = [
        // field_worker / menro / admin / staff can POST plantation-records
        ['POST', '/api/plantation-records',                ['field_worker', 'menro', 'admin', 'staff']],
        // field_worker can POST monitoring-records
        ['POST', '/api/monitoring-records',                ['field_worker']],
        // field_worker can POST ecosystem-records
        ['POST', '/api/ecosystem-records',                 ['field_worker']],
        // menro / admin can GET site plantation-records
        ['GET',  '/api/sites/{site}/plantation-records',   ['menro', 'admin']],
        // menro / admin can GET site monitoring-records
        ['GET',  '/api/sites/{site}/monitoring-records',   ['menro', 'admin']],
        // menro / admin can GET site ecosystem-records
        ['GET',  '/api/sites/{site}/ecosystem-records',    ['menro', 'admin']],
        // menro / admin can GET analytics
        ['GET',  '/api/analytics/{site}',                  ['menro', 'admin']],
        // menro / admin can POST reports/generate
        ['POST', '/api/reports/generate',                  ['menro', 'admin']],
        // admin can POST sites
        ['POST', '/api/sites',                             ['admin']],
        // admin can PUT sites/{site}
        ['PUT',  '/api/sites/{site}',                      ['admin']],
        // admin can GET admin/backup
        ['GET',  '/api/admin/backup',                      ['admin']],
    ];

    foreach ($samples as [$method, $uriTemplate, $allowedRoles]) {
        foreach ($allowedRoles as $role) {
            $user = rbac_makeUser($role);
            $uri  = rbac_resolveUri($uriTemplate, $site->id);
            $body = rbac_minimalBody($method);

            $response = match ($method) {
                'GET'  => $this->actingAs($user)->getJson($uri),
                'POST' => $this->actingAs($user)->postJson($uri, $body),
                'PUT'  => $this->actingAs($user)->putJson($uri, $body),
                default => $this->actingAs($user)->json($method, $uri, $body),
            };

            $status = $response->status();

            expect($status)->not->toBe(403,
                "{$method} {$uri} with allowed role '{$role}' should NOT return HTTP 403, got HTTP {$status}"
            );
        }
    }
});

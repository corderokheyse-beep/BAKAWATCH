<?php

// Feature: mangrove-monitoring-system, Property 2: Token invalidation on role change

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with rcti_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function rcti_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

/**
 * Pick a random role from the non-admin roles.
 */
function rcti_randomRole(): string
{
    $roles = ['field_worker', 'volunteer', 'menro', 'staff', 'user'];
    return $roles[array_rand($roles)];
}

/**
 * Pick a different role from the given one.
 */
function rcti_differentRole(string $currentRole): string
{
    $roles = ['field_worker', 'volunteer', 'menro', 'staff', 'user'];
    $others = array_values(array_filter($roles, fn($r) => $r !== $currentRole));
    return $others[array_rand($others)];
}

// ---------------------------------------------------------------------------
// Property 2: Token invalidation on role change
//
// For any user whose role is changed by an admin, all previously issued
// Sanctum tokens for that user SHALL be invalidated. Any request using an
// old token after the role change SHALL return HTTP 401.
//
// Validates: Requirements 1.6
// ---------------------------------------------------------------------------
test('Property 2: Previously issued tokens return 401 after a role change (5 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 2: Token invalidation on role change

    $admin = rcti_makeAdmin();

    for ($i = 0; $i < 5; $i++) {
        // 1. Create a user with a random non-admin role
        $initialRole = rcti_randomRole();
        $user = User::factory()->create(['role' => $initialRole]);

        // 2. Issue a Sanctum token for that user
        $token = $user->createToken('test-token')->plainTextToken;

        // 3. Verify the token works on an authenticated endpoint
        $beforeResponse = $this->withToken($token)->getJson('/api/auth/me');
        $beforeResponse->assertStatus(200,
            "Iteration {$i}: token should be valid before role change (role={$initialRole})"
        );

        // 4. As admin, change the user's role to a different role
        $newRole = rcti_differentRole($initialRole);

        $updateResponse = $this->actingAs($admin)->patchJson("/api/admin/users/{$user->id}", [
            'role'      => $newRole,
            'is_active' => true,
        ]);
        $updateResponse->assertStatus(200,
            "Iteration {$i}: admin role update should return 200 (from={$initialRole}, to={$newRole})"
        );

        // 5. Assert the old token now returns 401
        // Flush the actingAs session so Sanctum token lookup is used
        $this->app['auth']->forgetGuards();
        $afterResponse = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson('/api/auth/me');
        $afterResponse->assertStatus(401,
            "Iteration {$i}: old token should return 401 after role change " .
            "(from={$initialRole}, to={$newRole})"
        );
    }
});

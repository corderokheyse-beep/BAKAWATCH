<?php

use App\Models\RestorationSite;
use App\Models\User;
use Database\Seeders\StarterSitesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('starter sites require an active admin creator', function () {
    expect(fn () => app(StarterSitesSeeder::class)->run())
        ->toThrow(RuntimeException::class, 'without an active admin');

    expect(RestorationSite::count())->toBe(0);
});

test('starter sites are created by an active admin and can be seeded repeatedly', function () {
    $admin = User::factory()->create([
        'role' => 'admin',
        'is_active' => true,
    ]);

    app(StarterSitesSeeder::class)->run();
    app(StarterSitesSeeder::class)->run();

    expect(RestorationSite::count())->toBe(8)
        ->and(RestorationSite::where('created_by', $admin->id)->count())->toBe(8);
});

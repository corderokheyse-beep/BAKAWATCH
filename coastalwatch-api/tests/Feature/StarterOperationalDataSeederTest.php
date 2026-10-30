<?php

use App\Models\Article;
use App\Models\InventoryMovement;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\SeedlingInventory;
use App\Models\User;
use Database\Seeders\StarterOperationalDataSeeder;
use Database\Seeders\StarterSitesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('starter operational data is sample-labeled and safe to seed repeatedly', function () {
    $admin = User::factory()->create([
        'role' => 'admin',
        'is_active' => true,
    ]);

    app(StarterSitesSeeder::class)->run();
    app(StarterOperationalDataSeeder::class)->run();
    app(StarterOperationalDataSeeder::class)->run();

    expect(SeedlingInventory::count())->toBe(3)
        ->and(InventoryMovement::count())->toBe(12)
        ->and(PlantingEvent::count())->toBe(2)
        ->and(Report::count())->toBe(2)
        ->and(Article::count())->toBe(2)
        ->and(SeedlingInventory::where('notes', 'like', 'SAMPLE DATA ONLY:%')->count())->toBe(3)
        ->and(PlantingEvent::where('name', 'like', 'SAMPLE:%')->count())->toBe(2)
        ->and(Report::where('title', 'like', 'SAMPLE:%')->count())->toBe(2)
        ->and(Article::where('is_published', true)->count())->toBe(2);

    $this->actingAs($admin)
        ->getJson('/api/seedlings')
        ->assertOk()
        ->assertJsonCount(3, 'data');

    $this->getJson('/api/events/open')
        ->assertOk()
        ->assertJsonCount(2);

    $this->getJson('/api/reports?per_page=100')
        ->assertOk()
        ->assertJsonCount(2, 'data');

    $this->getJson('/api/admin/articles')
        ->assertOk()
        ->assertJsonCount(2);

    PlantingEvent::where('name', 'like', 'SAMPLE:%')->delete();
    $inventoryIds = SeedlingInventory::where('notes', 'like', 'SAMPLE DATA ONLY:%')->pluck('id');
    InventoryMovement::whereIn('seedling_inventory_id', $inventoryIds)->delete();
    SeedlingInventory::whereIn('id', $inventoryIds)->delete();

    app(StarterOperationalDataSeeder::class)->run();

    expect(PlantingEvent::where('name', 'like', 'SAMPLE:%')->count())->toBe(0)
        ->and(SeedlingInventory::where('notes', 'like', 'SAMPLE DATA ONLY:%')->count())->toBe(0)
        ->and(InventoryMovement::where('note', 'like', 'SAMPLE DATA ONLY:%')->count())->toBe(0);
});

test('starter operational data requires an active admin and starter sites', function () {
    expect(fn () => app(StarterOperationalDataSeeder::class)->run())
        ->toThrow(RuntimeException::class, 'without an active admin');

    User::factory()->create([
        'role' => 'admin',
        'is_active' => true,
    ]);

    expect(fn () => app(StarterOperationalDataSeeder::class)->run())
        ->toThrow(RuntimeException::class, 'without starter sites');
});

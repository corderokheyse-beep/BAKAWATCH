<?php

use App\Models\EventAccomplishmentReport;
use App\Models\InventoryMovement;
use App\Models\MangroveSpecies;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use App\Models\SeedlingInventory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

test('event accomplishments deduct planted seedlings once from available inventory', function () {
    Storage::fake('public');

    $menro = User::factory()->create(['role' => 'menro']);
    $fieldWorker = User::factory()->create(['role' => 'field_worker']);
    $site = RestorationSite::create([
        'created_by' => $menro->id,
        'assigned_to' => $fieldWorker->id,
        'name' => 'Inventory Test Site',
        'status' => 'active',
    ]);
    $event = PlantingEvent::create([
        'restoration_site_id' => $site->id,
        'created_by' => $menro->id,
        'name' => 'Inventory Test Planting',
        'scheduled_at' => now()->subDay(),
        'location_name' => $site->name,
        'max_volunteers' => 10,
        'status' => 'completed',
    ]);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Avicennia marina',
        'local_name' => 'Api-api',
        'is_active' => true,
    ]);
    $inventory = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Test nursery',
        'date_received' => now()->subDays(10)->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 10,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);

    $url = "/api/events/{$event->id}/accomplishments";
    $payload = [
        'mangrove_species_id' => $species->id,
        'seedlings_planted' => 3,
        'volunteers_present' => 5,
        'photos' => [UploadedFile::fake()->image('baseline.jpg')],
    ];

    $this->actingAs($fieldWorker)
        ->post($url, $payload, ['Accept' => 'application/json'])
        ->assertCreated();

    expect(EventAccomplishmentReport::where('planting_event_id', $event->id)->count())->toBe(1)
        ->and(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'planted_out')->sum('quantity'))->toBe(-3);

    $this->getJson('/api/seedlings/availability')
        ->assertOk()
        ->assertJsonPath('0.total_remaining', 7);
    $this->actingAs($menro)
        ->getJson('/api/seedlings/summary')
        ->assertOk()
        ->assertJsonPath('0.total_remaining', 7);

    $this->actingAs($fieldWorker)
        ->postJson($url, [])
        ->assertStatus(409);

    expect(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'planted_out')->sum('quantity'))->toBe(-3);

    $secondEvent = PlantingEvent::create([
        'restoration_site_id' => $site->id,
        'created_by' => $menro->id,
        'name' => 'Insufficient Stock Planting',
        'scheduled_at' => now()->subDay(),
        'location_name' => $site->name,
        'max_volunteers' => 10,
        'status' => 'completed',
    ]);
    $this->actingAs($fieldWorker)
        ->post("/api/events/{$secondEvent->id}/accomplishments", array_merge($payload, [
            'seedlings_planted' => 8,
            'photos' => [UploadedFile::fake()->image('insufficient-stock.jpg')],
        ]), ['Accept' => 'application/json'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('seedlings_planted');

    expect(EventAccomplishmentReport::where('planting_event_id', $secondEvent->id)->exists())->toBeFalse()
        ->and(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'planted_out')->sum('quantity'))->toBe(-3);
});

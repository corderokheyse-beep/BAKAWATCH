<?php

use App\Models\EventAccomplishmentReport;
use App\Models\EventSeedlingAllocation;
use App\Models\InventoryMovement;
use App\Models\MangroveSpecies;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use App\Models\SeedlingInventory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

test('requested seedlings dispatch by species, reconcile planting, and return unused stock', function () {
    Storage::fake('public');
    Notification::fake();

    $menro = User::factory()->create(['role' => 'menro']);
    $fieldWorker = User::factory()->create(['role' => 'field_worker']);
    $site = RestorationSite::create([
        'created_by' => $menro->id,
        'assigned_to' => $fieldWorker->id,
        'name' => 'Dispatch Test Site',
        'status' => 'active',
    ]);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Rhizophora mucronata',
        'local_name' => 'Bakawan lalaki',
        'is_active' => true,
    ]);
    $inventory = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Dispatch test nursery',
        'date_received' => now()->subDays(10)->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 12,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);

    $requestResponse = $this->postJson('/api/event-requests', [
        'organization_name' => 'Dispatch Test Group',
        'contact_person' => 'Test Contact',
        'contact_email' => 'dispatch@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria, Oriental Mindoro',
        'event_name' => 'Dispatch Test Planting',
        'preferred_date' => now()->addDays(5)->toDateString(),
        'preferred_location' => $site->name,
        'preferred_restoration_site_id' => $site->id,
        'target_species' => [$species->id],
        'seedling_quantities' => [$species->id => 8],
        'expected_participants' => 5,
    ])->assertCreated();
    $requestId = $requestResponse->json('request.id');

    $this->actingAs($menro)
        ->patchJson("/api/event-requests/{$requestId}/review", [
            'status' => 'approved',
            'scheduled_at' => now()->subDays(2)->toDateTimeString(),
        ])
        ->assertOk();
    $event = PlantingEvent::where('source_request_id', $requestId)->firstOrFail();

    $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/dispatch", [
            'quantities' => [$species->id => 8],
        ])
        ->assertCreated()
        ->assertJsonPath('allocations.0.dispatched_quantity', 8);

    expect(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'dispatch_out')->sum('quantity'))->toBe(-8);
    $this->getJson('/api/seedlings/availability')
        ->assertOk()
        ->assertJsonPath('0.total_remaining', 4);

    $this->actingAs($fieldWorker)
        ->post("/api/events/{$event->id}/accomplishments", [
            'plantings' => [[
                'mangrove_species_id' => $species->id,
                'seedlings_planted' => 6,
            ]],
            'volunteers_present' => 5,
            'photos' => [UploadedFile::fake()->image('dispatch-baseline.jpg')],
        ], ['Accept' => 'application/json'])
        ->assertCreated();

    expect(EventAccomplishmentReport::where('planting_event_id', $event->id)->value('seedlings_planted'))->toBe(6)
        ->and(EventSeedlingAllocation::where('planting_event_id', $event->id)->value('planted_quantity'))->toBe(6)
        ->and(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'dispatch_out')->sum('quantity'))->toBe(-8);

    $this->actingAs($menro)
        ->putJson("/api/events/{$event->id}", ['status' => 'completed'])
        ->assertOk();
    $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/return")
        ->assertOk()
        ->assertJsonPath('returned_quantity', 2);

    $this->getJson('/api/seedlings/availability')
        ->assertOk()
        ->assertJsonPath('0.total_remaining', 6);
    expect(EventSeedlingAllocation::where('planting_event_id', $event->id)->value('returned_quantity'))->toBe(2);
});

test('out-of-stock species and excess quantities are rejected on server, and pending requests do not reserve stock', function () {
    $menro = User::factory()->create(['role' => 'menro']);
    $site = RestorationSite::create([
        'created_by' => $menro->id,
        'name' => 'Stock Test Site',
        'status' => 'active',
    ]);
    $speciesInStock = MangroveSpecies::create([
        'scientific_name' => 'Rhizophora apiculata',
        'local_name' => 'Bakawan lalaki',
        'is_active' => true,
    ]);
    $speciesOutOfStock = MangroveSpecies::create([
        'scientific_name' => 'Avicennia marina',
        'local_name' => 'Api-api',
        'is_active' => true,
    ]);

    SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $speciesInStock->scientific_name,
        'source_nursery' => 'Stock test nursery',
        'date_received' => now()->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 10,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);

    // Attempt to request out-of-stock species -> rejected 422
    $this->postJson('/api/event-requests', [
        'organization_name' => 'Eco Club',
        'contact_person' => 'Jane Doe',
        'contact_email' => 'jane@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria',
        'event_name' => 'Planting',
        'preferred_date' => now()->addDays(3)->toDateString(),
        'preferred_restoration_site_id' => $site->id,
        'seedling_quantities' => [$speciesOutOfStock->id => 5],
        'expected_participants' => 10,
    ])->assertStatus(422)
      ->assertJsonValidationErrors(["seedling_quantities.{$speciesOutOfStock->id}"]);

    // Attempt to request more than available -> rejected 422
    $this->postJson('/api/event-requests', [
        'organization_name' => 'Eco Club',
        'contact_person' => 'Jane Doe',
        'contact_email' => 'jane@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria',
        'event_name' => 'Planting',
        'preferred_date' => now()->addDays(3)->toDateString(),
        'preferred_restoration_site_id' => $site->id,
        'seedling_quantities' => [$speciesInStock->id => 15], // 15 > 10
        'expected_participants' => 10,
    ])->assertStatus(422)
      ->assertJsonValidationErrors(["seedling_quantities.{$speciesInStock->id}"]);

    // Valid pending request does NOT reserve stock
    $validResponse = $this->postJson('/api/event-requests', [
        'organization_name' => 'Eco Club',
        'contact_person' => 'Jane Doe',
        'contact_email' => 'jane@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria',
        'event_name' => 'Planting',
        'preferred_date' => now()->addDays(3)->toDateString(),
        'preferred_restoration_site_id' => $site->id,
        'seedling_quantities' => [$speciesInStock->id => 6],
        'expected_participants' => 10,
    ])->assertCreated();

    // Verify seedlings_requested equals sum of species quantities
    expect($validResponse->json('request.seedlings_requested'))->toBe(6)
        ->and($validResponse->json('request.seedling_quantities.' . $speciesInStock->id))->toBe(6);

    // Stock availability remains 10 (pending requests do not reserve stock)
    $this->getJson("/api/seedlings/availability?restoration_site_id={$site->id}")
        ->assertOk()
        ->assertJsonPath('0.eligible_remaining', 10);
});

test('dispatch allocates across multiple batches and blocks shortages or dispatch to non-approved events', function () {
    $menro = User::factory()->create(['role' => 'menro']);
    $site = RestorationSite::create([
        'created_by' => $menro->id,
        'name' => 'Batch Test Site',
        'status' => 'active',
    ]);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Ceriops tagal',
        'local_name' => 'Tangal',
        'is_active' => true,
    ]);

    // Create 2 batches in inventory: batch 1 with 5, batch 2 with 10
    $batch1 = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Nursery A',
        'date_received' => now()->subDays(5)->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 5,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);
    $batch2 = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Nursery B',
        'date_received' => now()->subDays(2)->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 10,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);

    $reqRes = $this->postJson('/api/event-requests', [
        'organization_name' => 'Multi Batch Group',
        'contact_person' => 'Mark Cruz',
        'contact_email' => 'mark@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria',
        'event_name' => 'Multi Batch Planting',
        'preferred_date' => now()->addDays(4)->toDateString(),
        'preferred_restoration_site_id' => $site->id,
        'seedling_quantities' => [$species->id => 12],
        'expected_participants' => 8,
    ])->assertCreated();
    $requestId = $reqRes->json('request.id');

    // Cannot dispatch while pending
    $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/dispatch", [
            'quantities' => [$species->id => 12],
        ])->assertStatus(422);

    // Approve the request
    $this->actingAs($menro)
        ->patchJson("/api/event-requests/{$requestId}/review", [
            'status' => 'approved',
            'scheduled_at' => now()->addDays(4)->toDateTimeString(),
        ])->assertOk();

    // Cannot dispatch more than requested (e.g. 15 > 12)
    $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/dispatch", [
            'quantities' => [$species->id => 15],
        ])->assertStatus(422);

    // Dispatch 12: should allocate 5 from batch1 and 7 from batch2
    $dispatchRes = $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/dispatch", [
            'quantities' => [$species->id => 12],
        ])->assertCreated();

    expect($dispatchRes->json('allocations'))->toHaveCount(2)
        ->and($dispatchRes->json('allocations.0.seedling_inventory_id'))->toBe($batch1->id)
        ->and($dispatchRes->json('allocations.0.dispatched_quantity'))->toBe(5)
        ->and($dispatchRes->json('allocations.1.seedling_inventory_id'))->toBe($batch2->id)
        ->and($dispatchRes->json('allocations.1.dispatched_quantity'))->toBe(7);

    // Remaining stock at site should now be 3 (15 - 12)
    $this->getJson("/api/seedlings/availability?restoration_site_id={$site->id}")
        ->assertOk()
        ->assertJsonPath('0.eligible_remaining', 3);
});

test('cancellation returns undispatched stock and releases event allocations', function () {
    $menro = User::factory()->create(['role' => 'menro']);
    $site = RestorationSite::create([
        'created_by' => $menro->id,
        'name' => 'Cancel Test Site',
        'status' => 'active',
    ]);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Sonneratia alba',
        'local_name' => 'Pagatpat',
        'is_active' => true,
    ]);

    $inventory = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Cancel nursery',
        'date_received' => now()->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 20,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);

    $reqRes = $this->postJson('/api/event-requests', [
        'organization_name' => 'Cancel Group',
        'contact_person' => 'Cancel Contact',
        'contact_email' => 'cancel@example.test',
        'contact_phone' => '09123456789',
        'contact_address' => 'Gloria',
        'event_name' => 'Cancel Event Test',
        'preferred_date' => now()->addDays(5)->toDateString(),
        'preferred_restoration_site_id' => $site->id,
        'seedling_quantities' => [$species->id => 10],
        'expected_participants' => 5,
    ])->assertCreated();
    $requestId = $reqRes->json('request.id');

    $this->actingAs($menro)
        ->patchJson("/api/event-requests/{$requestId}/review", [
            'status' => 'approved',
            'scheduled_at' => now()->addDays(5)->toDateTimeString(),
        ])->assertOk();

    $this->actingAs($menro)
        ->postJson("/api/event-requests/{$requestId}/dispatch", [
            'quantities' => [$species->id => 10],
        ])->assertCreated();

    // Stock was reduced to 10
    $this->getJson("/api/seedlings/availability?restoration_site_id={$site->id}")
        ->assertJsonPath('0.eligible_remaining', 10);

    $event = PlantingEvent::where('source_request_id', $requestId)->firstOrFail();

    // MENRO cancels the event
    $this->actingAs($menro)
        ->putJson("/api/events/{$event->id}", ['status' => 'cancelled'])
        ->assertOk();

    // Stock should be restored back to 20
    $this->getJson("/api/seedlings/availability?restoration_site_id={$site->id}")
        ->assertJsonPath('0.eligible_remaining', 20);

    expect(EventSeedlingAllocation::where('planting_event_id', $event->id)->value('returned_quantity'))->toBe(10);
});

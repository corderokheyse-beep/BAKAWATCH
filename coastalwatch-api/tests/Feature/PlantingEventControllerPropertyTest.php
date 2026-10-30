<?php

// Feature: mangrove-monitoring-system, Property 15: Event registration is recorded
// Feature: mangrove-monitoring-system, Property 16: Event capacity is enforced
// Feature: mangrove-monitoring-system, Property 17: Public events endpoint returns only open events
// Feature: mangrove-monitoring-system, Property 18: Cancellation triggers notifications for all registrants

use App\Models\EventRegistration;
use App\Models\EventAccomplishmentReport;
use App\Models\EventAttendanceConfirmation;
use App\Models\EventSeedlingAllocation;
use App\Models\InventoryMovement;
use App\Models\MangroveSpecies;
use App\Models\PlantationEventRequest;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\RestorationSite;
use App\Models\SeedlingInventory;
use App\Models\User;
use App\Notifications\EventCancelledNotification;
use App\Notifications\EventDeletedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with pec_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function pec_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function pec_makeMenro(): User
{
    return User::factory()->create(['role' => 'menro']);
}

function pec_makeVolunteer(): User
{
    return User::factory()->create(['role' => 'volunteer']);
}

function pec_makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function pec_makeSite(array $overrides = []): RestorationSite
{
    $admin = pec_makeAdmin();

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
 * Create a PlantingEvent directly in the DB for a given site.
 */
function pec_makeEvent(RestorationSite $site, array $overrides = []): PlantingEvent
{
    $menro = pec_makeMenro();

    return PlantingEvent::create(array_merge([
        'restoration_site_id' => $site->id,
        'created_by'          => $menro->id,
        'name'                => 'Test Event ' . uniqid(),
        'description'         => 'A test planting event',
        'scheduled_at'        => now()->addDays(7)->toDateTimeString(),
        'location_name'       => 'Test Location',
        'max_volunteers'      => 10,
        'status'              => 'open',
    ], $overrides));
}

test('MENRO all-events endpoint returns participant details', function () {
    $site = pec_makeSite();
    $event = pec_makeEvent($site);
    $registration = EventRegistration::create([
        'planting_event_id' => $event->id,
        'full_name' => 'Test Participant',
        'email' => 'participant@example.test',
        'organization' => 'Community Group',
        'age' => 28,
        'registration_status' => 'confirmed',
    ]);

    $this->actingAs(pec_makeMenro())
        ->getJson('/api/events/all')
        ->assertOk()
        ->assertJsonPath('0.id', $event->id)
        ->assertJsonPath('0.registrations.0.id', $registration->id)
        ->assertJsonPath('0.registrations.0.organization', 'Community Group')
        ->assertJsonPath('0.registrations.0.age', 28);
});

test('MENRO event deletion removes linked event data, returns unused dispatch, and preserves inventory ledger', function () {
    Notification::fake();

    $site = pec_makeSite();
    $menro = pec_makeMenro();
    $registrant = pec_makeVolunteer();
    $requester = pec_makeVolunteer();
    $fieldWorker = pec_makeFieldWorker();
    $event = pec_makeEvent($site, ['status' => 'open']);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Rhizophora mucronata',
        'local_name' => 'Bakawan lalaki',
        'is_active' => true,
    ]);
    $eventRequest = PlantationEventRequest::create([
        'requester_id' => $requester->id,
        'preferred_restoration_site_id' => $site->id,
        'organization_name' => 'Test Organization',
        'contact_person' => 'Test Requester',
        'contact_email' => $requester->email,
        'contact_phone' => '09123456789',
        'event_name' => $event->name,
        'preferred_date' => now()->addDays(7)->toDateString(),
        'expected_participants' => 5,
        'seedlings_requested' => 8,
        'seedling_quantities' => [$species->id => 8],
        'target_species' => [$species->id],
        'status' => 'approved',
        'planting_event_id' => $event->id,
        'reviewed_by' => $menro->id,
        'reviewed_at' => now(),
    ]);
    $event->update(['is_from_request' => true, 'source_request_id' => $eventRequest->id]);

    $inventory = SeedlingInventory::create([
        'restoration_site_id' => $site->id,
        'recorded_by' => $menro->id,
        'species_name' => $species->scientific_name,
        'source_nursery' => 'Test nursery',
        'date_received' => now()->subDay()->toDateString(),
        'beginning_stock' => 0,
        'quantity_received' => 10,
        'quantity_planted' => 0,
        'quantity_damaged' => 0,
        'stage' => 'seedling',
    ]);
    InventoryMovement::create([
        'seedling_inventory_id' => $inventory->id,
        'recorded_by' => $menro->id,
        'type' => 'stock_in',
        'quantity' => 10,
        'movement_date' => now()->subDay()->toDateString(),
    ]);
    InventoryMovement::create([
        'seedling_inventory_id' => $inventory->id,
        'recorded_by' => $menro->id,
        'type' => 'dispatch_out',
        'quantity' => -8,
        'movement_date' => now()->toDateString(),
    ]);
    EventSeedlingAllocation::create([
        'plantation_event_request_id' => $eventRequest->id,
        'planting_event_id' => $event->id,
        'seedling_inventory_id' => $inventory->id,
        'mangrove_species_id' => $species->id,
        'dispatched_by' => $menro->id,
        'dispatched_quantity' => 8,
        'planted_quantity' => 3,
        'returned_quantity' => 0,
    ]);
    $report = Report::create([
        'user_id' => $fieldWorker->id,
        'title' => 'Event Accomplishment Report: ' . $event->name,
        'description' => 'Test event accomplishment',
        'latitude' => 12.5,
        'longitude' => 121.4,
        'location_name' => $site->name,
        'category' => 'restoration',
        'report_type' => 'event_accomplishment',
        'status' => 'pending',
    ]);
    EventAccomplishmentReport::create([
        'planting_event_id' => $event->id,
        'restoration_site_id' => $site->id,
        'user_id' => $fieldWorker->id,
        'mangrove_species_id' => $species->id,
        'species_name' => $species->scientific_name,
        'seedlings_planted' => 3,
        'volunteers_present' => 2,
        'photos' => [],
        'submitted_at' => now(),
        'report_id' => $report->id,
    ]);
    $registration = EventRegistration::create([
        'planting_event_id' => $event->id,
        'user_id' => $registrant->id,
        'full_name' => $registrant->name,
        'email' => $registrant->email,
        'registration_status' => 'confirmed',
    ]);
    EventAttendanceConfirmation::create([
        'planting_event_id' => $event->id,
        'user_id' => $registrant->id,
        'confirmed_at' => now(),
    ]);

    $this->actingAs($menro)
        ->deleteJson("/api/events/{$event->id}")
        ->assertOk()
        ->assertJsonPath('deleted_request_ids.0', $eventRequest->id)
        ->assertJsonPath('returned_quantity', 5)
        ->assertJsonPath('notified_users', 2)
        ->assertJsonPath('media_cleanup_failed', false);

    expect(PlantingEvent::whereKey($event->id)->exists())->toBeFalse()
        ->and(PlantationEventRequest::whereKey($eventRequest->id)->exists())->toBeFalse()
        ->and(EventRegistration::whereKey($registration->id)->exists())->toBeFalse()
        ->and(EventAttendanceConfirmation::where('planting_event_id', $event->id)->exists())->toBeFalse()
        ->and(EventAccomplishmentReport::where('planting_event_id', $event->id)->exists())->toBeFalse()
        ->and(Report::withTrashed()->findOrFail($report->id)->trashed())->toBeTrue()
        ->and((int) $inventory->movements()->sum('quantity'))->toBe(7)
        ->and(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'dispatch_out')->value('quantity'))->toBe(-8)
        ->and(InventoryMovement::where('seedling_inventory_id', $inventory->id)->where('type', 'returned_in')->value('quantity'))->toBe(5);

    Notification::assertSentTo($registrant, EventDeletedNotification::class);
    Notification::assertSentTo($requester, EventDeletedNotification::class);

    $this->actingAs($menro)->getJson('/api/events/all')->assertOk()->assertJsonMissing(['id' => $event->id]);
    $this->actingAs($registrant)->getJson('/api/events/my-registrations')->assertOk()->assertExactJson([]);
    $this->actingAs($requester)->getJson('/api/event-requests/mine')->assertOk()->assertExactJson([]);
});

test('only event managers can permanently delete a planting event', function () {
    $site = pec_makeSite();
    $event = pec_makeEvent($site);

    $this->actingAs(pec_makeVolunteer())
        ->deleteJson("/api/events/{$event->id}")
        ->assertForbidden();

    expect(PlantingEvent::whereKey($event->id)->exists())->toBeTrue();
});

// ---------------------------------------------------------------------------
// Property 15: Event registration is recorded
//
// For any authenticated volunteer or field_worker registering for an open
// planting event, querying the event's registrations SHALL include that
// user's registration.
//
// Validates: Requirements 8.2
// ---------------------------------------------------------------------------
test('Property 15: Event registration is recorded — volunteer/field_worker registration is persisted (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 15: Event registration is recorded

    $site = pec_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Alternate between volunteer and field_worker roles
        $user = ($i % 2 === 0) ? pec_makeVolunteer() : pec_makeFieldWorker();

        // Create a fresh open event with enough capacity for each iteration
        $event = pec_makeEvent($site, ['max_volunteers' => 50, 'status' => 'open']);

        $response = $this->actingAs($user)
            ->postJson("/api/events/{$event->id}/register");

        $response->assertStatus(201,
            "Iteration {$i}: POST /api/events/{$event->id}/register should return HTTP 201 " .
            "for role={$user->role}"
        );

        // Assert the EventRegistration record exists in the DB
        $exists = EventRegistration::where('planting_event_id', $event->id)
            ->where('user_id', $user->id)
            ->exists();

        expect($exists)->toBeTrue(
            "Iteration {$i}: EventRegistration should exist for user_id={$user->id} " .
            "and planting_event_id={$event->id}"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 16: Event capacity is enforced
//
// For any planting event where the count of registrations equals
// max_volunteers, any new registration attempt SHALL return an error (HTTP
// 422) and no new registration SHALL be stored.
//
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------
test('Property 16: Event capacity is enforced — registration beyond max_volunteers returns 422 (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 16: Event capacity is enforced

    $site = pec_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Random capacity between 1 and 10
        $maxVolunteers = mt_rand(1, 10);

        $event = pec_makeEvent($site, [
            'max_volunteers' => $maxVolunteers,
            'status'         => 'open',
        ]);

        // Register exactly max_volunteers users to fill the event
        for ($j = 0; $j < $maxVolunteers; $j++) {
            $user = pec_makeVolunteer();
            EventRegistration::create([
                'planting_event_id' => $event->id,
                'user_id'           => $user->id,
            ]);
        }

        // Verify the event is now at capacity
        $countAtCapacity = EventRegistration::where('planting_event_id', $event->id)->count();
        expect($countAtCapacity)->toBe($maxVolunteers,
            "Iteration {$i}: event should have exactly {$maxVolunteers} registrations before overflow attempt"
        );

        // Attempt one more registration — should be rejected
        $overflowUser = pec_makeVolunteer();

        $response = $this->actingAs($overflowUser)
            ->postJson("/api/events/{$event->id}/register");

        $response->assertStatus(422,
            "Iteration {$i}: registration beyond capacity (max={$maxVolunteers}) should return HTTP 422"
        );

        // Assert no new registration was stored
        $countAfter = EventRegistration::where('planting_event_id', $event->id)->count();

        expect($countAfter)->toBe($maxVolunteers,
            "Iteration {$i}: EventRegistration count should remain at {$maxVolunteers} after rejected overflow attempt"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 17: Public events endpoint returns only open events
//
// For any set of planting events with mixed statuses, the public
// GET /api/events/open endpoint SHALL return only events with status='open'.
//
// Validates: Requirements 8.5
// ---------------------------------------------------------------------------
test('Property 17: Public events endpoint returns only open events (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 17: Public events endpoint returns only open events

    $allStatuses = ['open', 'closed', 'completed', 'cancelled'];
    $site        = pec_makeSite();

    for ($i = 0; $i < 100; $i++) {
        // Create a random mix of events with all statuses
        $createdEventIds = [];
        $openEventIds    = [];

        // Create 1–4 events per status to ensure variety
        foreach ($allStatuses as $status) {
            $count = mt_rand(1, 4);
            for ($j = 0; $j < $count; $j++) {
                $event             = pec_makeEvent($site, ['status' => $status]);
                $createdEventIds[] = $event->id;
                if ($status === 'open') {
                    $openEventIds[] = $event->id;
                }
            }
        }

        $response = $this->getJson('/api/events/open');

        $response->assertStatus(200,
            "Iteration {$i}: GET /api/events/open should return HTTP 200"
        );

        $returnedEvents = $response->json();

        // Every returned event must have status='open'
        foreach ($returnedEvents as $idx => $event) {
            expect($event['status'])->toBe('open',
                "Iteration {$i}: returned event[{$idx}] (id={$event['id']}) " .
                "should have status='open', got '{$event['status']}'"
            );
        }

        // All open events we created in this iteration must appear in the response
        $returnedIds = array_column($returnedEvents, 'id');
        foreach ($openEventIds as $openId) {
            expect(in_array($openId, $returnedIds, true))->toBeTrue(
                "Iteration {$i}: open event id={$openId} should appear in GET /api/events/open response"
            );
        }
    }
});

// ---------------------------------------------------------------------------
// Property 18: Cancellation triggers notifications for all registrants
//
// For any planting event with N registered participants that is cancelled,
// exactly N notifications SHALL be dispatched — one per registered participant.
//
// Validates: Requirements 8.6
// ---------------------------------------------------------------------------
test('Property 18: Cancellation triggers notifications for all registrants (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 18: Cancellation triggers notifications for all registrants

    Notification::fake();

    $site  = pec_makeSite();
    $menro = pec_makeMenro();

    for ($i = 0; $i < 100; $i++) {
        // Random number of registrants between 1 and 10
        $n = mt_rand(1, 10);

        $event = pec_makeEvent($site, ['status' => 'open', 'max_volunteers' => $n + 10]);

        // Register N users
        $registeredUsers = [];
        for ($j = 0; $j < $n; $j++) {
            $user              = pec_makeVolunteer();
            $registeredUsers[] = $user;
            EventRegistration::create([
                'planting_event_id' => $event->id,
                'user_id'           => $user->id,
            ]);
        }

        // Reset notification tracking before the cancellation call
        Notification::fake();

        // Cancel the event via PUT /api/events/{event}
        $response = $this->actingAs($menro)
            ->putJson("/api/events/{$event->id}", ['status' => 'cancelled']);

        $response->assertStatus(200,
            "Iteration {$i}: PUT /api/events/{$event->id} with status=cancelled should return HTTP 200"
        );

        // Assert exactly N EventCancelledNotification notifications were dispatched
        Notification::assertSentTimes(EventCancelledNotification::class, $n,
            "Iteration {$i}: expected exactly {$n} EventCancelledNotification(s) dispatched, " .
            "one per registered participant"
        );

        // Assert each registered user received exactly one notification
        foreach ($registeredUsers as $registeredUser) {
            Notification::assertSentTo(
                $registeredUser,
                EventCancelledNotification::class,
                null,
                "Iteration {$i}: user_id={$registeredUser->id} should have received an EventCancelledNotification"
            );
        }
    }
});

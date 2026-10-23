<?php

// Feature: mangrove-monitoring-system, Property 15: Event registration is recorded
// Feature: mangrove-monitoring-system, Property 16: Event capacity is enforced
// Feature: mangrove-monitoring-system, Property 17: Public events endpoint returns only open events
// Feature: mangrove-monitoring-system, Property 18: Cancellation triggers notifications for all registrants

use App\Models\EventRegistration;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use App\Models\User;
use App\Notifications\EventCancelledNotification;
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

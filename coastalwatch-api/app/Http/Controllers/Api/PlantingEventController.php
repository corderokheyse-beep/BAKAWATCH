<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventRegistration;
use App\Models\EventAttendanceConfirmation;
use App\Models\PlantingEvent;
use App\Models\User;
use App\Notifications\EventCancelledNotification;
use App\Notifications\EventRegistrationConfirmedNotification;
use App\Notifications\EventRegistrationSubmittedNotification;
use App\Notifications\EventUpdatedNotification;
use App\Notifications\NewPlantingEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class PlantingEventController extends Controller
{
    private function actualRegistrationCapacityQuery($query)
    {
        // A legacy approval flow wrote the requester's organization headcount
        // as a synthetic attendee. Do not treat that reservation as a signup.
        return $query->where('event_registrations.registration_status', '!=', 'rejected')
            ->whereNotExists(function ($subquery) {
                $subquery->selectRaw('1')
                    ->from('plantation_event_requests')
                    ->join('planting_events as pe_req', 'pe_req.source_request_id', '=', 'plantation_event_requests.id')
                    ->whereColumn('pe_req.id', 'event_registrations.planting_event_id')
                    ->whereColumn('plantation_event_requests.contact_email', 'event_registrations.email');
            });
    }

    /** Derive the visible lifecycle status from the stored override and event window. */
    private function displayStatus(PlantingEvent $event): string
    {
        if ($event->status === 'cancelled') return 'cancelled';
        if ($event->status === 'completed' || $event->status === 'closed') return 'completed';
        if ($event->scheduled_at->lt(now()->startOfDay())) return 'completed';
        if ($event->status === 'on-going') return 'on-going';
        return $event->scheduled_at->lte(now()) ? 'on-going' : 'upcoming';
    }

    /** Public — open and upcoming events with remaining capacity */
    public function openEvents(): JsonResponse
    {
        // Use start of today (UTC) so events scheduled for today still appear
        $today = now()->startOfDay();

        $events = PlantingEvent::withCount('registrations')
            ->withSum(['registrations as registered_volunteers' => fn($query) => $this->actualRegistrationCapacityQuery($query)], 'group_size')
            ->with('site:id,name')
            // Include legacy values while installations roll forward through the status migration.
            ->whereIn('status', ['upcoming', 'on-going', 'open'])
            ->where('scheduled_at', '>=', $today)
            ->orderBy('scheduled_at')
            ->get()
            ->map(fn($e) => array_merge($e->toArray(), [
                'status' => $this->displayStatus($e),
                'remaining_capacity' => max(0, $e->max_volunteers - (int) $e->registered_volunteers),
            ]));

        return response()->json($events);
    }

    /** Public — past/completed events for history view */
    public function pastEvents(Request $request): JsonResponse
    {
        $today = now()->startOfDay();

        $events = PlantingEvent::withCount('registrations')
            ->with('site:id,name')
            ->withExists('accomplishmentReports')
            ->where(function ($q) use ($today) {
                $q->whereIn('status', ['completed', 'cancelled', 'closed'])
                  ->orWhere(function ($q2) use ($today) {
                      $q2->whereIn('status', ['upcoming', 'on-going', 'open'])
                         ->where('scheduled_at', '<', $today);
                  });
            })
            ->orderByDesc('scheduled_at')
            ->get()
            ->map(fn($e) => array_merge($e->toArray(), [
                'status' => $this->displayStatus($e),
                'remaining_capacity' => max(0, $e->max_volunteers - $e->registrations_count),
                'can_report_accomplishment' => $request->user()?->role === 'field_worker'
                    && $e->status !== 'cancelled'
                    && ($e->status === 'completed' || $e->scheduled_at->copy()->endOfDay()->lte(now()))
                    && \App\Models\RestorationSite::whereKey($e->restoration_site_id)->where('assigned_to', $request->user()->id)->exists(),
                'report_submitted' => (bool) $e->accomplishment_reports_exists,
            ]));

        return response()->json($events);
    }

    /** Assigned Bantay Bakawan confirmations, separate from capacity registrations. */
    public function myAttendance(Request $request): JsonResponse
    {
        return response()->json(EventAttendanceConfirmation::where('user_id', $request->user()->id)
            ->get(['planting_event_id', 'confirmed_at']));
    }

    public function confirmAttendance(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $worker = $request->user();
        if ($worker->role !== 'field_worker') abort(403);
        $record = EventAttendanceConfirmation::firstOrCreate(
            ['planting_event_id' => $plantingEvent->id, 'user_id' => $worker->id],
            ['confirmed_at' => now()]
        );
        if ($record->wasRecentlyCreated) {
            $site = $plantingEvent->site;
            $admins = User::whereIn('role', ['menro', 'admin', 'staff'])->where('is_active', true)->get();
            Notification::send($admins, new \App\Notifications\VolunteerAttendanceConfirmedNotification($worker, $plantingEvent));
        }
        return response()->json(['confirmed' => true, 'confirmed_at' => $record->confirmed_at]);
    }

    public function undoAttendance(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        EventAttendanceConfirmation::where('planting_event_id', $plantingEvent->id)
            ->where('user_id', $request->user()->id)->delete();
        return response()->json(['confirmed' => false]);
    }

    /**
     * Authenticated — return the event IDs the current user is registered for.
     * Used by the frontend to pre-populate the "already registered" state.
     */
    public function myRegistrations(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $registrations = EventRegistration::with(['event.site', 'event.accomplishmentReports'])
            ->where('user_id', $userId)
            ->get();

        return response()->json($registrations);
    }

    /** menro / admin / staff — ALL events regardless of status or date */
    public function allEvents(): JsonResponse
    {
        $events = PlantingEvent::withCount(['registrations', 'attendanceConfirmations'])
            ->withSum(['registrations as registered_volunteers' => fn($query) => $this->actualRegistrationCapacityQuery($query)], 'group_size')
            ->with(['registrations:id,planting_event_id,user_id,full_name,email,phone,address,organization,age,gender,group_size,motivation,admin_notes,registration_status,created_at'])
            ->withCount('attendanceConfirmations')
            ->with(['attendanceConfirmations.user:id,name'])
            ->with('site:id,name')
            ->orderByDesc('scheduled_at')
            ->get()
            ->map(fn($e) => array_merge($e->toArray(), [
                'status' => $this->displayStatus($e),
                'remaining_capacity' => max(0, $e->max_volunteers - (int) $e->registered_volunteers),
            ]));

        return response()->json($events);
    }

    /** menro / admin — create an event */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'restoration_site_id' => 'required|exists:restoration_sites,id',
            'name'                => 'required|string|max:255',
            'description'         => 'nullable|string',
            'scheduled_at'        => 'required|date',
            'location_name'       => 'nullable|string|max:255',
            'max_volunteers'      => 'required|integer|min:1',
            'status'              => 'sometimes|in:upcoming,on-going,completed,cancelled',
        ]);

        $event = PlantingEvent::create([
            'restoration_site_id' => $validated['restoration_site_id'],
            'created_by'          => $request->user()->id,
            'name'                => $validated['name'],
            'description'         => $validated['description'] ?? null,
            'scheduled_at'        => $validated['scheduled_at'],
            'location_name'       => $validated['location_name'] ?? null,
            'max_volunteers'      => $validated['max_volunteers'],
            'status'              => $validated['status'] ?? 'upcoming',
        ]);

        // Notify all volunteers, community members, and field_workers about the new event
        $recipients = User::whereIn('role', ['volunteer', 'user', 'field_worker'])
            ->where('is_active', true)
            ->get();
        Notification::send($recipients, new NewPlantingEventNotification($event));

        return response()->json($event, 201);
    }

    /** menro / admin — update an event; notify registrants on changes */
    public function update(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $validated = $request->validate([
            'name'           => 'sometimes|string|max:255',
            'description'    => 'nullable|string',
            'scheduled_at'   => 'sometimes|date',
            'location_name'  => 'nullable|string|max:255',
            'max_volunteers' => 'sometimes|integer|min:1',
            'status'         => 'sometimes|in:upcoming,on-going,completed,cancelled',
        ]);

        $oldStatus = $plantingEvent->status;

        // Track which meaningful fields changed (for update notification)
        $notifiableFields = ['name', 'scheduled_at', 'location_name', 'max_volunteers', 'status'];
        $changes = [];
        foreach ($notifiableFields as $field) {
            if (isset($validated[$field]) && $validated[$field] != $plantingEvent->$field) {
                $changes[$field] = $validated[$field];
            }
        }

        $plantingEvent->update($validated);

        // Get all registrants with a user account
        $registrations = EventRegistration::with('user')
            ->where('planting_event_id', $plantingEvent->id)
            ->whereNotNull('user_id')
            ->get();

        if ($validated['status'] ?? null === 'cancelled' || ($changes['status'] ?? null) === 'cancelled') {
            // Cancellation — send specific cancellation notification
            if ($oldStatus !== 'cancelled') {
                foreach ($registrations as $reg) {
                    if ($reg->user) {
                        $reg->user->notify(new EventCancelledNotification($plantingEvent));
                    }
                }
            }
        } elseif (!empty($changes)) {
            // Other meaningful changes — send update notification
            $updatedEvent = $plantingEvent->fresh();
            foreach ($registrations as $reg) {
                if ($reg->user) {
                    $reg->user->notify(new EventUpdatedNotification($updatedEvent, $changes));
                }
            }
        }

        return response()->json($plantingEvent->fresh());
    }

    /** Public (no auth) — register for a request-sourced event with personal info */
    public function registerPublic(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        if (!$plantingEvent->is_from_request) {
            return response()->json(['message' => 'This endpoint is only for community-requested events.'], 403);
        }
        if (!in_array($plantingEvent->status, ['upcoming', 'on-going', 'open'])) {
            return response()->json(['message' => 'This event is not open for registration.'], 422);
        }

        $validated = $request->validate([
            'full_name'    => 'required|string|max:255',
            'email'        => 'required|email|max:255',
            'phone'        => 'required|string|max:30',
            'address'      => 'required|string|max:500',
            'organization' => 'nullable|string|max:255',
            'age'          => 'nullable|integer|min:10|max:120',
            'gender'       => 'nullable|string|max:20',
            'group_size'   => 'nullable|integer|min:1|max:500',
            'motivation'   => 'nullable|string|max:1000',
        ]);

        $registeredVolunteers = $this->actualRegistrationCapacityQuery(
            EventRegistration::where('planting_event_id', $plantingEvent->id)
        )->sum('group_size');
        if ($plantingEvent->max_volunteers > 0 && $registeredVolunteers + ($validated['group_size'] ?? 1) > $plantingEvent->max_volunteers) {
            return response()->json(['message' => 'This event has reached its maximum capacity.'], 422);
        }

        // Prevent duplicate by email
        $alreadyRegistered = EventRegistration::where('planting_event_id', $plantingEvent->id)
            ->where('email', $validated['email'])->exists();
        if ($alreadyRegistered) {
            return response()->json(['message' => 'This email is already registered for this event.'], 422);
        }

        $registration = EventRegistration::create([
            'planting_event_id'   => $plantingEvent->id,
            'user_id'             => null,
            'full_name'           => $validated['full_name'],
            'email'               => $validated['email'],
            'phone'               => $validated['phone'],
            'address'             => $validated['address'],
            'organization'        => $validated['organization'] ?? null,
            'age'                 => $validated['age'] ?? null,
            'gender'              => $validated['gender'] ?? null,
            'group_size'          => $validated['group_size'] ?? 1,
            'motivation'          => $validated['motivation'] ?? null,
            'registration_status' => 'pending_approval',
        ]);

        try {
            $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])->where('is_active', true)->get();
            Notification::send($reviewers, new EventRegistrationSubmittedNotification($plantingEvent, $registration));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Public event registration notification failed: ' . $e->getMessage());
        }

        return response()->json([
            'message'      => 'Your registration has been submitted and is pending approval. You will be notified at ' . $validated['email'] . '.',
            'registration' => $registration,
            'status'       => 'pending_approval',
        ], 201);
    }

    /** volunteer / field_worker / any authenticated user — register for an event */
    public function register(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        if (!in_array($plantingEvent->status, ['upcoming', 'on-going', 'open'])) {
            return response()->json(['message' => 'This event is not open for registration.'], 422);
        }

        $user = $request->user();
        $userId = $user?->id;

        // Prevent duplicate registration by user_id
        if ($userId) {
            $alreadyRegistered = EventRegistration::where('planting_event_id', $plantingEvent->id)
                ->where('user_id', $userId)->exists();
            if ($alreadyRegistered) {
                return response()->json(['message' => 'You are already registered for this event.'], 422);
            }
        }

        $hasPersonalPayload = $request->hasAny(['full_name', 'email', 'phone', 'address', 'age']);
        if ($hasPersonalPayload) {
            $validated = $request->validate([
                'full_name'    => 'required|string|max:255',
                'email'        => 'required|email|max:255',
                'phone'        => 'required|string|max:30',
                'address'      => 'required|string|max:500',
                'organization' => 'nullable|string|max:255',
                'age'          => 'required|integer|min:10|max:120',
                'gender'       => 'nullable|string|max:20',
                'group_size'   => 'nullable|integer|min:1|max:500',
                'motivation'   => 'nullable|string|max:1000',
            ]);
        } else {
            $validated = [
                'full_name'    => $user?->name ?? 'Participant',
                'email'        => $user?->email,
                'phone'        => $user?->phone,
                'address'      => null,
                'organization' => $user?->organization,
                'age'          => null,
                'gender'       => null,
                'group_size'   => 1,
                'motivation'   => null,
            ];
        }

        $registeredVolunteers = $this->actualRegistrationCapacityQuery(
            EventRegistration::where('planting_event_id', $plantingEvent->id)
        )->sum('group_size');
        if ($plantingEvent->max_volunteers > 0 && $registeredVolunteers + ($validated['group_size'] ?? 1) > $plantingEvent->max_volunteers) {
            return response()->json(['message' => 'This event has reached its maximum volunteer capacity.'], 422);
        }

        if (!empty($validated['email'])) {
            $emailTaken = EventRegistration::where('planting_event_id', $plantingEvent->id)
                ->where('email', $validated['email'])->exists();
            if ($emailTaken) {
                return response()->json(['message' => 'This email is already registered for this event.'], 422);
            }
        }

        // All participant registrations are submitted for MENRO confirmation.
        $registration = EventRegistration::create([
            'planting_event_id'   => $plantingEvent->id,
            'user_id'             => $userId,
            'full_name'           => $validated['full_name'],
            'email'               => $validated['email'],
            'phone'               => $validated['phone'],
            'address'             => $validated['address'],
            'organization'        => $validated['organization'] ?? null,
            'age'                 => $validated['age'] ?? null,
            'gender'              => $validated['gender'] ?? null,
            'group_size'          => $validated['group_size'] ?? 1,
            'motivation'          => $validated['motivation'] ?? null,
            'registration_status' => 'pending_approval',
        ]);

        // Notify the participant and MENRO reviewers
        try {
            if ($user) {
                $user->notify(
                    new EventRegistrationConfirmedNotification($plantingEvent, $registration)
                );
            }
            $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])->where('is_active', true)->get();
            Notification::send($reviewers, new EventRegistrationSubmittedNotification($plantingEvent, $registration));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Event registration notification failed: ' . $e->getMessage());
        }

        return response()->json([
            'message'      => 'Your registration request has been submitted and is awaiting MENRO confirmation.',
            'registration' => $registration,
            'status'       => 'pending_approval',
        ], 201);
    }

    /** menro / admin / staff — confirm or reject a participant's event registration */
    public function reviewRegistration(Request $request, PlantingEvent $plantingEvent, EventRegistration $eventRegistration): JsonResponse
    {
        if ((int) $eventRegistration->planting_event_id !== (int) $plantingEvent->id) {
            return response()->json(['message' => 'Registration does not belong to this event.'], 404);
        }

        $validated = $request->validate([
            'status'      => 'required|in:confirmed,rejected',
            'admin_notes' => 'nullable|string|max:1000',
        ]);

        $defaultNote = $validated['status'] === 'confirmed'
            ? 'Confirmed by MENRO'
            : 'Rejected by MENRO';

        $eventRegistration->update([
            'registration_status' => $validated['status'],
            'admin_notes'         => $validated['admin_notes'] ?? $defaultNote,
        ]);

        $freshRegistration = $eventRegistration->fresh();

        try {
            if ($freshRegistration->user) {
                $freshRegistration->user->notify(
                    new EventRegistrationConfirmedNotification($plantingEvent, $freshRegistration)
                );
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Event registration review notification failed: ' . $e->getMessage());
        }

        return response()->json([
            'message'      => $validated['status'] === 'confirmed'
                ? 'Participant confirmed to join the event.'
                : 'Participant registration rejected.',
            'registration' => $freshRegistration,
        ]);
    }

    /**
     * volunteer / field_worker — cancel (withdraw) their own registration.
     * Allowed any time before the event. If the event is 1 day away, they can
     * re-register by calling the register endpoint again.
     */
    public function unregister(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $userId = $request->user()->id;

        $registration = EventRegistration::where('planting_event_id', $plantingEvent->id)
            ->where('user_id', $userId)
            ->first();

        if (!$registration) {
            return response()->json(['message' => 'You are not registered for this event.'], 404);
        }

        if ($plantingEvent->scheduled_at->lte(now()->addDay()) || $plantingEvent->status === 'on-going') {
            return response()->json(['message' => 'Registration can only be cancelled at least one day before the event.'], 422);
        }

        $registration->delete();

        return response()->json(['message' => 'Your registration has been cancelled.']);
    }
}

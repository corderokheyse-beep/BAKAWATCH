<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PlantationEventRequest;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use App\Models\User;
use App\Notifications\EventRequestSubmittedNotification;
use App\Notifications\EventRequestReviewedNotification;
use App\Notifications\EventRequestStatusNotification;
use App\Notifications\NewPlantingEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class PlantationEventRequestController extends Controller
{
    /** Public — anyone can submit a plantation event request. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'contact_age'           => 'required|integer|min:10|max:120',
            'contact_address'       => 'required|string|max:500',
            'contact_phone'         => 'required|string|max:30',
            'preferred_restoration_site_id' => 'required|exists:restoration_sites,id',
            'target_species'        => 'required|array|min:1',
            'target_species.*'      => 'integer|exists:mangrove_species,id',
            'organization_name'    => 'required|string|max:255',
            'contact_person'       => 'required|string|max:255',
            'contact_email'        => 'required|email|max:255',
            'event_name'           => 'required|string|max:255',
            'description'          => 'nullable|string|max:2000',
            'preferred_date'       => 'required|date|after_or_equal:today',
            'preferred_location'   => 'nullable|string|max:255',
            'expected_participants'=> 'required|integer|min:1|max:500',
            'purpose'              => 'nullable|string|max:2000',
        ]);

        if ($request->user()) $validated['requester_id'] = $request->user()->id;
        $req = PlantationEventRequest::create($validated);

        // Notify all menro, staff, and admin users
        $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])
            ->where('is_active', true)->get();
        Notification::send($reviewers, new EventRequestSubmittedNotification($req));

        return response()->json([
            'message' => 'Your plantation event request has been submitted. The MENRO Admin will review it shortly.',
            'request' => $req,
        ], 201);
    }

    /** menro / staff / admin — list all requests. */
    public function index(Request $request): JsonResponse
    {
        $requests = PlantationEventRequest::with(['reviewer:id,name'])
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->search, fn($q) => $q->where(function ($q) use ($request) {
                $q->where('organization_name', 'like', "%{$request->search}%")
                  ->orWhere('event_name', 'like', "%{$request->search}%")
                  ->orWhere('contact_person', 'like', "%{$request->search}%");
            }))
            ->latest()
            ->paginate($request->per_page ?? 20);

        return response()->json($requests);
    }

    /** menro / staff / admin — single request. */
    public function show(PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        return response()->json(
            $plantationEventRequest->load(['reviewer:id,name'])
        );
    }

    /**
     * menro / staff / admin — review a request.
     * On approval: automatically create a PlantingEvent from the request data.
     */
    public function review(Request $request, PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $validated = $request->validate([
            'status'               => 'required|in:approved,rejected,pending',
            'admin_notes'          => 'nullable|string|max:1000',
            // Optional event creation fields (used when approving)
            'restoration_site_id'  => 'nullable|exists:restoration_sites,id',
            'max_volunteers'       => 'nullable|integer|min:1',
            'scheduled_at'         => 'nullable|date',
        ]);

        $old = $plantationEventRequest->only(['status', 'admin_notes']);

        $plantationEventRequest->update([
            'status'      => $validated['status'],
            'admin_notes' => $validated['admin_notes'] ?? null,
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ]);

        ActivityLog::record(
            'plantation_request.reviewed',
            $plantationEventRequest,
            $old,
            ['status' => $validated['status']]
        );

        // ── Auto-create PlantingEvent on approval ─────────────────────────────
        // Create if: status is approved AND no linked event exists yet
        $createdEvent = null;
        if ($validated['status'] === 'approved' && !$plantationEventRequest->fresh()->plantingEvent) {
            // Pick a site: use provided one, or fall back to first active site
            $siteId = $validated['restoration_site_id']
                ?? $plantationEventRequest->preferred_restoration_site_id
                ?? RestorationSite::where('status', 'active')->value('id')
                ?? RestorationSite::value('id');

            if ($siteId) {
                $scheduledAt = $validated['scheduled_at']
                    ?? $plantationEventRequest->preferred_date->toDateTimeString();

                $createdEvent = PlantingEvent::create([
                    'restoration_site_id' => $siteId,
                    'created_by'          => auth()->id(),
                    'name'                => $plantationEventRequest->event_name,
                    'description'         => trim(
                        ($plantationEventRequest->description ?? '') . "\n\n" .
                        "Organized by: {$plantationEventRequest->organization_name}. " .
                    ($plantationEventRequest->target_species ? 'Target species: ' . \App\Models\MangroveSpecies::whereIn('id', $plantationEventRequest->target_species)->pluck('local_name')->filter()->implode(', ') . '. ' : '') .
                    ($plantationEventRequest->purpose ?? '')
                    ),
                    'scheduled_at'        => $scheduledAt,
                    'location_name'       => $plantationEventRequest->preferred_location,
                    'max_volunteers'      => $validated['max_volunteers']
                                            ?? $plantationEventRequest->expected_participants,
                    'status'              => 'upcoming',
                    'is_from_request'     => true,
                    'source_request_id'   => $plantationEventRequest->id,
                ]);

                // Notify volunteers/field_workers about the new event
                $recipients = User::whereIn('role', ['volunteer', 'field_worker'])
                    ->where('is_active', true)->get();
                Notification::send($recipients, new NewPlantingEventNotification($createdEvent));

                // Store the forward reference on the request
                $plantationEventRequest->update(['planting_event_id' => $createdEvent->id]);

            }
        }

        // Notify colleagues about the review decision
        $colleagues = User::whereIn('role', ['menro', 'staff', 'admin'])
            ->where('is_active', true)
            ->where('id', '!=', auth()->id())
            ->get();
        Notification::send($colleagues, new EventRequestReviewedNotification($plantationEventRequest->fresh()));

        // Notify the requesting organization via email (approved or rejected only)
        if (in_array($validated['status'], ['approved', 'rejected'])) {
            $freshRequest = $plantationEventRequest->fresh();
            Notification::route('mail', $freshRequest->contact_email)
                ->notify(new EventRequestStatusNotification($freshRequest));
        }

        return response()->json([
            'message'       => "Request {$validated['status']}." . ($createdEvent ? ' Event created and listed.' : ''),
            'request'       => $plantationEventRequest->fresh(['reviewer:id,name']),
            'created_event' => $createdEvent,
        ]);
    }

    /** menro / staff / admin — delete a request. */
    public function destroy(PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $plantationEventRequest->delete();
        return response()->json(['message' => 'Request deleted.']);
    }

    /** Public — pending count for badge. */
    public function pendingCount(): JsonResponse
    {
        return response()->json(['count' => PlantationEventRequest::pending()->count()]);
    }

    /** Authenticated participant may edit their own pending request. */
    public function update(Request $request, PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $this->authorizeOwner($request, $plantationEventRequest);
        if ($plantationEventRequest->status !== 'pending') return response()->json(['message' => 'Only pending requests can be edited.'], 422);
        $validated = $request->validate([
            'organization_name' => 'required|string|max:255',
            'contact_person' => 'required|string|max:255',
            'contact_age' => 'required|integer|min:10|max:120',
            'contact_address' => 'required|string|max:500',
            'contact_email' => 'required|email|max:255',
            'contact_phone' => 'required|string|max:30',
            'event_name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'preferred_date' => 'required|date|after_or_equal:today',
            'preferred_location' => 'nullable|string|max:255',
            'preferred_restoration_site_id' => 'required|exists:restoration_sites,id',
            'target_species' => 'required|array|min:1',
            'target_species.*' => 'integer|exists:mangrove_species,id',
            'expected_participants' => 'required|integer|min:1|max:500',
            'purpose' => 'nullable|string|max:2000',
        ]);
        $plantationEventRequest->update($validated);
        $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])->where('is_active', true)->get();
        Notification::send($reviewers, new EventRequestSubmittedNotification($plantationEventRequest->fresh(), true));
        return response()->json(['message' => 'Request updated and MENRO has been notified.', 'request' => $plantationEventRequest->fresh()]);
    }

    public function cancelMine(Request $request, PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $this->authorizeOwner($request, $plantationEventRequest);
        if (!in_array($plantationEventRequest->status, ['pending', 'approved'], true)) return response()->json(['message' => 'This request can no longer be cancelled.'], 422);
        if ($plantationEventRequest->preferred_date->lte(now()->addDays(2)->startOfDay())) return response()->json(['message' => 'Requests can only be cancelled at least 2 days before the scheduled date.'], 422);

        if ($plantationEventRequest->status === 'pending') {
            $plantationEventRequest->delete();
        } else {
            $event = $plantationEventRequest->plantingEvent;
            if (!$event) return response()->json(['message' => 'The approved event could not be found.'], 404);
            if ($event->status !== 'cancelled') {
                $event->update(['status' => 'cancelled']);
                $recipients = User::whereIn('id', \App\Models\EventRegistration::where('planting_event_id', $event->id)->whereNotNull('user_id')->pluck('user_id'))->get();
                Notification::send($recipients, new \App\Notifications\EventCancelledNotification($event));
                $note = trim(($plantationEventRequest->admin_notes ? $plantationEventRequest->admin_notes . "\n" : '') . 'Cancelled by the requesting participant on ' . now()->toDateString() . '.');
                $plantationEventRequest->update(['admin_notes' => $note]);
                $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])->where('is_active', true)->get();
                Notification::send($reviewers, new \App\Notifications\EventRequestCancelledNotification($plantationEventRequest->fresh(), $event));
            }
        }
        return response()->json(['message' => 'Event request cancelled.']);
    }

    private function authorizeOwner(Request $request, PlantationEventRequest $eventRequest): void
    {
        $user = $request->user();
        if (!$user || ($eventRequest->requester_id !== $user->id && strcasecmp($eventRequest->contact_email, $user->email) !== 0)) abort(403);
    }

    /** Authenticated — return the current user's own event requests. */
    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();
        $requests = PlantationEventRequest::with(['reviewer:id,name', 'preferredSite:id,name', 'plantingEvent:id,name,scheduled_at,status'])
            ->where(fn($q) => $q->where('requester_id', $user->id)->orWhere('contact_email', $user->email))
            ->orderByDesc('created_at')
            ->get();

        return response()->json($requests);
    }
}

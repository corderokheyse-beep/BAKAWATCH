<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\EventSeedlingAllocation;
use App\Models\InventoryMovement;
use App\Models\MangroveSpecies;
use App\Models\PlantationEventRequest;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use App\Models\SeedlingInventory;
use App\Models\User;
use App\Notifications\EventRequestSubmittedNotification;
use App\Notifications\EventRequestReviewedNotification;
use App\Notifications\EventRequestStatusNotification;
use App\Notifications\NewPlantingEventNotification;
use App\Services\EventSeedlingDispatchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

class PlantationEventRequestController extends Controller
{
    /** Public — anyone can submit a plantation event request. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'contact_address'       => 'required|string|max:500',
            'contact_phone'         => 'required|string|max:30',
            'preferred_restoration_site_id' => 'required|exists:restoration_sites,id',
            'seedling_quantities'   => 'required|array|min:1',
            'seedling_quantities.*' => 'required|integer|min:1|max:1000000',
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

        $quantities = $this->validateSeedlingQuantities(
            $validated['seedling_quantities'],
            (int) $validated['preferred_restoration_site_id'],
        );
        $validated['seedling_quantities'] = $quantities;
        $validated['target_species'] = array_map('intval', array_keys($quantities));
        $validated['seedlings_requested'] = array_sum($quantities);

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
        $requests = PlantationEventRequest::with(['reviewer:id,name', 'plantingEvent.seedlingAllocations'])
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

    private function validateSeedlingQuantities(array $quantities, int $siteId): array
    {
        $normalized = [];
        foreach ($quantities as $speciesId => $quantity) {
            if (!ctype_digit((string) $speciesId) || !MangroveSpecies::whereKey((int) $speciesId)->exists()) {
                throw ValidationException::withMessages([
                    'seedling_quantities' => ['Choose valid mangrove species.'],
                ]);
            }

            $species = MangroveSpecies::findOrFail((int) $speciesId);
            $available = $this->inventoryEntriesForSite($siteId, $species)
                ->sum(fn (SeedlingInventory $entry) => $this->inventoryBalance($entry));
            if ((int) $quantity > $available) {
                $speciesLabel = $species->local_name ?: $species->scientific_name;
                throw ValidationException::withMessages([
                    "seedling_quantities.{$speciesId}" => [
                        "{$speciesLabel} has only {$available} seedlings available for the selected site.",
                    ],
                ]);
            }

            $normalized[(int) $speciesId] = (int) $quantity;
        }

        return $normalized;
    }

    private function inventoryEntriesForSite(int $siteId, MangroveSpecies $species, bool $lock = false)
    {
        return $this->inventoryQuery($species)
            ->where(function ($query) use ($siteId) {
                $query->where('restoration_site_id', $siteId)
                    ->orWhereNull('restoration_site_id');
            })
            ->orderByRaw('CASE WHEN restoration_site_id = ? THEN 0 ELSE 1 END', [$siteId])
            ->orderBy('date_received')
            ->orderBy('id')
            ->when($lock, fn ($query) => $query->lockForUpdate())
            ->get();
    }

    private function inventoryEntriesFor(PlantingEvent $event, MangroveSpecies $species, bool $lock = false)
    {
        return $this->inventoryEntriesForSite((int) $event->restoration_site_id, $species, $lock);
    }

    private function inventoryQuery(MangroveSpecies $species)
    {
        $names = array_values(array_filter(array_unique([
            mb_strtolower(trim($species->scientific_name)),
            mb_strtolower(trim((string) $species->local_name)),
        ])));

        return SeedlingInventory::query()
            ->whereIn(DB::raw('LOWER(TRIM(species_name))'), $names)
            ->withSum('movements', 'quantity');
    }

    private function inventoryBalance(SeedlingInventory $entry): int
    {
        if ($entry->movements_sum_quantity !== null) {
            return max(0, (int) $entry->movements_sum_quantity);
        }

        return max(
            0,
            (int) $entry->beginning_stock
                + (int) $entry->quantity_received
                - (int) $entry->quantity_planted
                - (int) $entry->quantity_damaged,
        );
    }

    private function ensureOpeningMovement(SeedlingInventory $entry, int $balance, int $userId): void
    {
        if ($entry->movements_sum_quantity !== null || $balance < 1) {
            return;
        }

        $entry->movements()->create([
            'recorded_by' => $userId,
            'type' => 'stock_in',
            'quantity' => $balance,
            'movement_date' => now()->toDateString(),
            'note' => 'Opening stock recorded before event dispatch tracking.',
        ]);
    }

    /** menro / staff / admin — single request. */
    public function show(PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        return response()->json(
            $plantationEventRequest->load(['reviewer:id,name', 'plantingEvent.seedlingAllocations'])
        );
    }

    /** MENRO dispatches requested quantities from eligible site/global inventory. */
    public function dispatch(Request $request, PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $validated = $request->validate([
            'quantities' => 'required|array|min:1',
            'quantities.*' => 'required|integer|min:1|max:1000000',
        ]);

        $allocations = DB::transaction(function () use ($validated, $plantationEventRequest) {
            $eventRequest = PlantationEventRequest::query()
                ->lockForUpdate()
                ->findOrFail($plantationEventRequest->id);
            if ($eventRequest->status !== 'approved' || !$eventRequest->plantingEvent) {
                throw ValidationException::withMessages([
                    'request' => ['Approve and schedule this request before dispatching seedlings.'],
                ]);
            }

            $event = PlantingEvent::query()->lockForUpdate()->findOrFail($eventRequest->plantingEvent->id);
            if (in_array($event->status, ['completed', 'cancelled', 'closed'], true)) {
                throw ValidationException::withMessages([
                    'request' => ['Seedlings cannot be dispatched to an event that is completed or cancelled.'],
                ]);
            }
            $requested = $eventRequest->seedling_quantities ?? [];
            $created = [];

            foreach ($validated['quantities'] as $speciesId => $requestedDispatch) {
                $speciesId = (int) $speciesId;
                $quantity = (int) $requestedDispatch;
                $originallyRequested = (int) ($requested[$speciesId] ?? 0);
                if ($originallyRequested < 1) {
                    throw ValidationException::withMessages([
                        'quantities' => ["Species {$speciesId} was not included in this request."],
                    ]);
                }

                $previouslyDispatched = (int) EventSeedlingAllocation::query()
                    ->where('plantation_event_request_id', $eventRequest->id)
                    ->where('mangrove_species_id', $speciesId)
                    ->sum('dispatched_quantity');
                if ($previouslyDispatched + $quantity > $originallyRequested) {
                    throw ValidationException::withMessages([
                        "quantities.{$speciesId}" => ["Only " . max(0, $originallyRequested - $previouslyDispatched) . ' seedlings remain to be dispatched for this species.'],
                    ]);
                }

                $species = MangroveSpecies::findOrFail($speciesId);
                $entries = $this->inventoryEntriesFor($event, $species, true);
                $available = $entries->sum(fn (SeedlingInventory $entry) => $this->inventoryBalance($entry));
                if ($quantity > $available) {
                    throw ValidationException::withMessages([
                        "quantities.{$speciesId}" => ["Only {$available} seedlings are available for this species at the event site."],
                    ]);
                }

                $remaining = $quantity;
                foreach ($entries as $entry) {
                    $balance = $this->inventoryBalance($entry);
                    if ($balance < 1) {
                        continue;
                    }
                    $this->ensureOpeningMovement($entry, $balance, (int) auth()->id());
                    $dispatched = min($balance, $remaining);
                    $entry->movements()->create([
                        'recorded_by' => auth()->id(),
                        'type' => 'dispatch_out',
                        'quantity' => -$dispatched,
                        'movement_date' => now()->toDateString(),
                        'note' => "Dispatched to event {$event->name} (request #{$eventRequest->id}).",
                    ]);
                    $created[] = EventSeedlingAllocation::create([
                        'plantation_event_request_id' => $eventRequest->id,
                        'planting_event_id' => $event->id,
                        'seedling_inventory_id' => $entry->id,
                        'mangrove_species_id' => $species->id,
                        'dispatched_by' => auth()->id(),
                        'dispatched_quantity' => $dispatched,
                    ]);
                    $remaining -= $dispatched;
                    if ($remaining === 0) {
                        break;
                    }
                }
            }

            return $created;
        });

        return response()->json([
            'message' => 'Seedlings dispatched to the event.',
            'allocations' => $allocations,
            'request' => $plantationEventRequest->fresh()->load('plantingEvent.seedlingAllocations'),
        ], 201);
    }

    /** Return all dispatched seedlings that were not reported as planted. */
    public function returnRemaining(PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $returned = DB::transaction(function () use ($plantationEventRequest) {
            $eventRequest = PlantationEventRequest::query()
                ->lockForUpdate()
                ->findOrFail($plantationEventRequest->id);
            $event = $eventRequest->plantingEvent;
            if (!$event || !in_array($event->status, ['completed', 'cancelled'], true)) {
                throw ValidationException::withMessages([
                    'event' => ['Unused seedlings can be returned after the event is completed or cancelled.'],
                ]);
            }
            return app(EventSeedlingDispatchService::class)->returnUnused(
                $event,
                auth()->user(),
                "Unused seedlings returned from event request #{$eventRequest->id}.",
            );
        });

        return response()->json([
            'message' => "{$returned} unused seedlings returned to inventory.",
            'returned_quantity' => $returned,
            'request' => $plantationEventRequest->fresh()->load('plantingEvent.seedlingAllocations'),
        ]);
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

        if ($validated['status'] === 'pending' && $plantationEventRequest->plantingEvent?->seedlingAllocations()->where('dispatched_quantity', '>', 0)->exists()) {
            return response()->json(['message' => 'Cannot revert an event request to pending after seedlings have already been dispatched.'], 422);
        }

        $old = $plantationEventRequest->only(['status', 'admin_notes']);

        $plantationEventRequest->update([
            'status'      => $validated['status'],
            'admin_notes' => $validated['admin_notes'] ?? null,
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ]);

        if ($validated['status'] === 'rejected' && $plantationEventRequest->plantingEvent) {
            $event = $plantationEventRequest->plantingEvent;
            if ($event->status !== 'cancelled') {
                DB::transaction(function () use ($event, $plantationEventRequest) {
                    $event->update(['status' => 'cancelled']);
                    app(EventSeedlingDispatchService::class)->returnUnused(
                        $event,
                        auth()->user(),
                        "Unused seedlings returned after request #{$plantationEventRequest->id} was rejected by MENRO.",
                    );
                });
            }
        }

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
                    "Seedlings requested: {$plantationEventRequest->seedlings_requested}. " .
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
        if ($event = $plantationEventRequest->plantingEvent) {
            app(EventSeedlingDispatchService::class)->returnUnused(
                $event,
                auth()->user() ?? User::whereIn('role', ['admin', 'menro'])->first(),
                "Unused seedlings returned before deletion of request #{$plantationEventRequest->id}.",
            );
        }
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
            'contact_address' => 'required|string|max:500',
            'contact_email' => 'required|email|max:255',
            'contact_phone' => 'required|string|max:30',
            'event_name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'preferred_date' => 'required|date|after_or_equal:today',
            'preferred_location' => 'nullable|string|max:255',
            'preferred_restoration_site_id' => 'required|exists:restoration_sites,id',
            'seedling_quantities' => 'required|array|min:1',
            'seedling_quantities.*' => 'required|integer|min:1|max:1000000',
            'expected_participants' => 'required|integer|min:1|max:500',
            'purpose' => 'nullable|string|max:2000',
        ]);
        $quantities = $this->validateSeedlingQuantities(
            $validated['seedling_quantities'],
            (int) $validated['preferred_restoration_site_id'],
        );
        $validated['seedling_quantities'] = $quantities;
        $validated['target_species'] = array_map('intval', array_keys($quantities));
        $validated['seedlings_requested'] = array_sum($quantities);
        $plantationEventRequest->update($validated);
        $reviewers = User::whereIn('role', ['menro', 'staff', 'admin'])->where('is_active', true)->get();
        Notification::send($reviewers, new EventRequestSubmittedNotification($plantationEventRequest->fresh(), true));
        return response()->json(['message' => 'Request updated and MENRO has been notified.', 'request' => $plantationEventRequest->fresh()]);
    }

    public function cancelMine(Request $request, PlantationEventRequest $plantationEventRequest): JsonResponse
    {
        $this->authorizeOwner($request, $plantationEventRequest);
        $user = $request->user();
        if (!in_array($plantationEventRequest->status, ['pending', 'approved'], true)) return response()->json(['message' => 'This request can no longer be cancelled.'], 422);
        if ($plantationEventRequest->preferred_date->lte(now()->addDays(2)->startOfDay())) return response()->json(['message' => 'Requests can only be cancelled at least 2 days before the scheduled date.'], 422);

        if ($plantationEventRequest->status === 'pending') {
            $plantationEventRequest->delete();
        } else {
            $event = $plantationEventRequest->plantingEvent;
            if (!$event) return response()->json(['message' => 'The approved event could not be found.'], 404);
            if ($event->status !== 'cancelled') {
                DB::transaction(function () use ($event, $plantationEventRequest, $user) {
                    $event->update(['status' => 'cancelled']);
                    app(EventSeedlingDispatchService::class)->returnUnused(
                        $event,
                        $user,
                        "Unused seedlings returned after cancellation of request #{$plantationEventRequest->id}.",
                    );
                });
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

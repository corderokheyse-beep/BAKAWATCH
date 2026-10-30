<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventAccomplishmentReport;
use App\Models\EventSeedlingAllocation;
use App\Models\MangroveSpecies;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\SeedlingInventory;
use App\Models\User;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

class EventAccomplishmentReportController extends Controller
{
    public function __construct(private CloudinaryService $cloudinary) {}

    public function mine(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $site = $plantingEvent->site;
        if ($request->user()->role !== 'field_worker' || (int) $site->assigned_to !== (int) $request->user()->id) {
            abort(403, 'Only the Bantay Bakawan assigned to this event site can view its accomplishment report.');
        }
        return response()->json(EventAccomplishmentReport::where('planting_event_id', $plantingEvent->id)
            ->with('user:id,name,role')->first());
    }

    public function index(): JsonResponse
    {
        return response()->json(EventAccomplishmentReport::with([
            'event:id,name,scheduled_at', 'site:id,name', 'user:id,name,role', 'species:id,scientific_name,local_name',
        ])->latest('submitted_at')->paginate(20));
    }

    public function dispatchSummary(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $site = $plantingEvent->site;
        if ($request->user()->role !== 'field_worker' || (int) $site->assigned_to !== (int) $request->user()->id) {
            abort(403, 'Only the Bantay Bakawan assigned to this event site can view its seedling dispatch.');
        }

        $allocations = EventSeedlingAllocation::query()
            ->where('planting_event_id', $plantingEvent->id)
            ->with('species:id,scientific_name,local_name')
            ->get()
            ->groupBy('mangrove_species_id')
            ->map(function ($rows) {
                $first = $rows->first();
                $dispatched = $rows->sum('dispatched_quantity');
                $planted = $rows->sum('planted_quantity');
                $returned = $rows->sum('returned_quantity');

                return [
                    'mangrove_species_id' => $first->mangrove_species_id,
                    'species_name' => $first->species->scientific_name,
                    'local_name' => $first->species->local_name,
                    'dispatched_quantity' => $dispatched,
                    'planted_quantity' => $planted,
                    'returned_quantity' => $returned,
                    'remaining_quantity' => max(0, $dispatched - $planted - $returned),
                ];
            })
            ->values();

        return response()->json([
            'dispatch_required' => (bool) $plantingEvent->is_from_request,
            'allocations' => $allocations,
        ]);
    }

    public function store(Request $request, PlantingEvent $plantingEvent): JsonResponse
    {
        $user = $request->user();
        $site = $plantingEvent->site;
        if ($user->role !== 'field_worker' || (int) $site->assigned_to !== (int) $user->id) {
            abort(403, 'Only the Bantay Bakawan assigned to this event site can submit its accomplishment report.');
        }
        if ($plantingEvent->status !== 'completed' && $plantingEvent->scheduled_at->copy()->endOfDay()->isFuture()) {
            return response()->json(['message' => 'An accomplishment report can only be filed after the event.'], 422);
        }
        if (EventAccomplishmentReport::where('planting_event_id', $plantingEvent->id)->exists()) {
            return response()->json(['message' => 'An accomplishment report has already been submitted.'], 409);
        }

        $data = $request->validate([
            'plantings' => 'nullable|array|min:1',
            'plantings.*.mangrove_species_id' => 'required_with:plantings|integer|exists:mangrove_species,id',
            'plantings.*.seedlings_planted' => 'required_with:plantings|integer|min:0',
            'mangrove_species_id' => 'required_without:plantings|integer|exists:mangrove_species,id',
            'seedlings_planted' => 'required_without:plantings|integer|min:0',
            'volunteers_present' => 'required|integer|min:0',
            'photos' => 'required|array|min:1|max:5',
            'photos.*' => 'required|file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'remarks' => 'nullable|string|max:5000',
        ]);
        if (($data['latitude'] ?? null) === null xor ($data['longitude'] ?? null) === null) {
            return response()->json(['message' => 'Latitude and longitude must be submitted together.'], 422);
        }

        $plantings = $data['plantings'] ?? [[
            'mangrove_species_id' => $data['mangrove_species_id'],
            'seedlings_planted' => $data['seedlings_planted'],
        ]];
        $speciesIds = array_map(fn ($row) => (int) $row['mangrove_species_id'], $plantings);
        if (count($speciesIds) !== count(array_unique($speciesIds))) {
            throw ValidationException::withMessages(['plantings' => ['Each species can only be listed once.']]);
        }
        $speciesById = MangroveSpecies::whereIn('id', $speciesIds)->get()->keyBy('id');
        $plantings = array_map(fn ($row) => [
            'mangrove_species_id' => (int) $row['mangrove_species_id'],
            'species_name' => $speciesById[(int) $row['mangrove_species_id']]->scientific_name,
            'seedlings_planted' => (int) $row['seedlings_planted'],
        ], $plantings);
        $seedlingsPlanted = array_sum(array_column($plantings, 'seedlings_planted'));

        if ($plantingEvent->is_from_request) {
            $dispatchSummary = $this->dispatchQuantities($plantingEvent->id);
            if ($dispatchSummary === []) {
                throw ValidationException::withMessages([
                    'plantings' => ['MENRO must dispatch seedlings before an accomplishment report can be submitted.'],
                ]);
            }
            foreach ($plantings as $planting) {
                if (!array_key_exists($planting['mangrove_species_id'], $dispatchSummary)) {
                    throw ValidationException::withMessages([
                        'plantings' => ["{$planting['species_name']} was not dispatched to this event."],
                    ]);
                }
                $available = (int) ($dispatchSummary[$planting['mangrove_species_id']] ?? 0);
                if ($planting['seedlings_planted'] > $available) {
                    throw ValidationException::withMessages([
                        'plantings' => ["Only {$available} dispatched seedlings of {$planting['species_name']} remain for this event."],
                    ]);
                }
            }
        } else {
            foreach ($plantings as $planting) {
                $species = $speciesById[$planting['mangrove_species_id']];
                $available = $this->availableSeedlingQuantity($plantingEvent, $species);
                if ($planting['seedlings_planted'] > $available) {
                    throw ValidationException::withMessages([
                        'plantings' => ["Only {$available} seedlings of {$species->scientific_name} are currently available."],
                    ]);
                }
            }
        }

        $uploads = [];
        foreach ($request->file('photos') as $photo) {
            $uploaded = $this->cloudinary->upload($photo, 'event-accomplishments');
            $uploads[] = ['url' => $uploaded['secure_url'], 'public_id' => $uploaded['public_id']];
        }

        $record = DB::transaction(function () use ($data, $plantings, $speciesById, $uploads, $user, $site, $plantingEvent, $seedlingsPlanted) {
            $lockedEvent = PlantingEvent::whereKey($plantingEvent->id)->lockForUpdate()->firstOrFail();
            if (EventAccomplishmentReport::where('planting_event_id', $lockedEvent->id)->exists()) {
                throw ValidationException::withMessages(['event' => ['An accomplishment report has already been submitted for this event.']]);
            }

            $speciesNames = implode(', ', array_unique(array_column($plantings, 'species_name')));
            $plantingDetails = implode('; ', array_map(
                fn ($planting) => $planting['species_name'] . ': ' . $planting['seedlings_planted'] . ' seedlings',
                $plantings,
            ));
            $report = Report::create([
                'user_id' => $user->id,
                'title' => 'Event Accomplishment Report: ' . $plantingEvent->name,
                'description' => 'Day 0 baseline. ' . $plantingDetails . '; ' . $data['volunteers_present'] . ' volunteers present.' . (!empty($data['remarks']) ? ' ' . $data['remarks'] : ''),
                'latitude' => $data['latitude'] ?? $site->latitude,
                'longitude' => $data['longitude'] ?? $site->longitude,
                'location_name' => $site->name,
                'category' => 'restoration',
                'report_type' => 'event_accomplishment',
                'status' => 'pending',
                'image_url' => $uploads[0]['url'],
                'image_public_id' => $uploads[0]['public_id'],
                'severity' => 'low',
            ]);

            $primarySpecies = $speciesById[$plantings[0]['mangrove_species_id']];
            $accomplishment = EventAccomplishmentReport::create([
                'planting_event_id' => $plantingEvent->id,
                'restoration_site_id' => $site->id,
                'user_id' => $user->id,
                'mangrove_species_id' => $primarySpecies->id,
                'species_name' => $primarySpecies->scientific_name,
                'seedlings_planted' => $seedlingsPlanted,
                'plantings' => $plantings,
                'volunteers_present' => $data['volunteers_present'],
                'photos' => $uploads,
                'latitude' => $data['latitude'] ?? $site->latitude,
                'longitude' => $data['longitude'] ?? $site->longitude,
                'remarks' => $data['remarks'] ?? null,
                'submitted_at' => now(),
                'report_id' => $report->id,
            ]);

            $report->updates()->create([
                'updated_by' => $user->id,
                'type' => 'growth_monitoring',
                'fields' => [
                    'event_id' => $plantingEvent->id,
                    'event_title' => $plantingEvent->name,
                    'species_name' => $speciesNames,
                    'seedlings_planted' => $seedlingsPlanted,
                    'plantings' => $plantings,
                    'volunteers_present' => $data['volunteers_present'],
                    'day' => 0,
                ],
                'photos' => $uploads,
                'latitude' => $data['latitude'] ?? $site->latitude,
                'longitude' => $data['longitude'] ?? $site->longitude,
                'observation' => 'Day 0 baseline: ' . $plantingDetails . '.' . (!empty($data['remarks']) ? ' ' . $data['remarks'] : ''),
                'action_taken' => null,
                'status' => 'pending',
                'image_url' => $uploads[0]['url'],
                'image_public_id' => $uploads[0]['public_id'],
                'update_date' => $plantingEvent->scheduled_at->toDateString(),
            ]);

            foreach ($plantings as $planting) {
                $species = $speciesById[$planting['mangrove_species_id']];
                if ($plantingEvent->is_from_request) {
                    $this->recordDispatchedPlantings($plantingEvent, $species, $planting['seedlings_planted']);
                } else {
                    $this->consumeSeedlings($plantingEvent, $species, $user, $planting['seedlings_planted'], $accomplishment->id);
                }
            }

            return $accomplishment;
        });

        $admins = User::whereIn('role', ['menro', 'admin', 'staff'])->where('is_active', true)->get();
        Notification::send($admins, new \App\Notifications\EventAccomplishmentSubmittedNotification($record->load(['event', 'site', 'user'])));
        return response()->json(['message' => 'Accomplishment report submitted.', 'report' => $record->load(['event', 'site', 'species']), 'day_zero' => true], 201);
    }

    private function availableSeedlingQuantity(PlantingEvent $event, MangroveSpecies $species): int
    {
        return $this->inventoryEntriesFor($event, $species)->sum(
            fn (SeedlingInventory $entry) => $this->inventoryBalance($entry),
        );
    }

    private function dispatchQuantities(int $eventId): array
    {
        return EventSeedlingAllocation::query()
            ->where('planting_event_id', $eventId)
            ->selectRaw('mangrove_species_id, SUM(dispatched_quantity - planted_quantity - returned_quantity) AS remaining')
            ->groupBy('mangrove_species_id')
            ->pluck('remaining', 'mangrove_species_id')
            ->map(fn ($quantity) => max(0, (int) $quantity))
            ->all();
    }

    private function recordDispatchedPlantings(PlantingEvent $event, MangroveSpecies $species, int $quantity): void
    {
        $allocations = EventSeedlingAllocation::query()
            ->where('planting_event_id', $event->id)
            ->where('mangrove_species_id', $species->id)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $remaining = $quantity;
        foreach ($allocations as $allocation) {
            $available = $allocation->dispatched_quantity - $allocation->planted_quantity - $allocation->returned_quantity;
            if ($available < 1) {
                continue;
            }
            $planted = min($available, $remaining);
            $allocation->increment('planted_quantity', $planted);
            $remaining -= $planted;
            if ($remaining === 0) {
                break;
            }
        }

        if ($remaining > 0) {
            throw ValidationException::withMessages([
                'plantings' => ["Dispatched inventory for {$species->scientific_name} changed before this report was saved."],
            ]);
        }
    }

    private function consumeSeedlings(
        PlantingEvent $event,
        MangroveSpecies $species,
        User $user,
        int $quantity,
        int $accomplishmentId,
    ): void {
        if ($quantity === 0) {
            return;
        }

        $remaining = $quantity;
        foreach ($this->inventoryEntriesFor($event, $species, true) as $entry) {
            $balance = $this->inventoryBalance($entry);
            if ($balance === 0) {
                continue;
            }

            if ($entry->movements_sum_quantity === null) {
                $entry->movements()->create([
                    'recorded_by' => $user->id,
                    'type' => 'stock_in',
                    'quantity' => $balance,
                    'movement_date' => $event->scheduled_at->toDateString(),
                    'note' => 'Opening stock recorded before event accomplishment tracking.',
                ]);
            }

            $deducted = min($balance, $remaining);
            $entry->movements()->create([
                'recorded_by' => $user->id,
                'type' => 'planted_out',
                'quantity' => -$deducted,
                'movement_date' => $event->scheduled_at->toDateString(),
                'note' => "Event planting: {$event->name} (accomplishment #{$accomplishmentId}).",
            ]);
            $remaining -= $deducted;

            if ($remaining === 0) {
                break;
            }
        }

        if ($remaining > 0) {
            $available = $quantity - $remaining;
            throw ValidationException::withMessages([
                'seedlings_planted' => ["Only {$available} seedlings of this species remain available; inventory changed before submission."],
            ]);
        }
    }

    private function inventoryEntriesFor(PlantingEvent $event, MangroveSpecies $species, bool $lock = false)
    {
        $speciesNames = array_values(array_filter(array_unique([
            mb_strtolower(trim($species->scientific_name)),
            mb_strtolower(trim((string) $species->local_name)),
        ])));

        $query = SeedlingInventory::query()
            ->whereIn(DB::raw('LOWER(TRIM(species_name))'), $speciesNames)
            ->where(function ($query) use ($event) {
                $query->where('restoration_site_id', $event->restoration_site_id)
                    ->orWhereNull('restoration_site_id');
            })
            ->withSum('movements', 'quantity')
            ->orderByRaw(
                'CASE WHEN restoration_site_id = ? THEN 0 WHEN restoration_site_id IS NULL THEN 1 ELSE 2 END',
                [$event->restoration_site_id],
            )
            ->orderBy('date_received')
            ->orderBy('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get();
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
}

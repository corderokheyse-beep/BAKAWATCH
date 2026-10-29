<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventAccomplishmentReport;
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
            'mangrove_species_id' => 'required|integer|exists:mangrove_species,id',
            'seedlings_planted' => 'required|integer|min:0',
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

        $species = MangroveSpecies::findOrFail($data['mangrove_species_id']);
        $seedlingsPlanted = (int) $data['seedlings_planted'];
        if ($seedlingsPlanted > 0) {
            $available = $this->availableSeedlingQuantity($plantingEvent, $species);
            if ($seedlingsPlanted > $available) {
                throw ValidationException::withMessages([
                    'seedlings_planted' => ["Only {$available} seedlings of this species are currently available."],
                ]);
            }
        }

        $uploads = [];
        foreach ($request->file('photos') as $photo) {
            $uploaded = $this->cloudinary->upload($photo, 'event-accomplishments');
            $uploads[] = ['url' => $uploaded['secure_url'], 'public_id' => $uploaded['public_id']];
        }

        $record = DB::transaction(function () use ($data, $uploads, $user, $site, $plantingEvent, $species, $seedlingsPlanted) {
            $report = Report::create([
                'user_id' => $user->id,
                'title' => 'Event Accomplishment Report: ' . $plantingEvent->name,
                'description' => 'Day 0 baseline. ' . $species->scientific_name . ': ' . $data['seedlings_planted'] . ' seedlings planted; ' . $data['volunteers_present'] . ' volunteers present.' . (!empty($data['remarks']) ? ' ' . $data['remarks'] : ''),
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

            $accomplishment = EventAccomplishmentReport::create([
                'planting_event_id' => $plantingEvent->id,
                'restoration_site_id' => $site->id,
                'user_id' => $user->id,
                'mangrove_species_id' => $species->id,
                'species_name' => $species->scientific_name,
                'seedlings_planted' => $data['seedlings_planted'],
                'volunteers_present' => $data['volunteers_present'],
                'photos' => $uploads,
                'latitude' => $data['latitude'] ?? $site->latitude,
                'longitude' => $data['longitude'] ?? $site->longitude,
                'remarks' => $data['remarks'] ?? null,
                'submitted_at' => now(),
                'report_id' => $report->id,
            ]);

            // Day 0 starts growth tracking and records the planted quantity in MENRO inventory.
            $report->updates()->create([
                'updated_by' => $user->id,
                'type' => 'growth_monitoring',
                'fields' => [
                    'event_id' => $plantingEvent->id,
                    'event_title' => $plantingEvent->name,
                    'species_name' => $species->scientific_name,
                    'seedlings_planted' => $data['seedlings_planted'],
                    'volunteers_present' => $data['volunteers_present'],
                    'day' => 0,
                ],
                'photos' => $uploads,
                'latitude' => $data['latitude'] ?? $site->latitude,
                'longitude' => $data['longitude'] ?? $site->longitude,
                'observation' => 'Day 0 baseline: ' . $species->scientific_name . ', ' . $data['seedlings_planted'] . ' seedlings planted.' . (!empty($data['remarks']) ? ' ' . $data['remarks'] : ''),
                'action_taken' => null,
                'status' => 'pending',
                'image_url' => $uploads[0]['url'],
                'image_public_id' => $uploads[0]['public_id'],
                'update_date' => $plantingEvent->scheduled_at->toDateString(),
            ]);
            $this->consumeSeedlings($plantingEvent, $species, $user, $seedlingsPlanted, $accomplishment->id);

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

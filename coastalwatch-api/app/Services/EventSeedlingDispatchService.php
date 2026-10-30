<?php

namespace App\Services;

use App\Models\EventSeedlingAllocation;
use App\Models\PlantingEvent;
use App\Models\User;

class EventSeedlingDispatchService
{
    public function returnUnused(PlantingEvent $event, User $user, string $note): int
    {
        $allocations = EventSeedlingAllocation::query()
            ->where('planting_event_id', $event->id)
            ->with('inventory')
            ->lockForUpdate()
            ->get();

        $total = 0;
        foreach ($allocations as $allocation) {
            $quantity = $allocation->dispatched_quantity - $allocation->planted_quantity - $allocation->returned_quantity;
            if ($quantity < 1) {
                continue;
            }

            $allocation->increment('returned_quantity', $quantity);
            $allocation->inventory->movements()->create([
                'recorded_by' => $user->id,
                'type' => 'returned_in',
                'quantity' => $quantity,
                'movement_date' => now()->toDateString(),
                'note' => $note,
            ]);
            $total += $quantity;
        }

        return $total;
    }
}

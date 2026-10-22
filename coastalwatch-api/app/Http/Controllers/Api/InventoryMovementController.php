<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryMovement;
use App\Models\SeedlingInventory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Stock-movement ledger for a seedling inventory entry.
 *
 * The balance of an entry is the signed sum of its movements. stock_in and a
 * positive adjustment add stock; planted_out, lost, and a negative adjustment
 * remove it. We store signed quantities so the running balance is a plain SUM.
 */
class InventoryMovementController extends Controller
{
    /** Movement types that always remove stock (quantity stored negative). */
    private const OUTFLOW = ['planted_out', 'lost'];

    /** List the movement history for one inventory entry, newest first. */
    public function index(SeedlingInventory $seedlingInventory): JsonResponse
    {
        $movements = $seedlingInventory->movements()
            ->with('recorder:id,name')
            ->orderByDesc('movement_date')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'balance'   => (int) $movements->sum('quantity'),
            'movements' => $movements,
        ]);
    }

    /**
     * Record a movement against an entry.
     * The client sends a POSITIVE quantity plus a type; the sign is derived from
     * the type here so the frontend never has to reason about signs. For
     * 'adjustment', the client sends a signed quantity (±) directly.
     */
    public function store(Request $request, SeedlingInventory $seedlingInventory): JsonResponse
    {
        $validated = $request->validate([
            'type'          => 'required|in:' . implode(',', InventoryMovement::TYPES),
            'quantity'      => 'required|integer|not_in:0',
            'movement_date' => 'nullable|date',
            'note'          => 'nullable|string|max:500',
        ]);

        $type = $validated['type'];
        $qty  = (int) $validated['quantity'];

        // Normalise the sign from the type. Adjustment keeps the client's sign.
        if ($type === 'adjustment') {
            $signed = $qty; // may be + or -
        } elseif (in_array($type, self::OUTFLOW, true)) {
            $signed = -1 * abs($qty); // always removes
        } else { // stock_in
            $signed = abs($qty); // always adds
        }

        // Balance guard: a movement must never drive the balance below zero.
        $current = (int) $seedlingInventory->movements()->sum('quantity');
        if ($current + $signed < 0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'quantity' => ["This exceeds the available stock (balance: {$current})."],
            ]);
        }

        $movement = DB::transaction(function () use ($seedlingInventory, $type, $signed, $validated) {
            return $seedlingInventory->movements()->create([
                'recorded_by'   => auth()->id(),
                'type'          => $type,
                'quantity'      => $signed,
                'movement_date' => $validated['movement_date'] ?? now()->toDateString(),
                'note'          => $validated['note'] ?? null,
            ]);
        });

        $newBalance = (int) $seedlingInventory->movements()->sum('quantity');

        return response()->json([
            'message'  => 'Movement recorded.',
            'balance'  => $newBalance,
            'movement' => $movement->load('recorder:id,name'),
        ], 201);
    }

    /** Delete a movement (nested under its entry for ownership safety). */
    public function destroy(SeedlingInventory $seedlingInventory, InventoryMovement $movement): JsonResponse
    {
        abort_unless($movement->seedling_inventory_id === $seedlingInventory->id, 404);

        // Removing an inflow must not push the resulting balance negative.
        $current = (int) $seedlingInventory->movements()->sum('quantity');
        if ($current - $movement->quantity < 0) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'movement' => ['Removing this movement would make the balance negative. Adjust later movements first.'],
            ]);
        }

        $movement->delete();

        return response()->json([
            'message' => 'Movement removed.',
            'balance' => (int) $seedlingInventory->movements()->sum('quantity'),
        ]);
    }

    /**
     * Period summary across ALL entries (optionally filtered by site), bucketed
     * by daily / weekly / monthly windows for the MENRO tracking view & report.
     * Returns per-type totals within the window plus the overall balance.
     */
    public function summary(Request $request): JsonResponse
    {
        $period = $request->query('period', 'all'); // all|daily|weekly|monthly
        $siteId = $request->query('site_id');

        $query = InventoryMovement::query()
            ->when($siteId, fn($q) => $q->whereHas('entry',
                fn($e) => $e->where('restoration_site_id', $siteId)));

        $cutoff = match ($period) {
            'daily'   => now()->startOfDay(),
            'weekly'  => now()->subDays(7),
            'monthly' => now()->subMonth(),
            default   => null,
        };
        if ($cutoff) {
            $query->where('movement_date', '>=', $cutoff->toDateString());
        }

        $rows = (clone $query)
            ->selectRaw('type, SUM(quantity) AS total, COUNT(*) AS entries')
            ->groupBy('type')->get();

        $byType = [];
        foreach (InventoryMovement::TYPES as $t) {
            $row = $rows->firstWhere('type', $t);
            $byType[$t] = (int) ($row->total ?? 0);
        }

        return response()->json([
            'period'        => $period,
            'stock_in'      => abs($byType['stock_in']),
            'planted_out'   => abs($byType['planted_out']),
            'lost'          => abs($byType['lost']),
            'adjustment'    => $byType['adjustment'],
            'net_change'    => array_sum($byType),
        ]);
    }
}

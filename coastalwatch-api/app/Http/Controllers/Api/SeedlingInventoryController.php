<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SeedlingInventory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SeedlingInventoryController extends Controller
{
    /** Admin/staff/menro: full inventory list with optional site filter */
    public function index(Request $request): JsonResponse
    {
        $items = SeedlingInventory::with(['site:id,name', 'recorder:id,name'])
            ->when($request->site_id, fn($q) => $q->where('restoration_site_id', $request->site_id))
            ->when($request->species, fn($q) => $q->where('species_name', 'like', "%{$request->species}%"))
            // Newest-received first, then most-recently-created within the same
            // date so a freshly-added entry always surfaces at the top.
            ->orderByDesc('date_received')
            ->orderByDesc('id')
            ->paginate($request->per_page ?? 50);

        // Attach ledger-derived totals per entry in ONE query (no N+1), so every
        // row shows live planted/lost/balance from the movement ledger without
        // the client expanding it. Keys the aggregates by inventory id.
        $ids = $items->getCollection()->pluck('id');
        if ($ids->isNotEmpty()) {
            $agg = \App\Models\InventoryMovement::whereIn('seedling_inventory_id', $ids)
                ->selectRaw(
                    "seedling_inventory_id,
                     SUM(quantity) AS balance,
                     SUM(CASE WHEN type = 'stock_in' THEN quantity
                              WHEN type = 'adjustment' AND quantity > 0 THEN quantity ELSE 0 END) AS ledger_stock_in,
                     SUM(CASE WHEN type = 'planted_out' THEN -quantity ELSE 0 END) AS ledger_planted,
                     SUM(CASE WHEN type = 'lost' THEN -quantity
                              WHEN type = 'adjustment' AND quantity < 0 THEN -quantity ELSE 0 END) AS ledger_lost"
                )
                ->groupBy('seedling_inventory_id')
                ->get()
                ->keyBy('seedling_inventory_id');

            $items->getCollection()->transform(function ($it) use ($agg) {
                $row = $agg->get($it->id);
                // When an entry has ledger movements, surface the ledger figures;
                // otherwise fall back to the entry's own snapshot (equal to the
                // ledger from the backfill, so numbers stay consistent).
                $it->balance        = $row ? max(0, (int) $row->balance) : $it->quantity_remaining;
                $it->ledger_planted = $row ? (int) $row->ledger_planted : $it->quantity_planted;
                $it->ledger_lost    = $row ? (int) $row->ledger_lost    : $it->quantity_damaged;
                $it->ledger_stock_in = $row ? (int) $row->ledger_stock_in : $it->quantity_received;
                return $it;
            });
        }

        return response()->json($items);
    }

    /** Summary totals for dashboard widgets */
    public function summary(Request $request): JsonResponse
    {
        $query = SeedlingInventory::query()
            ->when($request->site_id, fn($q) => $q->where('restoration_site_id', $request->site_id));

        $rows = $query->selectRaw(
            'species_name,
             SUM(quantity_received) AS total_received,
             SUM(quantity_planted)  AS total_planted,
             SUM(quantity_damaged)  AS total_damaged,
             SUM(quantity_received - quantity_planted - quantity_damaged) AS total_remaining'
        )->groupBy('species_name')->get();

        return response()->json($rows);
    }

    /** Lifecycle stages for a seedling-inventory batch. */
    private const STAGES = 'propagule,seedling,sapling,mature';

    /**
     * Create a new daily inventory-count entry.
     *   Ending = Beginning + Added(received) − Mortality(damaged) − Released(planted)
     * Field mapping from the form:
     *   added_stock → quantity_received, released → quantity_planted,
     *   mortality → quantity_damaged, beginning_stock → beginning_stock.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Destination is only needed when seedlings are actually released.
            'restoration_site_id' => 'nullable|exists:restoration_sites,id',
            'species_name'        => 'required|string|max:150',
            'source_nursery'      => 'required|string|max:255',
            'date_received'       => 'required|date',
            'beginning_stock'     => 'nullable|integer|min:0',
            'quantity_received'   => 'nullable|integer|min:0', // Added stock
            'quantity_planted'    => 'nullable|integer|min:0', // Released
            'quantity_damaged'    => 'nullable|integer|min:0', // Mortality
            'stage'               => 'required|in:' . self::STAGES,
            'notes'               => 'nullable|string|max:1000',
        ]);

        $beginning = (int) ($validated['beginning_stock'] ?? 0);
        $added     = (int) ($validated['quantity_received'] ?? 0);
        $released  = (int) ($validated['quantity_planted'] ?? 0);
        $mortality = (int) ($validated['quantity_damaged'] ?? 0);

        // New-model invariant: you can't release/lose more than is on hand.
        if ($released + $mortality > $beginning + $added) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'quantity_planted' => ['Released + mortality cannot exceed beginning stock + added stock.'],
            ]);
        }
        // A destination site is required only when something is actually released.
        if ($released > 0 && empty($validated['restoration_site_id'])) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'restoration_site_id' => ['Select a destination site for the released seedlings.'],
            ]);
        }

        $item = \Illuminate\Support\Facades\DB::transaction(function () use ($validated, $beginning, $added, $released, $mortality) {
            $item = SeedlingInventory::create(array_merge($validated, [
                'beginning_stock'   => $beginning,
                'quantity_received' => $added,
                'quantity_planted'  => $released,
                'quantity_damaged'  => $mortality,
                'recorded_by'       => auth()->id(),
            ]));

            // Seed the movement ledger so the balance reflects this count. The
            // opening balance (beginning stock) plus added, minus released/lost.
            $date = $validated['date_received'];
            $uid  = auth()->id();
            $rows = [];
            if ($beginning > 0) $rows[] = ['type' => 'stock_in',    'quantity' =>  $beginning, 'note' => 'Beginning stock'];
            if ($added > 0)     $rows[] = ['type' => 'stock_in',    'quantity' =>  $added,     'note' => 'Added stock'];
            if ($released > 0)  $rows[] = ['type' => 'planted_out', 'quantity' => -$released,  'note' => 'Released for planting'];
            if ($mortality > 0) $rows[] = ['type' => 'lost',        'quantity' => -$mortality, 'note' => 'Mortality'];
            foreach ($rows as $r) {
                $item->movements()->create(array_merge($r, [
                    'recorded_by' => $uid, 'movement_date' => $date,
                ]));
            }
            return $item;
        });

        return response()->json([
            'message' => 'Inventory entry recorded.',
            'item'    => $item->load(['site:id,name', 'recorder:id,name']),
        ], 201);
    }

    /** Update an inventory entry */
    public function update(Request $request, SeedlingInventory $seedlingInventory): JsonResponse
    {
        $validated = $request->validate([
            'restoration_site_id' => 'sometimes|required|exists:restoration_sites,id',
            'species_name'        => 'sometimes|required|string|max:150',
            'source_nursery'      => 'sometimes|required|string|max:255',
            'date_received'       => 'sometimes|required|date',
            'quantity_received'   => 'sometimes|required|integer|min:1',
            'quantity_planted'    => 'nullable|integer|min:0',
            'quantity_damaged'    => 'nullable|integer|min:0',
            'stage'               => 'sometimes|required|in:' . self::STAGES,
            'notes'               => 'nullable|string|max:1000',
        ]);

        // Re-check the planted+damaged <= received invariant against the merged
        // values (new where provided, existing otherwise).
        $this->assertQuantitiesConsistent(
            (int) ($validated['quantity_received'] ?? $seedlingInventory->quantity_received),
            (int) ($validated['quantity_planted']  ?? $seedlingInventory->quantity_planted),
            (int) ($validated['quantity_damaged']  ?? $seedlingInventory->quantity_damaged),
        );

        $seedlingInventory->update($validated);

        return response()->json([
            'message' => 'Inventory updated.',
            'item'    => $seedlingInventory->fresh(['site:id,name', 'recorder:id,name']),
        ]);
    }

    /**
     * Guard: planted + damaged can never exceed the quantity received.
     * Throws a 422 validation error (same shape the frontend already handles).
     */
    private function assertQuantitiesConsistent(int $received, int $planted, int $damaged): void
    {
        if ($planted + $damaged > $received) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'quantity_planted' => ['Planted + damaged cannot exceed the quantity received.'],
            ]);
        }
    }

    /** Delete entry */
    public function destroy(SeedlingInventory $seedlingInventory): JsonResponse
    {
        $seedlingInventory->delete();

        return response()->json(['message' => 'Inventory entry deleted.']);
    }
}

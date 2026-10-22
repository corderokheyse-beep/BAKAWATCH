<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stock-movement ledger for the mangrove inventory. Each row is a dated event
     * against a seedling inventory entry, so the current balance and any
     * daily/weekly/monthly figures are derived from real movements rather than a
     * single static snapshot. Movement types:
     *   - stock_in     : seedlings received / propagated into stock (increases)
     *   - planted_out  : seedlings planted at a site (decreases)
     *   - lost         : seedlings damaged / died / non-viable (decreases)
     *   - adjustment   : manual correction (signed; may increase or decrease)
     */
    public function up(): void
    {
        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('seedling_inventory_id')
                  ->constrained('seedling_inventories')
                  ->cascadeOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type'); // stock_in | planted_out | lost | adjustment
            // Signed quantity: positive adds to balance, negative removes.
            $table->integer('quantity');
            $table->date('movement_date');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['seedling_inventory_id', 'movement_date']);
            $table->index('movement_date');
        });

        // ── Backfill: seed each existing entry's opening state as movements so
        // the ledger balance matches the current snapshot from day one. ──────────
        $entries = DB::table('seedling_inventories')->get();
        $now = now();
        foreach ($entries as $e) {
            $rows = [];
            $date = $e->date_received ?? $now->toDateString();

            if ((int) $e->quantity_received > 0) {
                $rows[] = [
                    'seedling_inventory_id' => $e->id,
                    'recorded_by'           => $e->recorded_by,
                    'type'                  => 'stock_in',
                    'quantity'              => (int) $e->quantity_received,
                    'movement_date'         => $date,
                    'note'                  => 'Opening stock (backfilled)',
                    'created_at'            => $now,
                    'updated_at'            => $now,
                ];
            }
            if ((int) $e->quantity_planted > 0) {
                $rows[] = [
                    'seedling_inventory_id' => $e->id,
                    'recorded_by'           => $e->recorded_by,
                    'type'                  => 'planted_out',
                    'quantity'              => -1 * (int) $e->quantity_planted,
                    'movement_date'         => $date,
                    'note'                  => 'Planted (backfilled)',
                    'created_at'            => $now,
                    'updated_at'            => $now,
                ];
            }
            if ((int) $e->quantity_damaged > 0) {
                $rows[] = [
                    'seedling_inventory_id' => $e->id,
                    'recorded_by'           => $e->recorded_by,
                    'type'                  => 'lost',
                    'quantity'              => -1 * (int) $e->quantity_damaged,
                    'movement_date'         => $date,
                    'note'                  => 'Damaged / lost (backfilled)',
                    'created_at'            => $now,
                    'updated_at'            => $now,
                ];
            }
            if ($rows) {
                DB::table('inventory_movements')->insert($rows);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
    }
};

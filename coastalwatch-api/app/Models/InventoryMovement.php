<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A single dated stock movement against a seedling inventory entry.
 *
 * Types:
 *   stock_in    (+) seedlings received / propagated into stock
 *   planted_out (-) seedlings planted at a site
 *   lost        (-) seedlings damaged / died / non-viable
 *   adjustment  (±) manual correction
 *
 * `quantity` is stored signed (positive adds to balance, negative removes), so
 * the running balance is simply the sum of quantities.
 */
class InventoryMovement extends Model
{
    use HasFactory;

    public const TYPES = ['stock_in', 'dispatch_out', 'returned_in', 'planted_out', 'lost', 'adjustment'];

    protected $fillable = [
        'seedling_inventory_id', 'recorded_by', 'type', 'quantity', 'movement_date', 'note',
    ];

    protected $casts = [
        'movement_date' => 'date',
        'quantity'      => 'integer',
    ];

    public function entry()
    {
        return $this->belongsTo(SeedlingInventory::class, 'seedling_inventory_id');
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}

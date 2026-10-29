<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SeedlingInventory extends Model
{
    use HasFactory;

    protected $fillable = [
        'restoration_site_id', 'recorded_by', 'species_name',
        'source_nursery', 'date_received', 'beginning_stock', 'quantity_received',
        'quantity_planted', 'quantity_damaged', 'stage', 'notes', 'image_url',
    ];

    protected $casts = [
        'date_received'     => 'date',
        'beginning_stock'   => 'integer',
        'quantity_received' => 'integer',
        'quantity_planted'  => 'integer',
        'quantity_damaged'  => 'integer',
    ];

    protected $appends = ['quantity_remaining', 'balance', 'ending_stock'];

    public function getQuantityRemainingAttribute(): int
    {
        return max(
            0,
            (int) $this->beginning_stock
                + (int) $this->quantity_received
                - (int) $this->quantity_planted
                - (int) $this->quantity_damaged,
        );
    }

    /**
     * Daily inventory ending stock:
     *   Ending = Beginning + Added(received) − Mortality(damaged) − Released(planted)
     */
    public function getEndingStockAttribute(): int
    {
        return max(0,
            (int) $this->beginning_stock
            + (int) $this->quantity_received
            - (int) $this->quantity_damaged
            - (int) $this->quantity_planted
        );
    }

    /**
     * Current stock balance derived from the movement ledger. Falls back to the
     * snapshot remaining when movements haven't been loaded/created yet, so the
     * value is always sensible even for entries predating the ledger.
     */
    public function getBalanceAttribute(): int
    {
        if ($this->relationLoaded('movements')) {
            return max(0, (int) $this->movements->sum('quantity'));
        }
        // Avoid an N+1 surprise: only query when movements exist for this entry.
        $sum = $this->movements()->sum('quantity');
        if ($sum !== null && $this->movements()->exists()) {
            return max(0, (int) $sum);
        }
        return $this->quantity_remaining;
    }

    public function movements()
    {
        return $this->hasMany(InventoryMovement::class, 'seedling_inventory_id');
    }

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}

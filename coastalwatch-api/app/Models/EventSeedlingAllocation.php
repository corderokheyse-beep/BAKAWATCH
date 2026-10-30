<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventSeedlingAllocation extends Model
{
    protected $fillable = [
        'plantation_event_request_id', 'planting_event_id', 'seedling_inventory_id',
        'mangrove_species_id', 'dispatched_by', 'dispatched_quantity',
        'planted_quantity', 'returned_quantity',
    ];

    protected $casts = [
        'dispatched_quantity' => 'integer',
        'planted_quantity' => 'integer',
        'returned_quantity' => 'integer',
    ];

    public function inventory()
    {
        return $this->belongsTo(SeedlingInventory::class, 'seedling_inventory_id');
    }

    public function species()
    {
        return $this->belongsTo(MangroveSpecies::class, 'mangrove_species_id');
    }

    public function event()
    {
        return $this->belongsTo(PlantingEvent::class, 'planting_event_id');
    }
}

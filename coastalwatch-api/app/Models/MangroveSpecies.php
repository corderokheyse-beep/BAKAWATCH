<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MangroveSpecies extends Model
{
    protected $table = 'mangrove_species';

    protected $fillable = [
        'scientific_name', 'local_name', 'family', 'description',
        'ml_supported', 'is_active',
    ];

    protected $casts = [
        'ml_supported' => 'boolean',
        'is_active'    => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}

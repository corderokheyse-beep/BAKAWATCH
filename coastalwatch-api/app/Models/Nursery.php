<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Nursery extends Model
{
    protected $fillable = ['name', 'location', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}

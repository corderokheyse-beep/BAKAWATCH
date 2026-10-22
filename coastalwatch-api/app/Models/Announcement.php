<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    use HasFactory;

    protected $fillable = [
        'author_id', 'title', 'content', 'type',
        'is_active', 'expires_at', 'target_roles',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'expires_at' => 'datetime',
    ];

    public function author()
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    /** Only active, non-expired announcements. */
    public function scopeActive($query)
    {
        return $query->where('is_active', true)
                     ->where(function ($q) {
                         $q->whereNull('expires_at')
                           ->orWhere('expires_at', '>', now());
                     });
    }

    /** Return target_roles as array. */
    public function getTargetRolesArrayAttribute(): array
    {
        if (! $this->target_roles) return [];
        return array_filter(array_map('trim', explode(',', $this->target_roles)));
    }
}

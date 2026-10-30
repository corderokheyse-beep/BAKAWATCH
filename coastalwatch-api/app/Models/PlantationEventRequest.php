<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PlantationEventRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'requester_id', 'contact_address', 'preferred_restoration_site_id', 'target_species',
        'organization_name', 'contact_person', 'contact_email', 'contact_phone',
        'event_name', 'description', 'preferred_date', 'preferred_location',
        'expected_participants', 'seedlings_requested', 'seedling_quantities', 'purpose',
        'status', 'admin_notes', 'reviewed_by', 'reviewed_at', 'planting_event_id',
    ];

    protected $casts = [
        'preferred_date' => 'date',
        'reviewed_at'    => 'datetime',
        'target_species'  => 'array',
        'seedling_quantities' => 'array',
    ];

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function plantingEvent()
    {
        return $this->hasOne(PlantingEvent::class, 'source_request_id');
    }

    public function seedlingAllocations()
    {
        return $this->hasMany(EventSeedlingAllocation::class);
    }

    public function preferredSite()
    {
        return $this->belongsTo(RestorationSite::class, 'preferred_restoration_site_id');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }
}

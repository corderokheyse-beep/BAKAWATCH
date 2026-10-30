<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PlantingEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'restoration_site_id', 'created_by', 'name', 'description',
        'scheduled_at', 'location_name', 'max_volunteers', 'status',
        'is_from_request', 'source_request_id',
    ];

    protected $casts = [
        'scheduled_at'    => 'datetime',
        'max_volunteers'  => 'integer',
        'is_from_request' => 'boolean',
    ];

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function registrations()
    {
        return $this->hasMany(EventRegistration::class);
    }

    public function registeredUsers()
    {
        return $this->belongsToMany(User::class, 'event_registrations')->withTimestamps();
    }

    public function attendanceConfirmations()
    {
        return $this->hasMany(EventAttendanceConfirmation::class);
    }

    public function accomplishmentReports()
    {
        return $this->hasMany(EventAccomplishmentReport::class);
    }

    public function seedlingAllocations()
    {
        return $this->hasMany(EventSeedlingAllocation::class);
    }

    public function sourceRequest()
    {
        return $this->belongsTo(PlantationEventRequest::class, 'event_request_id');
    }
}

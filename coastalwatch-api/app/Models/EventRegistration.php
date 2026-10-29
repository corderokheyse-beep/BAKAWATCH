<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventRegistration extends Model
{
    protected $fillable = [
        'planting_event_id', 'user_id',
        'full_name', 'email', 'phone', 'address', 'organization', 'age',
        'gender', 'group_size', 'motivation', 'admin_notes', 'registration_status',
    ];

    protected $casts = [
        'age'        => 'integer',
        'group_size' => 'integer',
    ];

    public function event()
    {
        return $this->belongsTo(PlantingEvent::class, 'planting_event_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

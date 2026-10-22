<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventAttendanceConfirmation extends Model
{
    protected $fillable = ['planting_event_id', 'user_id', 'confirmed_at'];
    protected $casts = ['confirmed_at' => 'datetime'];

    public function user() { return $this->belongsTo(User::class); }
    public function event() { return $this->belongsTo(PlantingEvent::class, 'planting_event_id'); }
}

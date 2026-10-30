<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventAccomplishmentReport extends Model
{
    use \App\Models\Concerns\ResolvesLocalUploadUrls;

    protected $fillable = [
        'planting_event_id', 'restoration_site_id', 'user_id', 'mangrove_species_id',
        'species_name', 'seedlings_planted', 'volunteers_present', 'photos',
        'latitude', 'longitude', 'remarks', 'submitted_at', 'report_id',
    ];

    protected $casts = [
        'photos' => 'array',
        'plantings' => 'array',
        'submitted_at' => 'datetime',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public function event() { return $this->belongsTo(PlantingEvent::class, 'planting_event_id'); }
    public function site() { return $this->belongsTo(RestorationSite::class, 'restoration_site_id'); }
    public function user() { return $this->belongsTo(User::class); }
    public function species() { return $this->belongsTo(MangroveSpecies::class, 'mangrove_species_id'); }
    public function report() { return $this->belongsTo(Report::class); }
}

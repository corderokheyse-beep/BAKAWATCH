<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PlantationRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'restoration_site_id', 'submitted_by', 'species_name', 'date_planted',
        'seedling_source', 'image_url', 'image_public_id', 'latitude', 'longitude',
        'status', 'geo_mismatch', 'mortality_date',
        'gps_source', 'gps_accuracy_m', 'geo_override', 'geo_override_reason',
        'is_replacement', 'location_verified', 'client_key', 'source',
    ];

    protected $casts = [
        'date_planted'      => 'date',
        'mortality_date'    => 'date',
        'latitude'          => 'float',
        'longitude'         => 'float',
        'geo_mismatch'      => 'boolean',
        'geo_override'      => 'boolean',
        'is_replacement'    => 'boolean',
        'location_verified' => 'boolean',
        'gps_accuracy_m'    => 'float',
    ];

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function monitoringRecords()
    {
        return $this->hasMany(MonitoringRecord::class);
    }
}

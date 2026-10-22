<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EcosystemRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'restoration_site_id', 'submitted_by', 'measurement_date',
        'soil_salinity_ppt', 'water_ph', 'water_temp_celsius',
        'tidal_condition', 'latitude', 'longitude', 'client_key',
    ];

    protected $casts = [
        'measurement_date'  => 'date',
        'soil_salinity_ppt' => 'float',
        'water_ph'          => 'float',
        'water_temp_celsius'=> 'float',
        'latitude'          => 'float',
        'longitude'         => 'float',
    ];

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MonitoringRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'plantation_record_id', 'submitted_by', 'monitoring_date',
        'height_cm', 'diameter_cm', 'survival_status', 'growth_stage',
        'disease_observation', 'latitude', 'longitude', 'client_key',
    ];

    protected $casts = [
        'monitoring_date' => 'date',
        'height_cm'       => 'float',
        'diameter_cm'     => 'float',
        'latitude'        => 'float',
        'longitude'       => 'float',
    ];

    public function plantationRecord()
    {
        return $this->belongsTo(PlantationRecord::class);
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}

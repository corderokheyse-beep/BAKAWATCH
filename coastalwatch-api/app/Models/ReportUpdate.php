<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReportUpdate extends Model
{
    use \App\Models\Concerns\ResolvesLocalUploadUrls;

    protected $fillable = [
        'report_id', 'updated_by', 'type', 'fields', 'photos', 'latitude', 'longitude', 'observation', 'action_taken',
        'status', 'image_url', 'image_public_id', 'update_date',
    ];

    protected $casts = [
        'update_date' => 'date',
        'fields' => 'array',
        'photos' => 'array',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public function report()
    {
        return $this->belongsTo(Report::class);
    }

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

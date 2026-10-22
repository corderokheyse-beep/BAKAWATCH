<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IntegrationSyncLog extends Model
{
    protected $fillable = [
        'connector', 'direction', 'status', 'records_imported',
        'records_skipped', 'source', 'message', 'triggered_by',
    ];

    public function triggeredBy()
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}

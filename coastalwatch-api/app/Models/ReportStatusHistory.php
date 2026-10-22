<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReportStatusHistory extends Model
{
    protected $table = 'report_status_history';

    // Immutable log: only created_at, no updated_at.
    public $timestamps = false;

    protected $fillable = [
        'report_id', 'previous_status', 'new_status', 'changed_by', 'note', 'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function report()
    {
        return $this->belongsTo(Report::class);
    }

    public function changer()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}

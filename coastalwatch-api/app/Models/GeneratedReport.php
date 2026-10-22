<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GeneratedReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'generated_by', 'restoration_site_id', 'report_type',
        'date_from', 'date_to', 'file_path',
    ];

    protected $casts = [
        'date_from' => 'date',
        'date_to'   => 'date',
    ];

    public function generator()
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }
}

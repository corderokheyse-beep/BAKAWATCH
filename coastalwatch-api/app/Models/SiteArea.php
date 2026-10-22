<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A single drawn area belonging to a restoration site. A site may have many —
 * e.g. one green "mangrove" extent plus several red "planted" patches.
 */
class SiteArea extends Model
{
    use HasFactory;

    public const TYPES = ['mangrove', 'planted'];

    protected $fillable = [
        'restoration_site_id', 'created_by', 'type', 'geojson', 'area_hectares', 'note',
    ];

    protected $casts = [
        'area_hectares' => 'float',
    ];

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

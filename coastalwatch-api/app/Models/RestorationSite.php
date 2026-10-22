<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class RestorationSite extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'created_by', 'assigned_to', 'name', 'description', 'area_hectares',
        'planted_hectares', 'barangay', 'status', 'established_year',
        'latitude', 'longitude', 'boundary_geojson', 'boundary_type',
    ];

    protected $casts = [
        'area_hectares'    => 'float',
        'planted_hectares' => 'float',
        'established_year' => 'integer',
        'latitude'         => 'float',
        'longitude'        => 'float',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The assigned Bantay Bakawan (field worker) responsible for this site. */
    public function assignedWorker()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Curated mangrove species documented at this site (biodiversity
     * inventory), independent of what has been planted/tracked.
     */
    public function speciesList()
    {
        return $this->belongsToMany(
            MangroveSpecies::class,
            'restoration_site_species',
            'restoration_site_id',
            'mangrove_species_id'
        )->withTimestamps();
    }

    public function plantationRecords()
    {
        return $this->hasMany(PlantationRecord::class);
    }

    public function ecosystemRecords()
    {
        return $this->hasMany(EcosystemRecord::class);
    }

    public function sitePhotos()
    {
        return $this->hasMany(SitePhoto::class);
    }

    public function plantingEvents()
    {
        return $this->hasMany(PlantingEvent::class);
    }

    /** Drawn areas (green mangrove + red planted) for this site. */
    public function areas()
    {
        return $this->hasMany(SiteArea::class, 'restoration_site_id');
    }
}

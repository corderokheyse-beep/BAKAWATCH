<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class RestorationProject extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'created_by', 'name', 'description', 'latitude', 'longitude',
        'location_name', 'area_hectares', 'status', 'progress_percent',
        'trees_planted', 'trees_target', 'start_date', 'end_date', 'image_url',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'area_hectares' => 'float',
        'progress_percent' => 'integer',
        'trees_planted' => 'integer',
        'trees_target' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    protected static function booted(): void
    {
        static::created(function (RestorationProject $project) {
            try { DB::statement(
                "UPDATE restoration_projects SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                [$project->longitude, $project->latitude, $project->id]
            ); } catch (\Exception $e) {}
        });
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function volunteers()
    {
        return $this->hasMany(ProjectVolunteer::class, 'project_id');
    }

    public function volunteerUsers()
    {
        return $this->belongsToMany(User::class, 'project_volunteers')
            ->withPivot('role', 'joined_date')
            ->withTimestamps();
    }

    public function updates()
    {
        return $this->hasMany(ProjectUpdate::class, 'project_id');
    }
}

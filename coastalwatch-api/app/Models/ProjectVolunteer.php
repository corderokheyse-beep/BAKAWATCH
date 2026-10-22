<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectVolunteer extends Model
{
    protected $fillable = ['project_id', 'user_id', 'role', 'joined_date'];

    protected $casts = ['joined_date' => 'date'];

    public function project()
    {
        return $this->belongsTo(RestorationProject::class, 'project_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

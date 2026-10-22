<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectUpdate extends Model
{
    protected $fillable = ['project_id', 'user_id', 'title', 'content', 'trees_planted_update', 'image_url'];

    protected $casts = ['trees_planted_update' => 'integer'];

    public function project()
    {
        return $this->belongsTo(RestorationProject::class, 'project_id');
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SitePhoto extends Model
{
    use HasFactory;

    protected $fillable = [
        'restoration_site_id', 'uploaded_by',
        'cloudinary_url', 'cloudinary_public_id', 'photo_type',
    ];

    public function site()
    {
        return $this->belongsTo(RestorationSite::class, 'restoration_site_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}

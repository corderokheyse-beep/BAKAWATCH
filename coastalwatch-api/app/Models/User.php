<?php

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    /** Send the password reset notification with a frontend (SPA) reset link. */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    protected $fillable = [
        'name', 'email', 'firebase_uid', 'password', 'role', 'phone', 'organization', 'is_active', 'fcm_token',
    ];

    protected $attributes = [
        'role'      => 'user',
        'is_active' => true,
    ];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password'          => 'hashed',
        'is_active'         => 'boolean',
    ];

    public function reports()
    {
        return $this->hasMany(Report::class);
    }

    public function projectVolunteers()
    {
        return $this->hasMany(ProjectVolunteer::class);
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isStaff(): bool
    {
        return in_array($this->role, ['admin', 'staff']);
    }

    public function isDenr(): bool
    {
        return $this->role === 'denr';
    }

    public function isEvaluator(): bool
    {
        return $this->role === 'evaluator';
    }
}

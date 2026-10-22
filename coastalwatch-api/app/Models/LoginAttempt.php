<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoginAttempt extends Model
{
    public $timestamps = false;

    protected $fillable = ['email', 'ip_address', 'succeeded', 'attempted_at'];

    protected $casts = [
        'succeeded'    => 'boolean',
        'attempted_at' => 'datetime',
    ];

    /**
     * Count failed attempts for a given email within the last N minutes.
     */
    public static function recentFailures(string $email, int $minutes = 15): int
    {
        return static::where('email', strtolower(trim($email)))
            ->where('succeeded', false)
            ->where('attempted_at', '>=', now()->subMinutes($minutes))
            ->count();
    }

    /**
     * Record a login attempt.
     */
    public static function record(string $email, string $ip, bool $succeeded): void
    {
        static::create([
            'email'        => strtolower(trim($email)),
            'ip_address'   => $ip,
            'succeeded'    => $succeeded,
            'attempted_at' => now(),
        ]);

        // Prune old records (keep 24 h) to avoid unbounded growth
        static::where('attempted_at', '<', now()->subDay())->delete();
    }
}

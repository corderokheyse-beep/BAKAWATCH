<?php

namespace App\Console\Commands;

use App\Models\LoginAttempt;
use Illuminate\Console\Command;

class PruneLoginAttempts extends Command
{
    protected $signature   = 'bakawatch:prune-login-attempts';
    protected $description = 'Delete login attempt records older than 24 hours';

    public function handle(): int
    {
        $deleted = LoginAttempt::where('attempted_at', '<', now()->subDay())->delete();
        $this->info("Pruned {$deleted} old login attempt record(s).");
        return self::SUCCESS;
    }
}

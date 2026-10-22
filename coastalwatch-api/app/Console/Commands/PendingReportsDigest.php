<?php

namespace App\Console\Commands;

use App\Models\Report;
use App\Models\User;
use App\Services\FcmService;
use Illuminate\Console\Command;

class PendingReportsDigest extends Command
{
    protected $signature   = 'bakawatch:pending-reports-digest';
    protected $description = 'Send a daily digest of pending threat reports to admin/staff users';

    public function handle(FcmService $fcm): int
    {
        $pending = Report::where('status', 'pending')->count();

        if ($pending === 0) {
            $this->info('No pending reports — skipping digest.');
            return self::SUCCESS;
        }

        $tokens = User::whereIn('role', ['admin', 'staff', 'menro'])
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        if (! empty($tokens)) {
            $fcm->sendToMultiple(
                $tokens,
                'BAKAWATCH Daily Digest',
                "{$pending} threat report(s) are awaiting your review.",
                ['type' => 'pending_digest', 'count' => (string) $pending]
            );
        }

        $this->info("Digest sent: {$pending} pending report(s) → " . count($tokens) . " admin(s).");
        return self::SUCCESS;
    }
}

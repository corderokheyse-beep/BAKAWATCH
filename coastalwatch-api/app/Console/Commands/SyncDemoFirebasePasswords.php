<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\FirebaseAdminClient;
use Illuminate\Console\Command;

/**
 * Developer convenience: set the documented seed passwords on the demo accounts
 * in Firebase, so local sign-in / quick-fill works with the known credentials.
 *
 * This does NOT affect real user accounts — only the fixed demo/seed emails.
 */
class SyncDemoFirebasePasswords extends Command
{
    protected $signature   = 'bakawatch:sync-demo-firebase-passwords';
    protected $description = 'Set the documented seed passwords on demo accounts in Firebase (dev only)';

    /** email => seed password (mirrors DemoAccountsSeeder). */
    private const DEMO = [
        'admin@menrogloria.gov.ph'        => 'Admin@1234',
        'menro@menrogloria.gov.ph'        => 'Menro@1234',
        'staff@menrogloria.gov.ph'        => 'Staff@1234',
        'fieldworker@menrogloria.gov.ph'  => 'Field@1234',
        'fieldworker2@menrogloria.gov.ph' => 'Field@1234',
        'volunteer@menrogloria.gov.ph'    => 'Volunteer@1234',
        'volunteer2@menrogloria.gov.ph'   => 'Volunteer@1234',
        'denr@denr.gov.ph'                => 'Denr@1234',
        'evaluator@research.ph'           => 'Eval@1234',
    ];

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('Refusing to run in production.');
            return self::FAILURE;
        }

        try {
            $firebase = new FirebaseAdminClient();
        } catch (\Throwable $e) {
            $this->error('Firebase admin client could not start: ' . $e->getMessage());
            return self::FAILURE;
        }

        $set = $missing = $failed = 0;

        foreach (self::DEMO as $email => $password) {
            $user = User::where('email', $email)->first();
            if (!$user) {
                $this->line("  - not in DB        {$email}");
                $missing++;
                continue;
            }

            // Resolve the Firebase UID (link it if we only have the local record).
            $uid = $user->firebase_uid;
            if (!$uid) {
                $existing = $firebase->findByEmail($email);
                $uid = $existing['localId'] ?? null;
                if ($uid) {
                    $user->forceFill(['firebase_uid' => $uid])->save();
                }
            }
            if (!$uid) {
                $this->warn("  ? no firebase user {$email} (run the migration first)");
                $missing++;
                continue;
            }

            try {
                $firebase->setPassword($uid, $password);
                $this->line("  ✓ set password     {$email}");
                $set++;
            } catch (\Throwable $e) {
                $this->error("  ✗ failed           {$email} — {$e->getMessage()}");
                $failed++;
            }
        }

        $this->newLine();
        $this->table(['Set', 'Missing', 'Failed'], [[$set, $missing, $failed]]);
        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

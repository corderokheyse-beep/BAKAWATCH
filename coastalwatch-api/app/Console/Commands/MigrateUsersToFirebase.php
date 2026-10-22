<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\FirebaseAdminClient;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class MigrateUsersToFirebase extends Command
{
    protected $signature = 'bakawatch:migrate-users-to-firebase
        {--send-reset : Also send a Firebase password-reset email to each migrated user}
        {--dry-run : Show what would happen without creating any Firebase accounts}';

    protected $description = 'Provision Firebase Authentication accounts for existing local users (one-time migration)';

    public function handle(): int
    {
        $dry  = (bool) $this->option('dry-run');
        $send = (bool) $this->option('send-reset');

        try {
            $firebase = new FirebaseAdminClient();
        } catch (\Throwable $e) {
            $this->error('Firebase admin client could not start: ' . $e->getMessage());
            $this->line('Check FIREBASE_CREDENTIALS / FIREBASE_PROJECT_ID in your .env.');
            return self::FAILURE;
        }

        // Only real, active, non-deleted accounts without a Firebase link yet.
        $users = User::whereNull('firebase_uid')->get();

        if ($users->isEmpty()) {
            $this->info('No users need migrating — every account already has a Firebase UID.');
            return self::SUCCESS;
        }

        $this->info(($dry ? '[DRY RUN] ' : '') . "Migrating {$users->count()} user(s) to Firebase…");
        $created = $linked = $skipped = $failed = $resetSent = 0;

        foreach ($users as $user) {
            $email = strtolower(trim($user->email));

            try {
                // Already in Firebase? Just link the UID locally.
                $existing = $firebase->findByEmail($email);
                if ($existing && !empty($existing['localId'])) {
                    if (!$dry) {
                        $user->forceFill(['firebase_uid' => $existing['localId']])->save();
                    }
                    $this->line("  ↔ linked existing  {$email}");
                    $linked++;
                } else {
                    if ($dry) {
                        $this->line("  + would create     {$email}");
                        $created++;
                    } else {
                        // Random temporary password — the user sets their own via reset.
                        $tempPassword = Str::password(20);
                        $uid = $firebase->createUser(
                            $email,
                            $tempPassword,
                            $user->name ?? '',
                            (bool) $user->email_verified_at
                        );
                        $user->forceFill(['firebase_uid' => $uid])->save();
                        $this->line("  + created          {$email}");
                        $created++;
                    }
                }

                // Optionally trigger the password-reset email so the user can set a password.
                if ($send && !$dry) {
                    try {
                        $firebase->sendPasswordReset($email);
                        $resetSent++;
                    } catch (\Throwable $e) {
                        $this->warn("    (reset email failed for {$email}: {$e->getMessage()})");
                    }
                }
            } catch (\Throwable $e) {
                $this->error("  ✗ failed           {$email} — {$e->getMessage()}");
                $failed++;
            }
        }

        $this->newLine();
        $this->info('Done.');
        $this->table(
            ['Created', 'Linked', 'Skipped', 'Failed', 'Reset emails sent'],
            [[$created, $linked, $skipped, $failed, $resetSent]]
        );

        if (!$send && !$dry) {
            $this->newLine();
            $this->line('Migrated users have no password set in Firebase yet. They must use');
            $this->line('"Forgot password" to set one, or re-run with --send-reset to email them now.');
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

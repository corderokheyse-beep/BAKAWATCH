<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Production / deployment seeder.
 *
 * Seeds ONLY the essential data needed to run the system in production:
 *   - the mangrove species reference list, and
 *   - a single administrator account (credentials from env).
 *
 * It creates NO demo reports, sites, projects, plantations, monitoring records,
 * ecosystem records, or planting events. All operational data must be entered
 * by real users through the app so figures reflect real field activity.
 *
 * Run with:
 *   php artisan migrate --force
 *   php artisan db:seed --class=Database\\Seeders\\ProductionSeeder --force
 *
 * Configure the admin via env before seeding:
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ORG
 */
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        // Reference data required by the app (species dropdowns, ML alignment).
        $this->call(MangroveSpeciesSeeder::class);

        // A single administrator account. Idempotent: updates if it already exists.
        $email    = env('ADMIN_EMAIL', 'admin@menrogloria.gov.ph');
        $password = env('ADMIN_PASSWORD');

        if (! $password) {
            $this->command?->warn(
                'ADMIN_PASSWORD not set — skipping admin creation. '
                . 'Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment and re-run to create the admin.'
            );
            return;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name'              => env('ADMIN_NAME', 'System Administrator'),
                'password'          => Hash::make($password),
                'role'              => 'admin',
                'organization'      => env('ADMIN_ORG', 'MENRO Gloria, Oriental Mindoro'),
                'email_verified_at' => now(),
                'is_active'         => true,
            ]
        );

        $this->command?->info("Admin account ready: {$email}");
    }
}

<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds one working login for each role — WITHOUT any demo operational data
 * (no reports, sites, projects, events). Use this to get test accounts on a
 * clean/production-reset database. Idempotent (updateOrCreate), safe to re-run.
 *
 * Run:
 *   php artisan db:seed --class="Database\Seeders\DemoAccountsSeeder" --force
 */
class DemoAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            ['MENRO Administrator', 'admin@menrogloria.gov.ph',        'Admin@1234',     'admin',        'MENRO Gloria, Oriental Mindoro'],
            ['Maria Santos',        'menro@menrogloria.gov.ph',        'Menro@1234',     'menro',        'MENRO Gloria, Oriental Mindoro'],
            ['Jose Reyes',          'staff@menrogloria.gov.ph',        'Staff@1234',     'staff',        'MENRO Gloria, Oriental Mindoro'],
            ['Pedro Dela Cruz',     'fieldworker@menrogloria.gov.ph',  'Field@1234',     'field_worker', 'MENRO Gloria Field Team'],
            ['Rosa Magtibay',       'fieldworker2@menrogloria.gov.ph', 'Field@1234',     'field_worker', 'MENRO Gloria Field Team'],
            ['Ana Lim',             'volunteer@menrogloria.gov.ph',    'Volunteer@1234', 'volunteer',    'Gloria Fisherfolk Association'],
            ['Carlos Bautista',     'volunteer2@menrogloria.gov.ph',   'Volunteer@1234', 'volunteer',    'Gloria Youth for Environment'],
            ['DENR Evaluator',      'denr@denr.gov.ph',                'Denr@1234',      'denr',         'DENR Region IV-B (MIMAROPA)'],
            ['Dr. Marine Scientist','evaluator@research.ph',           'Eval@1234',      'evaluator',    'Marine Research Institute'],
        ];

        foreach ($accounts as [$name, $email, $password, $role, $org]) {
            User::updateOrCreate(
                ['email' => $email],
                [
                    'name'              => $name,
                    'password'          => Hash::make($password),
                    'role'              => $role,
                    'organization'      => $org,
                    'email_verified_at' => now(),
                    'is_active'         => true,
                ]
            );
        }

        $this->command?->info('Demo role accounts ready (no operational demo data created).');
    }
}

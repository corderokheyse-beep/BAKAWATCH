<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds demo accounts for the DENR evaluator and research evaluator roles.
 * Idempotent (updateOrCreate) so it is safe to re-run.
 */
class EvaluatorAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            ['DENR Evaluator', 'denr@denr.gov.ph', 'Denr@1234', 'denr', 'DENR Region IV-B (MIMAROPA)'],
            ['Dr. Marine Scientist', 'evaluator@research.ph', 'Eval@1234', 'evaluator', 'Marine Research Institute'],
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
    }
}

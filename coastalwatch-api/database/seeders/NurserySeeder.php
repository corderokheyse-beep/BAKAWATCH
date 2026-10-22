<?php

namespace Database\Seeders;

use App\Models\Nursery;
use Illuminate\Database\Seeder;

/**
 * Seeds placeholder nurseries for the seedling-inventory source dropdown.
 * These are PLACEHOLDERS — replace them with the real nurseries in use.
 * Idempotent: matches on name so re-running won't duplicate.
 */
class NurserySeeder extends Seeder
{
    public function run(): void
    {
        $nurseries = [
            ['DENR-PENRO', 'Oriental Mindoro'],
            ['LGU Gloria', 'Gloria, Oriental Mindoro'],
            ['Provincial Nursery', 'Calapan City'],
            ['Barangay Community Nursery', 'Gloria, Oriental Mindoro'],
        ];

        foreach ($nurseries as [$name, $location]) {
            Nursery::updateOrCreate(
                ['name' => $name],
                ['location' => $location, 'is_active' => true]
            );
        }
    }
}

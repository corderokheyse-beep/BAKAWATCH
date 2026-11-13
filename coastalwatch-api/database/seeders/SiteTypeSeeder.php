<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Back-fills site_type for all starter Gloria barangay sites.
 *
 * Planting sites  : Tambong, Balete, Sta. Theresa, Agsalin
 * Mangrove areas  : Maragooc, Guimbonan
 *
 * All other barangays default to 'planting_site' (the column default).
 *
 * Safe to run multiple times — idempotent.
 *
 * Run:
 *   php artisan db:seed --class="Database\Seeders\SiteTypeSeeder" --force
 */
class SiteTypeSeeder extends Seeder
{
    public function run(): void
    {
        // Identified natural mangrove areas
        $mangroveAreas = ['Maragooc', 'Guimbonan'];

        $updatedMangrove = DB::table('restoration_sites')
            ->whereIn('barangay', $mangroveAreas)
            ->whereNull('deleted_at')
            ->update(['site_type' => 'mangrove_area']);

        // Planting / restoration sites
        $plantingSites = ['Tambong', 'Balete', 'Sta. Theresa', 'Agsalin',
                          'San Antonio', 'Kawit', 'Lucio Laurel'];

        $updatedPlanting = DB::table('restoration_sites')
            ->whereIn('barangay', $plantingSites)
            ->whereNull('deleted_at')
            ->update(['site_type' => 'planting_site']);

        $this->command?->info("Site types back-filled: {$updatedMangrove} mangrove areas, {$updatedPlanting} planting sites.");
    }
}

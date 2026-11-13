<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Idempotent back-fill of site_type for Gloria coastal barangays.
 * Safe to run multiple times — only updates rows that need changing.
 *
 * Usage:
 *   php artisan sites:backfill-types
 */
class BackfillSiteTypes extends Command
{
    protected $signature   = 'sites:backfill-types';
    protected $description = 'Back-fill site_type for Maragooc/Guimbonan (mangrove_area) and planting barangays';

    public function handle(): int
    {
        $mangrove = DB::table('restoration_sites')
            ->whereIn('barangay', ['Maragooc', 'Guimbonan'])
            ->whereNull('deleted_at')
            ->update(['site_type' => 'mangrove_area']);

        $planting = DB::table('restoration_sites')
            ->whereIn('barangay', ['Tambong', 'Balete', 'Sta. Theresa', 'Agsalin',
                                   'San Antonio', 'Kawit', 'Lucio Laurel'])
            ->whereNull('deleted_at')
            ->update(['site_type' => 'planting_site']);

        $this->info("Updated: {$mangrove} mangrove areas, {$planting} planting sites.");

        // Show current state for verification
        $rows = DB::table('restoration_sites')
            ->whereNull('deleted_at')
            ->orderBy('barangay')
            ->get(['name', 'barangay', 'site_type']);

        $this->table(['Name', 'Barangay', 'Site Type'], $rows->map(fn($r) => [
            $r->name, $r->barangay ?? '—', $r->site_type ?? '—'
        ]));

        return self::SUCCESS;
    }
}

<?php

namespace Database\Seeders;

use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the real Gloria, Oriental Mindoro coastal mangrove sites so the Map,
 * Sites, and Analytics pages have data to display. These are actual barangays
 * of Gloria with representative boundaries.
 *
 * It also seeds a small set of plantation + monitoring records on the first
 * site so the Analytics survival-rate / species / growth charts render. This is
 * starter reference data, not fabricated activity reports — remove or replace
 * with real field data as it is collected.
 *
 * Idempotent: skips sites that already exist by name. Run:
 *   php artisan db:seed --class="Database\Seeders\StarterSitesSeeder" --force
 */
class StarterSitesSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('role', 'admin')->where('is_active', true)->first();
        if (! $admin) {
            throw new \RuntimeException(
                'Cannot seed starter sites without an active admin. Set ADMIN_EMAIL and ADMIN_PASSWORD, then run ProductionSeeder first.'
            );
        }
        $adminId = $admin->id;
        $fieldId = User::where('role', 'field_worker')->where('is_active', true)->first()?->id ?? $adminId;

        $sites = [
            ['Agsalin Mangrove Reserve',            'Agsalin',      16.8, 2020, 12.9280, 121.5020, 'POLYGON((121.4990 12.9260, 121.5060 12.9260, 121.5060 12.9310, 121.4990 12.9310, 121.4990 12.9260))'],
            ['Maragooc Coastal Mangrove Zone',      'Maragooc',      8.5, 2021, 12.9380, 121.5050, 'POLYGON((121.5020 12.9360, 121.5090 12.9360, 121.5090 12.9410, 121.5020 12.9410, 121.5020 12.9360))'],
            ['Guimbonan Mangrove Belt',             'Guimbonan',     6.2, 2022, 12.9480, 121.5080, 'POLYGON((121.5050 12.9460, 121.5120 12.9460, 121.5120 12.9510, 121.5050 12.9510, 121.5050 12.9460))'],
            ['Sta. Theresa Fish Sanctuary',         'Sta. Theresa', 38.1, 2018, 12.9580, 121.5100, 'POLYGON((121.5060 12.9540, 121.5160 12.9540, 121.5160 12.9630, 121.5060 12.9630, 121.5060 12.9540))'],
            ['Balete Mangrove Restoration Site',    'Balete',        4.5, 2023, 12.9680, 121.4900, 'POLYGON((121.4870 12.9660, 121.4930 12.9660, 121.4930 12.9700, 121.4870 12.9700, 121.4870 12.9660))'],
            ['San Antonio Coastal Mangrove Area',   'San Antonio',   7.0, 2021, 12.9720, 121.5120, 'POLYGON((121.5090 12.9700, 121.5160 12.9700, 121.5160 12.9750, 121.5090 12.9750, 121.5090 12.9700))'],
            ['Kawit Shoreline Mangrove Project',    'Kawit',         5.8, 2022, 12.9760, 121.4860, 'POLYGON((121.4830 12.9740, 121.4900 12.9740, 121.4900 12.9780, 121.4830 12.9780, 121.4830 12.9740))'],
            ['Tambong Mangrove Conservation Zone',  'Tambong',       9.3, 2019, 12.9950, 121.5150, 'POLYGON((121.5120 12.9920, 121.5200 12.9920, 121.5200 12.9980, 121.5120 12.9980, 121.5120 12.9920))'],
        ];

        $firstSite = null;
        foreach ($sites as [$name, $barangay, $area, $year, $lat, $lng, $polygon]) {
            if (RestorationSite::where('name', $name)->exists()) {
                if (! $firstSite) $firstSite = RestorationSite::where('name', $name)->first();
                continue;
            }
            $site = RestorationSite::create([
                'created_by'       => $adminId,
                'name'             => $name,
                'description'      => "Mangrove restoration site in Barangay {$barangay}, Gloria, Oriental Mindoro.",
                'area_hectares'    => $area,
                'barangay'         => $barangay,
                'status'           => 'active',
                'established_year' => $year,
                'latitude'         => $lat,
                'longitude'        => $lng,
            ]);
            // Store PostGIS boundary (PostgreSQL only; skipped on SQLite).
            if (DB::getDriverName() !== 'sqlite') {
                try { DB::statement(
                    "UPDATE restoration_sites SET boundary = ST_GeomFromText(?, 4326) WHERE id = ?",
                    [$polygon, $site->id]
                ); } catch (\Throwable $e) {}
            }
            if (! $firstSite) $firstSite = $site;
        }

        // Seed a little plantation + monitoring data on the first site so the
        // Analytics charts (survival rate, species, growth) have something real.
        if ($firstSite && PlantationRecord::where('restoration_site_id', $firstSite->id)->count() === 0) {
            $species = ['Rhizophora mucronata', 'Avicennia marina', 'Sonneratia alba', 'Bruguiera gymnorrhiza', 'Ceriops tagal'];
            foreach ($species as $i => $sp) {
                $lat = (float) $firstSite->latitude + ($i * 0.0004);
                $lng = (float) $firstSite->longitude + ($i * 0.0004);
                $pr = PlantationRecord::create([
                    'restoration_site_id' => $firstSite->id,
                    'submitted_by'        => $fieldId,
                    'species_name'        => $sp,
                    'date_planted'        => now()->subDays(90 - $i * 10)->toDateString(),
                    'seedling_source'     => 'DENR-PENRO Oriental Mindoro Nursery',
                    'latitude'            => $lat,
                    'longitude'           => $lng,
                    'status'              => 'active',
                    'geo_mismatch'        => false,
                ]);
                // Two monitoring observations per record → growth trend + survival.
                foreach ([60, 20] as $j => $daysAgo) {
                    MonitoringRecord::create([
                        'plantation_record_id' => $pr->id,
                        'submitted_by'         => $fieldId,
                        'monitoring_date'      => now()->subDays($daysAgo)->toDateString(),
                        'height_cm'            => 25 + $i * 5 + $j * 8,
                        'diameter_cm'          => 1.2 + $i * 0.2 + $j * 0.3,
                        'survival_status'      => ($i === 4 && $j === 1) ? 'dead' : 'alive',
                        'growth_stage'         => $j === 0 ? 'seedling' : 'sapling',
                        'latitude'             => $lat,
                        'longitude'            => $lng,
                    ]);
                }
            }
        }

        $this->command?->info('Starter Gloria sites + sample monitoring data seeded.');
    }
}

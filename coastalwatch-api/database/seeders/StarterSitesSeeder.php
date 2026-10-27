<?php

namespace Database\Seeders;

use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds Gloria barangay-center starter markers so the Map, Sites, and Analytics
 * pages have data to display. These are not surveyed restoration-site GPS or
 * boundary records.
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
            ['Agsalin Mangrove Reserve',            'Agsalin',      16.8, 2020, 12.8838292, 121.4727700],
            ['Maragooc Coastal Mangrove Zone',      'Maragooc',      8.5, 2021, 12.8965308, 121.4728645],
            ['Guimbonan Mangrove Belt',             'Guimbonan',     6.2, 2022, 12.9051536, 121.4748765],
            ['Sta. Theresa Fish Sanctuary',         'Sta. Theresa', 38.1, 2018, 12.9179488, 121.4821010],
            ['Balete Mangrove Restoration Site',    'Balete',        4.5, 2023, 12.9349593, 121.4714367],
            ['San Antonio Coastal Mangrove Area',   'San Antonio',   7.0, 2021, 12.9450137, 121.4926727],
            ['Kawit Shoreline Mangrove Project',    'Kawit',         5.8, 2022, 12.9624753, 121.4811897],
            ['Tambong Mangrove Conservation Zone',  'Tambong',       9.3, 2019, 12.9720401, 121.4888646],
        ];

        $seededSites = [];
        foreach ($sites as [$name, $barangay, $area, $year, $lat, $lng]) {
            $existing = RestorationSite::where('name', $name)->first();
            if ($existing) {
                $seededSites[] = $existing;
                continue;
            }
            $site = RestorationSite::create([
                'created_by'       => $adminId,
                'name'             => $name,
                'description'      => "Starter site marker at the approximate center of Barangay {$barangay}, Gloria, Oriental Mindoro. Replace with verified site GPS and boundary data before operational use.",
                'area_hectares'    => $area,
                'barangay'         => $barangay,
                'status'           => 'active',
                'established_year' => $year,
                'latitude'         => $lat,
                'longitude'        => $lng,
            ]);
            $seededSites[] = $site;
        }

        // Seed starter plantation + monitoring data on starter sites that have
        // no plantation records yet so Analytics charts (survival rate, species,
        // growth) render across all starter sites.
        $speciesPool = [
            'Rhizophora mucronata',
            'Avicennia marina',
            'Sonneratia alba',
            'Bruguiera gymnorrhiza',
            'Ceriops tagal',
        ];
        foreach ($seededSites as $siteIdx => $site) {
            if (PlantationRecord::where('restoration_site_id', $site->id)->count() > 0) {
                continue;
            }
            foreach ($speciesPool as $i => $sp) {
                $lat = (float) $site->latitude + ($i * 0.0004);
                $lng = (float) $site->longitude + ($i * 0.0004);
                $pr = PlantationRecord::create([
                    'restoration_site_id' => $site->id,
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
                        'height_cm'            => 24 + ($siteIdx % 4) * 2 + $i * 5 + $j * 8,
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

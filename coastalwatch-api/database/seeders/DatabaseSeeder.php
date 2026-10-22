<?php

namespace Database\Seeders;

use App\Models\EcosystemRecord;
use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\RestorationProject;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Reference data (idempotent — safe to re-run).
        $this->call(MangroveSpeciesSeeder::class);
        $this->call(NurserySeeder::class);
        $this->call(EvaluatorAccountsSeeder::class);

        // ── MENRO Gloria Staff Accounts ───────────────────────────────────────
        $admin = User::create([
            'name'              => 'MENRO Administrator',
            'email'             => 'admin@menrogloria.gov.ph',
            'password'          => Hash::make('Admin@1234'),
            'role'              => 'admin',
            'organization'      => 'MENRO Gloria, Oriental Mindoro',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $menro = User::create([
            'name'              => 'Maria Santos',
            'email'             => 'menro@menrogloria.gov.ph',
            'password'          => Hash::make('Menro@1234'),
            'role'              => 'menro',
            'organization'      => 'MENRO Gloria, Oriental Mindoro',
            'phone'             => '+63 912 345 6789',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $staff = User::create([
            'name'              => 'Jose Reyes',
            'email'             => 'staff@menrogloria.gov.ph',
            'password'          => Hash::make('Staff@1234'),
            'role'              => 'staff',
            'organization'      => 'MENRO Gloria, Oriental Mindoro',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $fieldWorker = User::create([
            'name'              => 'Pedro Dela Cruz',
            'email'             => 'fieldworker@menrogloria.gov.ph',
            'password'          => Hash::make('Field@1234'),
            'role'              => 'field_worker',
            'organization'      => 'MENRO Gloria Field Team',
            'phone'             => '+63 917 123 4567',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $fieldWorker2 = User::create([
            'name'              => 'Rosa Magtibay',
            'email'             => 'fieldworker2@menrogloria.gov.ph',
            'password'          => Hash::make('Field@1234'),
            'role'              => 'field_worker',
            'organization'      => 'MENRO Gloria Field Team',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $volunteer = User::create([
            'name'              => 'Ana Lim',
            'email'             => 'volunteer@menrogloria.gov.ph',
            'password'          => Hash::make('Volunteer@1234'),
            'role'              => 'volunteer',
            'organization'      => 'Gloria Fisherfolk Association',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        $volunteer2 = User::create([
            'name'              => 'Carlos Bautista',
            'email'             => 'volunteer2@menrogloria.gov.ph',
            'password'          => Hash::make('Volunteer@1234'),
            'role'              => 'volunteer',
            'organization'      => 'Gloria Youth for Environment',
            'email_verified_at' => now(),
            'is_active'         => true,
        ]);

        // ── Field Reports (Gloria coastal areas) ──────────────────────────────
        $reports = [
            ['title' => 'Mangrove Damage at Barangay Caminawit',    'category' => 'damage',      'lat' => 12.9650, 'lng' => 121.4580],
            ['title' => 'Illegal Dumping Near Mangrove Zone — Brgy. Lucio Laurel', 'category' => 'pollution', 'lat' => 12.9780, 'lng' => 121.4620],
            ['title' => 'New Mangrove Sprouts at Brgy. Buenavista', 'category' => 'restoration', 'lat' => 12.9900, 'lng' => 121.4700],
            ['title' => 'Heron Nesting in Mangrove Area — Brgy. Sta. Maria', 'category' => 'wildlife', 'lat' => 12.9720, 'lng' => 121.4550],
            ['title' => 'Coastal Erosion Threatening Mangroves — Brgy. Panikihan', 'category' => 'damage', 'lat' => 12.9830, 'lng' => 121.4640],
        ];

        foreach ($reports as $i => $r) {
            Report::create([
                'user_id'       => $fieldWorker->id,
                'title'         => $r['title'],
                'description'   => 'Field observation submitted by MENRO Gloria field team. Area requires monitoring and possible intervention.',
                'latitude'      => $r['lat'],
                'longitude'     => $r['lng'],
                'location_name' => 'Gloria, Oriental Mindoro',
                'category'      => $r['category'],
                'status'        => $i < 3 ? 'approved' : 'pending',
                'reviewed_by'   => $i < 3 ? $menro->id : null,
                'reviewed_at'   => $i < 3 ? now() : null,
            ]);
        }

        // ── Restoration Projects — all real Gloria barangays ─────────────────
        $projects = [
            [
                'name'             => 'Agsalin Mangrove Restoration',
                'description'      => 'Mangrove restoration and coastal protection project in Barangay Agsalin, Gloria, Oriental Mindoro.',
                'latitude'         => 12.9720, 'longitude' => 121.4580,
                'location_name'    => 'Brgy. Agsalin, Gloria, Oriental Mindoro',
                'area_hectares'    => 5.5, 'status' => 'active',
                'progress_percent' => 87, 'trees_planted' => 850, 'trees_target' => 980,
                'start_date' => '2024-03-01', 'end_date' => '2026-12-31', 'created_by' => $menro->id,
            ],
            [
                'name'             => 'Bagong Silang Coastal Greening',
                'description'      => 'Community-led mangrove planting initiative in Barangay Bagong Silang to protect the coastline.',
                'latitude'         => 12.9780, 'longitude' => 121.4610,
                'location_name'    => 'Brgy. Bagong Silang, Gloria, Oriental Mindoro',
                'area_hectares'    => 4.2, 'status' => 'active',
                'progress_percent' => 92, 'trees_planted' => 620, 'trees_target' => 675,
                'start_date' => '2024-05-01', 'end_date' => '2026-12-31', 'created_by' => $admin->id,
            ],
            [
                'name'             => 'Bugtong na Tuog Mangrove Belt',
                'description'      => 'Mangrove belt establishment in Barangay Bugtong na Tuog for storm surge protection.',
                'latitude'         => 12.9650, 'longitude' => 121.4560,
                'location_name'    => 'Brgy. Bugtong na Tuog, Gloria, Oriental Mindoro',
                'area_hectares'    => 3.8, 'status' => 'active',
                'progress_percent' => 78, 'trees_planted' => 480, 'trees_target' => 615,
                'start_date' => '2024-07-01', 'end_date' => '2027-06-30', 'created_by' => $menro->id,
            ],
            [
                'name'             => 'Maligaya Shoreline Rehabilitation',
                'description'      => 'Shoreline rehabilitation through mangrove planting in Barangay Maligaya.',
                'latitude'         => 12.9840, 'longitude' => 121.4630,
                'location_name'    => 'Brgy. Maligaya, Gloria, Oriental Mindoro',
                'area_hectares'    => 6.0, 'status' => 'active',
                'progress_percent' => 95, 'trees_planted' => 920, 'trees_target' => 968,
                'start_date' => '2023-11-01', 'end_date' => '2026-10-31', 'created_by' => $admin->id,
            ],
            [
                'name'             => 'Mirayan Coastal Mangrove Project',
                'description'      => 'Mangrove restoration project in Barangay Mirayan to support local fisheries and biodiversity.',
                'latitude'         => 12.9760, 'longitude' => 121.4600,
                'location_name'    => 'Brgy. Mirayan, Gloria, Oriental Mindoro',
                'area_hectares'    => 4.8, 'status' => 'planned',
                'progress_percent' => 83, 'trees_planted' => 660, 'trees_target' => 795,
                'start_date' => '2025-01-01', 'end_date' => '2027-12-31', 'created_by' => $menro->id,
            ],
            [
                'name'             => 'Caminawit Mangrove Restoration Phase 1',
                'description'      => 'Large-scale mangrove replanting initiative along the Caminawit coastline of Gloria, Oriental Mindoro.',
                'latitude'         => 12.9680, 'longitude' => 121.4570,
                'location_name'    => 'Brgy. Caminawit, Gloria, Oriental Mindoro',
                'area_hectares'    => 10.5, 'status' => 'active',
                'progress_percent' => 55, 'trees_planted' => 2750, 'trees_target' => 5000,
                'start_date' => '2025-01-15', 'end_date' => '2026-12-31', 'created_by' => $menro->id,
            ],
            [
                'name'             => 'Sta. Theresa Mangrove Belt Expansion',
                'description'      => 'Expansion of the Sta. Theresa Fish Sanctuary mangrove belt.',
                'latitude'         => 12.9700, 'longitude' => 121.4590,
                'location_name'    => 'Brgy. Sta. Theresa, Gloria, Oriental Mindoro',
                'area_hectares'    => 8.0, 'status' => 'active',
                'progress_percent' => 72, 'trees_planted' => 1800, 'trees_target' => 2500,
                'start_date' => '2024-06-01', 'end_date' => '2026-12-31', 'created_by' => $admin->id,
            ],
            [
                'name'             => 'Lucio Laurel Shoreline Rehabilitation',
                'description'      => 'Mangrove rehabilitation along the Lucio Laurel shoreline to prevent coastal erosion.',
                'latitude'         => 12.9800, 'longitude' => 121.4620,
                'location_name'    => 'Brgy. Lucio Laurel, Gloria, Oriental Mindoro',
                'area_hectares'    => 4.5, 'status' => 'active',
                'progress_percent' => 40, 'trees_planted' => 600, 'trees_target' => 1500,
                'start_date' => '2025-03-01', 'end_date' => '2027-03-01', 'created_by' => $menro->id,
            ],
            [
                'name'             => 'Buenavista Coastal Greening',
                'description'      => 'Community-led mangrove restoration in partnership with local fisherfolk of Brgy. Buenavista.',
                'latitude'         => 12.9900, 'longitude' => 121.4680,
                'location_name'    => 'Brgy. Buenavista, Gloria, Oriental Mindoro',
                'area_hectares'    => 6.0, 'status' => 'planned',
                'progress_percent' => 0, 'trees_planted' => 0, 'trees_target' => 2500,
                'start_date' => '2026-06-01', 'end_date' => null, 'created_by' => $admin->id,
            ],
            [
                'name'             => 'Panikihan Coastal Protection Project',
                'description'      => 'Mangrove planting to protect Brgy. Panikihan from storm surges and coastal erosion.',
                'latitude'         => 12.9820, 'longitude' => 121.4640,
                'location_name'    => 'Brgy. Panikihan, Gloria, Oriental Mindoro',
                'area_hectares'    => 3.5, 'status' => 'planned',
                'progress_percent' => 0, 'trees_planted' => 0, 'trees_target' => 1200,
                'start_date' => '2026-09-01', 'end_date' => null, 'created_by' => $admin->id,
            ],
        ];

        foreach ($projects as $p) {
            RestorationProject::create([
                'created_by'       => $p['created_by'],
                'name'             => $p['name'],
                'description'      => $p['description'],
                'latitude'         => $p['latitude'],
                'longitude'        => $p['longitude'],
                'location_name'    => $p['location_name'],
                'area_hectares'    => $p['area_hectares'],
                'status'           => $p['status'],
                'progress_percent' => $p['progress_percent'],
                'trees_planted'    => $p['trees_planted'],
                'trees_target'     => $p['trees_target'],
                'start_date'       => $p['start_date'],
                'end_date'         => $p['end_date'] ?? null,
            ]);
        }

        // ── Restoration Sites (PostGIS polygon boundaries) ────────────────────
        // All real Gloria, Oriental Mindoro barangays

        $sitesData = [
            [
                'name'             => 'Agsalin Mangrove Reserve',
                'description'      => 'Active mangrove restoration zone in Barangay Agsalin — southernmost coastal barangay of Gloria. Features a 12-hectare core zone and 4.8-hectare mangrove/beach forest reserve with 15 identified species.',
                'area_hectares'    => 16.8, 'barangay' => 'Agsalin',
                'status'           => 'active', 'established_year' => 2020,
                'latitude'         => 12.9280, 'longitude' => 121.5020,
                'polygon'          => 'POLYGON((121.4990 12.9260, 121.5060 12.9260, 121.5060 12.9310, 121.4990 12.9310, 121.4990 12.9260))',
            ],
            [
                'name'             => 'Maragooc Coastal Mangrove Zone',
                'description'      => 'Coastal mangrove zone in Barangay Maragooc providing shoreline protection and nursery habitat for juvenile fish and crustaceans.',
                'area_hectares'    => 8.5, 'barangay' => 'Maragooc',
                'status'           => 'active', 'established_year' => 2021,
                'latitude'         => 12.9380, 'longitude' => 121.5050,
                'polygon'          => 'POLYGON((121.5020 12.9360, 121.5090 12.9360, 121.5090 12.9410, 121.5020 12.9410, 121.5020 12.9360))',
            ],
            [
                'name'             => 'Guimbonan Mangrove Belt',
                'description'      => 'Mangrove belt in Barangay Guimbonan supporting local fisheries and providing natural coastal defense against storm surges.',
                'area_hectares'    => 6.2, 'barangay' => 'Guimbonan',
                'status'           => 'active', 'established_year' => 2022,
                'latitude'         => 12.9480, 'longitude' => 121.5080,
                'polygon'          => 'POLYGON((121.5050 12.9460, 121.5120 12.9460, 121.5120 12.9510, 121.5050 12.9510, 121.5050 12.9460))',
            ],
            [
                'name'             => 'Sta. Theresa Fish Sanctuary and Mangrove Reserve',
                'description'      => 'Key protected area in Barangay Sta. Theresa featuring a 38.1-hectare core zone and 31.5-hectare mangrove/beach forest reserve. Protected by municipal ordinances and managed by MENRO Gloria.',
                'area_hectares'    => 38.1, 'barangay' => 'Sta. Theresa',
                'status'           => 'active', 'established_year' => 2018,
                'latitude'         => 12.9580, 'longitude' => 121.5100,
                'polygon'          => 'POLYGON((121.5060 12.9540, 121.5160 12.9540, 121.5160 12.9630, 121.5060 12.9630, 121.5060 12.9540))',
            ],
            [
                'name'             => 'Balete Mangrove Restoration Site',
                'description'      => 'Mangrove restoration site in Barangay Balete along the national highway corridor, supporting biodiversity and coastal resilience.',
                'area_hectares'    => 4.5, 'barangay' => 'Balete',
                'status'           => 'active', 'established_year' => 2023,
                'latitude'         => 12.9680, 'longitude' => 121.4900,
                'polygon'          => 'POLYGON((121.4870 12.9660, 121.4930 12.9660, 121.4930 12.9700, 121.4870 12.9700, 121.4870 12.9660))',
            ],
            [
                'name'             => 'San Antonio Coastal Mangrove Area',
                'description'      => 'Coastal mangrove area in Barangay San Antonio (formerly Dalagan) providing habitat for migratory birds and juvenile marine species.',
                'area_hectares'    => 7.0, 'barangay' => 'San Antonio',
                'status'           => 'active', 'established_year' => 2021,
                'latitude'         => 12.9720, 'longitude' => 121.5120,
                'polygon'          => 'POLYGON((121.5090 12.9700, 121.5160 12.9700, 121.5160 12.9750, 121.5090 12.9750, 121.5090 12.9700))',
            ],
            [
                'name'             => 'Kawit Shoreline Mangrove Project',
                'description'      => 'Mangrove planting project in Barangay Kawit along the national highway shoreline, focused on storm surge protection and coastal erosion prevention.',
                'area_hectares'    => 5.8, 'barangay' => 'Kawit',
                'status'           => 'active', 'established_year' => 2022,
                'latitude'         => 12.9760, 'longitude' => 121.4860,
                'polygon'          => 'POLYGON((121.4830 12.9740, 121.4900 12.9740, 121.4900 12.9780, 121.4830 12.9780, 121.4830 12.9740))',
            ],
            [
                'name'             => 'Tambong Mangrove Conservation Zone',
                'description'      => 'Northernmost coastal mangrove conservation zone in Barangay Tambong, one of the original settlements of Gloria. Active community-managed site.',
                'area_hectares'    => 9.3, 'barangay' => 'Tambong',
                'status'           => 'active', 'established_year' => 2019,
                'latitude'         => 12.9950, 'longitude' => 121.5150,
                'polygon'          => 'POLYGON((121.5120 12.9920, 121.5200 12.9920, 121.5200 12.9980, 121.5120 12.9980, 121.5120 12.9920))',
            ],
        ];

        $createdSites = [];
        foreach ($sitesData as $sd) {
            $site = RestorationSite::create([
                'created_by'       => $admin->id,
                'name'             => $sd['name'],
                'description'      => $sd['description'],
                'area_hectares'    => $sd['area_hectares'],
                'barangay'         => $sd['barangay'],
                'status'           => $sd['status'],
                'established_year' => $sd['established_year'],
            ]);
            try { DB::statement(
                "UPDATE restoration_sites SET boundary = ST_GeomFromText(?, 4326) WHERE id = ?",
                [$sd['polygon'], $site->id]
            ); } catch (\Exception $e) {}
            $createdSites[$sd['barangay']] = $site;
        }

        // Aliases for backward compatibility
        $site1 = $createdSites['Caminawit'] ?? $createdSites['Agsalin'];
        $site2 = $createdSites['Buenavista'] ?? $createdSites['Maragooc'];
        $site3 = $createdSites['Lucio Laurel'] ?? $createdSites['Guimbonan'];
        $site4 = $createdSites['Sta. Theresa'];

        // ── Plantation Records ────────────────────────────────────────────────
        $species = [
            'Rhizophora mucronata',
            'Avicennia marina',
            'Sonneratia alba',
            'Bruguiera gymnorrhiza',
            'Ceriops tagal',
        ];

        $plantations = [];
        foreach ($species as $i => $sp) {
            $lat = 12.9280 + ($i * 0.0015);
            $lng = 121.5020 + ($i * 0.0015);

            $pr = PlantationRecord::create([
                'restoration_site_id' => $site1->id,
                'submitted_by'        => $fieldWorker->id,
                'species_name'        => $sp,
                'date_planted'        => now()->subDays(60 + $i * 10)->toDateString(),
                'seedling_source'     => 'DENR-PENRO Oriental Mindoro Nursery',
                'latitude'            => $lat,
                'longitude'           => $lng,
                'status'              => 'active',
                'geo_mismatch'        => false,
            ]);

            try { DB::statement(
                "UPDATE plantation_records SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                [$lng, $lat, $pr->id]
            ); } catch (\Exception $e) {}

            $plantations[] = $pr;
        }

        // Additional records for site 3
        foreach (['Rhizophora apiculata', 'Avicennia officinalis'] as $i => $sp) {
            $lat = 12.9480 + ($i * 0.001);
            $lng = 121.5080 + ($i * 0.001);

            $pr = PlantationRecord::create([
                'restoration_site_id' => $site3->id,
                'submitted_by'        => $fieldWorker2->id,
                'species_name'        => $sp,
                'date_planted'        => now()->subDays(30 + $i * 7)->toDateString(),
                'seedling_source'     => 'LGU Gloria Nursery',
                'latitude'            => $lat,
                'longitude'           => $lng,
                'status'              => 'active',
                'geo_mismatch'        => false,
            ]);

            try { DB::statement(
                "UPDATE plantation_records SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                [$lng, $lat, $pr->id]
            ); } catch (\Exception $e) {}
        }

        // ── Monitoring Records ────────────────────────────────────────────────
        foreach ($plantations as $i => $pr) {
            $mr = MonitoringRecord::create([
                'plantation_record_id' => $pr->id,
                'submitted_by'         => $fieldWorker->id,
                'monitoring_date'      => now()->subDays(15)->toDateString(),
                'height_cm'            => 28.0 + ($i * 6),
                'diameter_cm'          => 1.4 + ($i * 0.25),
                'survival_status'      => $i < 4 ? 'alive' : 'dead',
                'growth_stage'         => $i < 2 ? 'seedling' : 'sapling',
                'disease_observation'  => $i === 4 ? 'Leaf discoloration observed, possible fungal infection.' : null,
                'latitude'             => $pr->latitude,
                'longitude'            => $pr->longitude,
            ]);

            try { DB::statement(
                "UPDATE monitoring_records SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                [$pr->longitude, $pr->latitude, $mr->id]
            ); } catch (\Exception $e) {}
        }

        // ── Ecosystem Records ─────────────────────────────────────────────────
        $ecoData = [
            ['date' => now()->subDays(5),  'salinity' => 27.8, 'ph' => 7.3, 'temp' => 29.5, 'tidal' => 'mid'],
            ['date' => now()->subDays(15), 'salinity' => 29.2, 'ph' => 7.1, 'temp' => 30.1, 'tidal' => 'high'],
            ['date' => now()->subDays(30), 'salinity' => 26.5, 'ph' => 7.4, 'temp' => 28.8, 'tidal' => 'low'],
        ];

        foreach ($ecoData as $eco) {
            EcosystemRecord::create([
                'restoration_site_id' => $site1->id,
                'submitted_by'        => $fieldWorker->id,
                'measurement_date'    => $eco['date']->toDateString(),
                'soil_salinity_ppt'   => $eco['salinity'],
                'water_ph'            => $eco['ph'],
                'water_temp_celsius'  => $eco['temp'],
                'tidal_condition'     => $eco['tidal'],
                'latitude'            => 12.9290,
                'longitude'           => 121.5030,
            ]);
        }

        // ── Planting Events — all real Gloria barangays ───────────────────────
        $eventData = [
            [
                'site_key'     => 'Agsalin',
                'name'         => 'Agsalin Mangrove Planting Day',
                'description'  => 'Community mangrove planting activity in Barangay Agsalin. Help restore our coastal ecosystem and protect our shoreline.',
                'days_ahead'   => 10,
                'location'     => 'Agsalin Shoreline, Gloria, Oriental Mindoro',
                'max'          => 50,
            ],
            [
                'site_key'     => 'Bagong Silang',
                'name'         => 'Bagong Silang Coastal Greening Activity',
                'description'  => 'Join us for a mangrove planting event in Barangay Bagong Silang. Open to all community members and volunteers.',
                'days_ahead'   => 18,
                'location'     => 'Bagong Silang Coastline, Gloria, Oriental Mindoro',
                'max'          => 45,
            ],
            [
                'site_key'     => 'Bugtong na Tuog',
                'name'         => 'Bugtong na Tuog Mangrove Belt Expansion',
                'description'  => 'Expansion of the mangrove belt in Barangay Bugtong na Tuog for storm surge protection. Youth volunteers welcome.',
                'days_ahead'   => 25,
                'location'     => 'Bugtong na Tuog Shoreline, Gloria, Oriental Mindoro',
                'max'          => 35,
            ],
            [
                'site_key'     => 'Maligaya',
                'name'         => 'Maligaya Shoreline Rehabilitation Event',
                'description'  => 'Mangrove planting and shoreline rehabilitation in Barangay Maligaya. Support local fisheries and biodiversity.',
                'days_ahead'   => 32,
                'location'     => 'Maligaya Beach, Gloria, Oriental Mindoro',
                'max'          => 55,
            ],
            [
                'site_key'     => 'Mirayan',
                'name'         => 'Mirayan Coastal Mangrove Planting',
                'description'  => 'Community-led mangrove planting in Barangay Mirayan. Every tree planted strengthens our coastline.',
                'days_ahead'   => 40,
                'location'     => 'Mirayan Coastline, Gloria, Oriental Mindoro',
                'max'          => 40,
            ],
            [
                'site_key'     => 'Caminawit',
                'name'         => 'Caminawit Community Mangrove Planting Day',
                'description'  => 'Join MENRO Gloria for a community mangrove planting activity at the Caminawit Mangrove Reserve. Open to all barangay residents and volunteers.',
                'days_ahead'   => 14,
                'location'     => 'Caminawit Shoreline, Gloria, Oriental Mindoro',
                'max'          => 60,
            ],
            [
                'site_key'     => 'Buenavista',
                'name'         => 'Buenavista Coastal Greening Activity',
                'description'  => 'Mangrove planting event in partnership with the Gloria Fisherfolk Association and LGU Gloria.',
                'days_ahead'   => 28,
                'location'     => 'Buenavista Beach, Gloria, Oriental Mindoro',
                'max'          => 40,
            ],
            [
                'site_key'     => 'Lucio Laurel',
                'name'         => 'Lucio Laurel Mangrove Belt Expansion',
                'description'  => 'Expansion of the existing mangrove belt in Brgy. Lucio Laurel. Youth volunteers welcome.',
                'days_ahead'   => 45,
                'location'     => 'Lucio Laurel Coastline, Gloria, Oriental Mindoro',
                'max'          => 30,
            ],
        ];

        foreach ($eventData as $ev) {
            $site = $createdSites[$ev['site_key']] ?? null;
            if (!$site) continue;
            PlantingEvent::create([
                'restoration_site_id' => $site->id,
                'created_by'          => $menro->id,
                'name'                => $ev['name'],
                'description'         => $ev['description'],
                'scheduled_at'        => now()->addDays($ev['days_ahead']),
                'location_name'       => $ev['location'],
                'max_volunteers'      => $ev['max'],
                'status'              => 'open',
            ]);
        }
    }
}

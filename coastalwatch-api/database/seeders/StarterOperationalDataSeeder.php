<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\InventoryMovement;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\RestorationSite;
use App\Models\SeedlingInventory;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Adds clearly labeled demonstration records for a newly deployed instance.
 * These examples are not verified field records or official event schedules.
 * Each record uses a stable natural key so deployment retries do not duplicate it.
 */
class StarterOperationalDataSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::query()->where('role', 'admin')->where('is_active', true)->first();
        if (! $admin) {
            throw new \RuntimeException(
                'Cannot seed starter operational data without an active admin. Run ProductionSeeder first.'
            );
        }

        $site = RestorationSite::query()->where('name', 'Agsalin Mangrove Reserve')->first();
        if (! $site) {
            throw new \RuntimeException(
                'Cannot seed starter operational data without starter sites. Run StarterSitesSeeder first.'
            );
        }

        DB::transaction(function () use ($admin, $site): void {
            $this->seedInventory($admin, $site);
            $this->seedEvents($admin, $site);
            $this->seedReports($admin);
            $this->seedTipsAndGuides($admin);
        });

        $this->command?->info('Clearly labeled starter inventory, events, reports, and tips/guides seeded.');
    }

    private function seedInventory(User $admin, RestorationSite $site): void
    {
        $batches = [
            ['Rhizophora mucronata', 500, 300, 120, 5],
            ['Avicennia marina', 280, 180, 60, 3],
            ['Sonneratia alba', 150, 100, 25, 2],
        ];

        foreach ($batches as [$species, $beginning, $received, $planted, $damaged]) {
            $note = "SAMPLE DATA ONLY: Starter inventory example for {$species}.";
            $date = now()->subDays(14)->toDateString();
            $entry = SeedlingInventory::query()->firstOrCreate(
                ['notes' => $note],
                [
                    'restoration_site_id' => $site->id,
                    'recorded_by' => $admin->id,
                    'species_name' => $species,
                    'source_nursery' => 'SAMPLE: Gloria Municipal Nursery',
                    'date_received' => $date,
                    'beginning_stock' => $beginning,
                    'quantity_received' => $received,
                    'quantity_planted' => $planted,
                    'quantity_damaged' => $damaged,
                    'stage' => 'seedling',
                ]
            );

            $movements = [
                ['stock_in', $beginning, 'Sample opening stock'],
                ['stock_in', $received, 'Sample seedlings received'],
                ['planted_out', -$planted, 'Sample planting issue'],
                ['lost', -$damaged, 'Sample damaged seedlings'],
            ];

            foreach ($movements as [$type, $quantity, $description]) {
                if ($quantity === 0) {
                    continue;
                }

                InventoryMovement::query()->firstOrCreate(
                    [
                        'seedling_inventory_id' => $entry->id,
                        'type' => $type,
                        'note' => "SAMPLE DATA ONLY: {$description}.",
                    ],
                    [
                        'recorded_by' => $admin->id,
                        'quantity' => $quantity,
                        'movement_date' => $date,
                    ]
                );
            }
        }
    }

    private function seedEvents(User $admin, RestorationSite $site): void
    {
        $events = [
            [
                'name' => 'SAMPLE: Community planting orientation',
                'description' => 'Demonstration event only; not an official or scheduled MENRO activity.',
                'days_ahead' => 14,
                'max_volunteers' => 30,
            ],
            [
                'name' => 'SAMPLE: Mangrove site-care workshop',
                'description' => 'Demonstration event only; confirm real event details with MENRO before attending.',
                'days_ahead' => 28,
                'max_volunteers' => 20,
            ],
        ];

        foreach ($events as $event) {
            PlantingEvent::query()->firstOrCreate(
                ['name' => $event['name']],
                [
                    'restoration_site_id' => $site->id,
                    'created_by' => $admin->id,
                    'description' => $event['description'],
                    'scheduled_at' => now()->addDays($event['days_ahead'])->startOfDay(),
                    'location_name' => "SAMPLE: {$site->barangay}, Gloria, Oriental Mindoro",
                    'max_volunteers' => $event['max_volunteers'],
                    'status' => 'upcoming',
                ]
            );
        }
    }

    private function seedReports(User $admin): void
    {
        $reports = [
            [
                'title' => 'SAMPLE: Mangrove shoreline inspection',
                'description' => 'Demonstration report only. This does not document a verified incident or field observation.',
                'category' => 'damage',
                'latitude' => 12.9280,
                'longitude' => 121.5020,
            ],
            [
                'title' => 'SAMPLE: Community restoration activity',
                'description' => 'Demonstration report only. Replace with verified field data before using this record operationally.',
                'category' => 'restoration',
                'latitude' => 12.9290,
                'longitude' => 121.5030,
            ],
        ];

        foreach ($reports as $report) {
            Report::withTrashed()->firstOrCreate(
                ['user_id' => $admin->id, 'title' => $report['title']],
                [
                    'description' => $report['description'],
                    'latitude' => $report['latitude'],
                    'longitude' => $report['longitude'],
                    'location_name' => 'SAMPLE: Agsalin, Gloria, Oriental Mindoro',
                    'status' => 'pending',
                    'category' => $report['category'],
                ]
            );
        }
    }

    private function seedTipsAndGuides(User $admin): void
    {
        $resources = [
            [
                'slug' => 'starter-guide-mangrove-planting-preparation',
                'title' => 'Field Guide: Preparing for a Mangrove Planting',
                'excerpt' => 'A practical checklist for planning a safe, well-documented community planting activity.',
                'category' => 'guide',
                'content' => "Before planting, confirm the site and activity with MENRO and check local guidance on suitable native species. Coordinate access and safety with the barangay, and prepare drinking water, first-aid supplies, gloves, and a participant list.\n\nRecord the date, site, species, source nursery, and quantity planted. Capture GPS points and photos where appropriate, then schedule follow-up monitoring. This sample guide is general information and does not replace local approvals or technical advice.",
            ],
            [
                'slug' => 'starter-tip-recording-seedling-inventory',
                'title' => 'Tip: Keep Seedling Inventory Records Consistent',
                'excerpt' => 'Use consistent species names, dated stock movements, and verified quantities in inventory entries.',
                'category' => 'tips',
                'content' => "Record the species, nursery source, date received, starting stock, additions, planting releases, and damaged seedlings. Enter each movement on its actual date and keep supporting notes or photos where available.\n\nReconcile the physical count with the ledger regularly. If a count needs correction, record an adjustment with an explanation instead of silently replacing earlier records. Confirm local reporting requirements with MENRO.",
            ],
        ];

        foreach ($resources as $resource) {
            Article::query()->firstOrCreate(
                ['slug' => $resource['slug']],
                [
                    'author_id' => $admin->id,
                    'title' => $resource['title'],
                    'excerpt' => $resource['excerpt'],
                    'content' => $resource['content'],
                    'category' => $resource['category'],
                    'is_published' => true,
                    'published_at' => now(),
                ]
            );
        }
    }
}

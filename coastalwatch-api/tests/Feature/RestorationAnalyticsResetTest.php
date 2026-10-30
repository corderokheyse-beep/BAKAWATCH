<?php

use App\Models\ActivityLog;
use App\Models\EcosystemRecord;
use App\Models\MangroveSpecies;
use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

test('MENRO reset clears restoration activity while preserving site setup', function () {
    Storage::fake('public');

    $admin = User::factory()->create(['role' => 'admin']);
    $worker = User::factory()->create(['role' => 'field_worker']);
    $site = RestorationSite::create([
        'created_by' => $admin->id,
        'assigned_to' => $worker->id,
        'name' => 'Test Restoration Site',
        'description' => 'Site description',
        'area_hectares' => 12.5,
        'planted_hectares' => 3.25,
        'barangay' => 'Test Barangay',
        'status' => 'active',
    ]);
    $species = MangroveSpecies::create([
        'scientific_name' => 'Rhizophora testii',
        'local_name' => 'Test mangrove',
    ]);
    $site->speciesList()->attach($species->id);

    $plantation = PlantationRecord::create([
        'restoration_site_id' => $site->id,
        'submitted_by' => $worker->id,
        'species_name' => $species->scientific_name,
        'date_planted' => now()->toDateString(),
        'image_public_id' => 'local:plantations/reset-test.jpg',
        'latitude' => 10,
        'longitude' => 124,
        'status' => 'active',
    ]);
    Storage::disk('public')->put('plantations/reset-test.jpg', 'test image');

    foreach (['alive', 'dead'] as $status) {
        MonitoringRecord::create([
            'plantation_record_id' => $plantation->id,
            'submitted_by' => $worker->id,
            'monitoring_date' => now()->toDateString(),
            'height_cm' => 12,
            'diameter_cm' => 1,
            'survival_status' => $status,
            'growth_stage' => 'seedling',
            'latitude' => 10,
            'longitude' => 124,
        ]);
    }

    EcosystemRecord::create([
        'restoration_site_id' => $site->id,
        'submitted_by' => $worker->id,
        'measurement_date' => now()->toDateString(),
        'soil_salinity_ppt' => 12,
        'water_ph' => 7,
        'water_temp_celsius' => 29,
        'tidal_condition' => 'mid',
    ]);

    $this->actingAs($admin)
        ->postJson('/api/analytics/reset-restoration-data')
        ->assertOk()
        ->assertJson([
            'sites_preserved' => 1,
            'plantation_records_deleted' => 1,
            'monitoring_records_deleted' => 2,
            'ecosystem_records_deleted' => 1,
            'planted_area_values_reset' => 1,
            'media_cleanup_failed' => false,
        ]);

    $site->refresh();
    expect($site->name)->toBe('Test Restoration Site')
        ->and($site->description)->toBe('Site description')
        ->and($site->area_hectares)->toBe(12.5)
        ->and($site->planted_hectares)->toBe(0.0)
        ->and($site->assigned_to)->toBe($worker->id)
        ->and($site->speciesList)->toHaveCount(1)
        ->and(PlantationRecord::count())->toBe(0)
        ->and(MonitoringRecord::count())->toBe(0)
        ->and(EcosystemRecord::count())->toBe(0)
        ->and(Storage::disk('public')->exists('plantations/reset-test.jpg'))->toBeFalse()
        ->and(ActivityLog::where('action', 'restoration.analytics_reset')->count())->toBe(1);
});

test('staff cannot reset restoration activity', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)
        ->postJson('/api/analytics/reset-restoration-data')
        ->assertForbidden();
});

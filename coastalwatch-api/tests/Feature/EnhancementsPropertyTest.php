<?php

// Tests for the BANTAY BAKAWAN enhancement work:
//  - Survival-rate methodology transparency
//  - Species reference RBAC
//  - AI classification human verification (prediction preserved)
//  - Offline sync idempotency (client_key dedupe)
//  - CSV import validation + provenance
//  - Integration connector honesty (no fabricated success)

use App\Models\MangroveSpecies;
use App\Models\PlantationRecord;
use App\Models\Report;
use App\Models\RestorationSite;
use App\Models\User;
use App\Services\GeoVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function enh_user(string $role): User
{
    return User::factory()->create(['role' => $role]);
}

function enh_site(): RestorationSite
{
    return RestorationSite::create([
        'created_by' => enh_user('admin')->id,
        'name'       => 'Enh Site ' . uniqid(),
        'status'     => 'active',
    ]);
}

// ─── Survival-rate methodology transparency ───────────────────────────────────
test('survival rate excludes replacement seedlings from the denominator', function () {
    $this->mock(GeoVerificationService::class, fn ($m) => $m->shouldReceive('isWithinSite')->andReturn(true));
    $site = enh_site();
    $fw   = enh_user('field_worker');

    // 3 original + 1 replacement, none monitored yet.
    for ($i = 0; $i < 3; $i++) {
        PlantationRecord::create([
            'restoration_site_id' => $site->id, 'submitted_by' => $fw->id,
            'species_name' => 'Rhizophora mucronata', 'date_planted' => now()->toDateString(),
            'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'active', 'is_replacement' => false,
        ]);
    }
    PlantationRecord::create([
        'restoration_site_id' => $site->id, 'submitted_by' => $fw->id,
        'species_name' => 'Rhizophora mucronata', 'date_planted' => now()->toDateString(),
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'active', 'is_replacement' => true,
    ]);

    $svc = app(App\Services\AnalyticsService::class);
    $sr  = $svc->survivalRate($site->id);

    expect($sr['total'])->toBe(4);
    expect($sr['denominator'])->toBe(3);          // replacement excluded
    expect($sr['replacement_count'])->toBe(1);
    expect($sr['is_official'])->toBeFalse();       // configurable default, not official
    expect($sr['methodology_version'])->not->toBeNull();
});

// ─── Species reference RBAC ───────────────────────────────────────────────────
test('species list is public but management requires an authorized role', function () {
    MangroveSpecies::create(['scientific_name' => 'Rhizophora mucronata', 'is_active' => true]);

    // Public read
    $this->getJson('/api/species')->assertStatus(200);

    // field_worker cannot create
    $this->actingAs(enh_user('field_worker'))
        ->postJson('/api/species', ['scientific_name' => 'Hacker sp.'])
        ->assertStatus(403);

    // admin can create
    $this->actingAs(enh_user('admin'))
        ->postJson('/api/species', ['scientific_name' => 'Sonneratia alba'])
        ->assertStatus(201);
});

// ─── AI classification human verification ─────────────────────────────────────
test('correcting an AI species keeps the AI prediction and stores the verified species separately', function () {
    $report = Report::create([
        'user_id' => enh_user('field_worker')->id, 'title' => 'T', 'description' => 'D',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'damage',
        'ml_species' => 'Rhizophora apiculata', 'ml_confidence' => 61.5, 'ml_analyzed' => true,
        'verification_status' => 'unverified',
    ]);

    $res = $this->actingAs(enh_user('menro'))->patchJson("/api/reports/{$report->id}/verify-species", [
        'verification_status' => 'corrected',
        'human_verified_species' => 'Rhizophora mucronata',
    ]);

    $res->assertStatus(200);
    $report->refresh();
    expect($report->ml_species)->toBe('Rhizophora apiculata');            // AI preserved
    expect($report->human_verified_species)->toBe('Rhizophora mucronata'); // verified separate
    expect($report->verification_status)->toBe('corrected');
});

test('a corrected verification without a species is rejected (422)', function () {
    $report = Report::create([
        'user_id' => enh_user('field_worker')->id, 'title' => 'T', 'description' => 'D',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'damage',
        'ml_species' => 'Ceriops tagal', 'ml_analyzed' => true, 'verification_status' => 'unverified',
    ]);

    $this->actingAs(enh_user('admin'))
        ->patchJson("/api/reports/{$report->id}/verify-species", ['verification_status' => 'corrected'])
        ->assertStatus(422);
});

// ─── Offline sync idempotency ─────────────────────────────────────────────────
test('re-submitting a plantation record with the same client_key does not create a duplicate', function () {
    $this->mock(GeoVerificationService::class, fn ($m) => $m->shouldReceive('isWithinSite')->andReturn(true));
    $site = enh_site();
    $fw   = enh_user('field_worker');
    $key  = (string) \Illuminate\Support\Str::uuid();

    $payload = [
        'restoration_site_id' => $site->id, 'species_name' => 'Sonneratia alba',
        'date_planted' => now()->toDateString(), 'latitude' => 12.9, 'longitude' => 121.5,
        'client_key' => $key,
    ];

    $r1 = $this->actingAs($fw)->postJson('/api/plantation-records', $payload);
    $r1->assertStatus(201);
    $r2 = $this->actingAs($fw)->postJson('/api/plantation-records', $payload);
    $r2->assertStatus(200);

    expect(PlantationRecord::where('client_key', $key)->count())->toBe(1);
    expect($r2->json('duplicate'))->toBeTrue();
});

// ─── CSV import ───────────────────────────────────────────────────────────────
test('CSV import creates valid records marked source=csv_import and skips invalid rows', function () {
    $site = enh_site();
    $admin = enh_user('admin');

    $svc = app(App\Services\IntegrationService::class);
    $csv = "restoration_site_id,species_name,date_planted,latitude,longitude\n"
         . "{$site->id},Rhizophora mucronata,2026-09-10,12.91,121.51\n"
         . "999,Bad Site,2026-09-10,12.9,121.5\n"          // invalid site
         . "{$site->id},No Coords,2026-09-10,,\n";          // missing coords
    $path = tempnam(sys_get_temp_dir(), 'csv');
    file_put_contents($path, $csv);

    $result = $svc->importPlantationCsv($path, 'test.csv', $admin->id);
    @unlink($path);

    expect($result['records_imported'])->toBe(1);
    expect($result['records_skipped'])->toBe(2);
    expect(PlantationRecord::where('source', 'csv_import')->count())->toBe(1);
    $rec = PlantationRecord::where('source', 'csv_import')->first();
    expect((bool) $rec->location_verified)->toBeFalse(); // imported → needs verification
});

// ─── Integration honesty ──────────────────────────────────────────────────────
test('an unconfigured government connector reports pending, never a fake success', function () {
    $svc    = app(App\Services\IntegrationService::class);
    $result = $svc->syncConnector('denr', enh_user('admin')->id);
    expect($result['status'])->toBe('pending');
});

test('integration admin endpoints are blocked for non-admins', function () {
    $this->actingAs(enh_user('menro'))
        ->getJson('/api/admin/integrations/status')
        ->assertStatus(403);
});

// ─── DENR + Evaluator roles ───────────────────────────────────────────────────
test('DENR and evaluator can read analytics but cannot submit field records', function () {
    $this->mock(GeoVerificationService::class, fn ($m) => $m->shouldReceive('isWithinSite')->andReturn(true));
    $site = enh_site();

    foreach (['denr', 'evaluator'] as $role) {
        // Analytics read allowed
        $this->actingAs(enh_user($role))->getJson("/api/analytics/{$site->id}")->assertStatus(200);

        // Field submission blocked (403)
        $this->actingAs(enh_user($role))->postJson('/api/plantation-records', [
            'restoration_site_id' => $site->id, 'species_name' => 'Rhizophora mucronata',
            'date_planted' => now()->toDateString(), 'latitude' => 12.9, 'longitude' => 121.5,
        ])->assertStatus(403);
    }
});

test('evaluator can verify AI species but DENR cannot', function () {
    $make = fn () => Report::create([
        'user_id' => enh_user('field_worker')->id, 'title' => 'T', 'description' => 'D',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'damage',
        'ml_species' => 'Ceriops tagal', 'ml_analyzed' => true, 'verification_status' => 'unverified',
    ]);

    $r1 = $make();
    $this->actingAs(enh_user('evaluator'))
        ->patchJson("/api/reports/{$r1->id}/verify-species", ['verification_status' => 'confirmed'])
        ->assertStatus(200);

    $r2 = $make();
    $this->actingAs(enh_user('denr'))
        ->patchJson("/api/reports/{$r2->id}/verify-species", ['verification_status' => 'confirmed'])
        ->assertStatus(403);
});

// ─── Monitoring / ecosystem offline dedupe ────────────────────────────────────
test('monitoring record re-sync with the same client_key does not duplicate', function () {
    $this->mock(GeoVerificationService::class, fn ($m) => $m->shouldReceive('isWithinSite')->andReturn(true));
    $site = enh_site();
    $fw   = enh_user('field_worker');
    $pr = PlantationRecord::create([
        'restoration_site_id' => $site->id, 'submitted_by' => $fw->id,
        'species_name' => 'Sonneratia alba', 'date_planted' => now()->toDateString(),
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'active',
    ]);
    $key = (string) \Illuminate\Support\Str::uuid();
    $payload = [
        'plantation_record_id' => $pr->id, 'monitoring_date' => now()->toDateString(),
        'height_cm' => 40, 'diameter_cm' => 2, 'survival_status' => 'alive',
        'growth_stage' => 'sapling', 'latitude' => 12.9, 'longitude' => 121.5, 'client_key' => $key,
    ];

    $this->actingAs($fw)->postJson('/api/monitoring-records', $payload)->assertStatus(201);
    $this->actingAs($fw)->postJson('/api/monitoring-records', $payload)->assertStatus(200);

    expect(App\Models\MonitoringRecord::where('client_key', $key)->count())->toBe(1);
});

test('ecosystem record re-sync with the same client_key does not duplicate', function () {
    $site = enh_site();
    $fw   = enh_user('field_worker');
    $key  = (string) \Illuminate\Support\Str::uuid();
    $payload = [
        'restoration_site_id' => $site->id, 'measurement_date' => now()->toDateString(),
        'soil_salinity_ppt' => 20, 'water_ph' => 7.5, 'water_temp_celsius' => 28,
        'tidal_condition' => 'mid', 'client_key' => $key,
    ];

    $this->actingAs($fw)->postJson('/api/ecosystem-records', $payload)->assertStatus(201);
    $this->actingAs($fw)->postJson('/api/ecosystem-records', $payload)->assertStatus(200);

    expect(App\Models\EcosystemRecord::where('client_key', $key)->count())->toBe(1);
});

// ─── Report photo validation (fixes the 422-on-submit bug) ────────────────────
test('a report with a valid JPEG photo is accepted', function () {
    $img = \Illuminate\Http\Testing\File::image('mangrove.jpg', 640, 480); // real image content

    $this->actingAs(enh_user('field_worker'))->post('/api/reports', [
        'title'       => 'Mangrove observation with photo',
        'description' => 'A sufficiently detailed description of the observed mangrove condition.',
        'category'    => 'other',
        'latitude'    => 12.9719,
        'longitude'   => 121.4914,
        'image'       => $img,
    ])->assertStatus(201);
});

test('a report with a non-image file is rejected with a clear 422', function () {
    $bad = \Illuminate\Http\Testing\File::create('notes.pdf', 20, 'application/pdf');

    $res = $this->actingAs(enh_user('field_worker'))->post('/api/reports', [
        'title'       => 'Report with a bad attachment',
        'description' => 'A sufficiently detailed description of the observed mangrove condition.',
        'category'    => 'other',
        'latitude'    => 12.9719,
        'longitude'   => 121.4914,
        'image'       => $bad,
    ], ['Accept' => 'application/json']);

    $res->assertStatus(422);
    expect($res->json('errors.image'))->not->toBeNull();
});

test('a report without any photo is still accepted (photo is optional)', function () {
    $this->actingAs(enh_user('field_worker'))->postJson('/api/reports', [
        'title'       => 'Text-only mangrove observation',
        'description' => 'A sufficiently detailed description of the observed mangrove condition.',
        'category'    => 'other',
        'latitude'    => 12.9719,
        'longitude'   => 121.4914,
    ])->assertStatus(201);
});

// ─── Public landing stats + production seeder ─────────────────────────────────
test('public stats endpoint returns real aggregate figures without auth', function () {
    $site = enh_site();
    $fw   = enh_user('field_worker');
    PlantationRecord::create([
        'restoration_site_id' => $site->id, 'submitted_by' => $fw->id,
        'species_name' => 'Rhizophora mucronata', 'date_planted' => now()->toDateString(),
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'active',
    ]);

    $res = $this->getJson('/api/public/stats');
    $res->assertStatus(200)
        ->assertJsonStructure([
            'restoration_sites', 'species_monitored', 'trees_planted',
            'protected_area_ha', 'survival_rate', 'active_projects',
        ]);

    // Figures reflect real data (at least the one site + one plantation record).
    expect($res->json('restoration_sites'))->toBeGreaterThanOrEqual(1);
    // No monitoring yet → survival_rate is null, never a fabricated number.
    expect($res->json('survival_rate'))->toBeNull();
});

test('ProductionSeeder seeds species + admin but no demo reports/sites/events', function () {
    putenv('ADMIN_EMAIL=deploy-admin@example.gov');
    putenv('ADMIN_PASSWORD=Str0ngPass!123');
    $_ENV['ADMIN_EMAIL'] = 'deploy-admin@example.gov';
    $_ENV['ADMIN_PASSWORD'] = 'Str0ngPass!123';
    $_SERVER['ADMIN_EMAIL'] = 'deploy-admin@example.gov';
    $_SERVER['ADMIN_PASSWORD'] = 'Str0ngPass!123';

    $this->seed(\Database\Seeders\ProductionSeeder::class);

    expect(MangroveSpecies::count())->toBeGreaterThan(0);
    expect(User::where('email', 'deploy-admin@example.gov')->where('role', 'admin')->exists())->toBeTrue();

    // Crucially: no operational/demo data is created.
    expect(Report::count())->toBe(0);
    expect(RestorationSite::count())->toBe(0);
    expect(App\Models\PlantingEvent::count())->toBe(0);
    expect(App\Models\RestorationProject::count())->toBe(0);

    putenv('ADMIN_EMAIL');
    putenv('ADMIN_PASSWORD');
    unset($_ENV['ADMIN_EMAIL'], $_ENV['ADMIN_PASSWORD'], $_SERVER['ADMIN_EMAIL'], $_SERVER['ADMIN_PASSWORD']);
});

// ─── /reports optional-auth scoping (fixes "my report not showing") ───────────
test('authenticated field worker sees their own pending report in the public reports list', function () {
    $fw = enh_user('field_worker');

    // A pending report owned by this user + an approved one by someone else.
    Report::create([
        'user_id' => $fw->id, 'title' => 'My pending observation', 'description' => 'desc',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'other',
    ]);
    Report::create([
        'user_id' => enh_user('menro')->id, 'title' => 'Someone approved', 'description' => 'desc',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'approved', 'category' => 'other',
    ]);

    // Guest sees only the approved one.
    $guest = $this->getJson('/api/reports');
    expect($guest->json('total'))->toBe(1);

    // The owner (authenticated) sees both — including their pending report.
    $auth = $this->actingAs($fw)->getJson('/api/reports');
    expect($auth->json('total'))->toBe(2);
    $titles = collect($auth->json('data'))->pluck('title');
    expect($titles)->toContain('My pending observation');
});

test('a user cannot view someone elses pending report detail', function () {
    $owner = enh_user('field_worker');
    $other = enh_user('volunteer');
    $report = Report::create([
        'user_id' => $owner->id, 'title' => 'Private pending', 'description' => 'desc',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'other',
    ]);

    // Owner can view it.
    $this->actingAs($owner)->getJson("/api/reports/{$report->id}")->assertStatus(200);
    // A different regular user cannot (404).
    $this->actingAs($other)->getJson("/api/reports/{$report->id}")->assertStatus(404);
    // A guest cannot.
    $this->getJson("/api/reports/{$report->id}")->assertStatus(404);
});

// ─── Report photo is actually stored (local disk fallback) ────────────────────
test('a submitted report photo is stored and gets a usable image_url', function () {
    \Illuminate\Support\Facades\Storage::fake('public');

    $img = \Illuminate\Http\Testing\File::image('mangrove.jpg', 640, 480);

    $res = $this->actingAs(enh_user('field_worker'))->post('/api/reports', [
        'title'       => 'Report with a stored photo',
        'description' => 'A sufficiently detailed description of the observed mangrove condition.',
        'category'    => 'damage',
        'latitude'    => 12.9719,
        'longitude'   => 121.4914,
        'image'       => $img,
    ], ['Accept' => 'application/json']);

    $res->assertStatus(201);

    // image_url must be populated (not null) and point at the uploads route.
    $url = $res->json('report.image_url');
    expect($url)->not->toBeNull();
    expect($url)->toContain('/api/uploads/');

    // The file physically exists on the (faked) public disk.
    $report = App\Models\Report::latest('id')->first();
    $path = str_replace('local:', '', (string) $report->image_public_id);
    \Illuminate\Support\Facades\Storage::disk('public')->assertExists($path);
});

// ─── Adding/replacing a report photo after submission ─────────────────────────
test('the owner can add a photo to their pending report and it is stored', function () {
    \Illuminate\Support\Facades\Storage::fake('public');
    $owner = enh_user('field_worker');

    // A pending report with no photo yet.
    $report = Report::create([
        'user_id' => $owner->id, 'title' => 'Report needing a photo',
        'description' => 'A detailed description of the observed mangrove condition here.',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'damage',
    ]);
    expect($report->image_url)->toBeNull();

    $img = \Illuminate\Http\Testing\File::image('added.jpg', 400, 300);
    $res = $this->actingAs($owner)->post("/api/reports/{$report->id}", [
        '_method' => 'PUT',
        'image'   => $img,
    ], ['Accept' => 'application/json']);

    $res->assertStatus(200);
    $report->refresh();
    expect($report->image_url)->not->toBeNull();
    expect($report->image_url)->toContain('/api/uploads/');
    \Illuminate\Support\Facades\Storage::disk('public')
        ->assertExists(str_replace('local:', '', (string) $report->image_public_id));
});

test('a non-owner cannot add a photo to someone elses report', function () {
    \Illuminate\Support\Facades\Storage::fake('public');
    $owner = enh_user('field_worker');
    $other = enh_user('volunteer');
    $report = Report::create([
        'user_id' => $owner->id, 'title' => 'Owned report',
        'description' => 'A detailed description of the observed mangrove condition here.',
        'latitude' => 12.9, 'longitude' => 121.5, 'status' => 'pending', 'category' => 'damage',
    ]);

    $img = \Illuminate\Http\Testing\File::image('x.jpg', 200, 200);
    $this->actingAs($other)->post("/api/reports/{$report->id}", [
        '_method' => 'PUT', 'image' => $img,
    ], ['Accept' => 'application/json'])->assertStatus(403);
});

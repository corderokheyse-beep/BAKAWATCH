<?php

use App\Models\Report;
use App\Models\ReportUpdate;
use App\Models\User;
use App\Services\CloudinaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;

uses(RefreshDatabase::class);

test('MENRO can add a report update with a photo and see legacy photos in the timeline', function () {
    $reportOwner = User::factory()->create(['role' => 'field_worker']);
    $otherFieldWorker = User::factory()->create(['role' => 'field_worker']);
    $menro = User::factory()->create(['role' => 'menro']);
    $report = Report::create([
        'user_id' => $reportOwner->id,
        'title' => 'Threat report',
        'description' => 'Test report',
        'latitude' => 12.9,
        'longitude' => 121.5,
        'status' => 'pending',
        'category' => 'damage',
    ]);

    ReportUpdate::create([
        'report_id' => $report->id,
        'updated_by' => $reportOwner->id,
        'observation' => 'Legacy update',
        'status' => 'pending',
        'image_url' => 'https://images.example/legacy-update.jpg',
        'update_date' => now()->toDateString(),
    ]);

    $this->mock(CloudinaryService::class, function ($mock) {
        $mock->shouldReceive('upload')
            ->once()
            ->withArgs(fn ($file, $folder) => $folder === 'report-updates')
            ->andReturn([
                'secure_url' => 'https://images.example/new-update.jpg',
                'public_id' => 'report-updates/new-update',
            ]);
    });

    $this->actingAs($otherFieldWorker)
        ->post("/api/reports/{$report->id}/updates", [
            'type' => 'threat',
            'fields' => [
                'threat_status' => 'Walang Pagbabago',
                'area_trend' => 'Pareho pa rin (Same)',
                'next_step' => 'Ituloy ang Regular na Monitoring',
            ],
            'photos' => [UploadedFile::fake()->image('follow-up.jpg')],
        ])
        ->assertForbidden();

    $this->actingAs($menro)
        ->post("/api/reports/{$report->id}/updates", [
            'type' => 'threat',
            'fields' => [
                'threat_status' => 'Walang Pagbabago',
                'area_trend' => 'Pareho pa rin (Same)',
                'next_step' => 'Ituloy ang Regular na Monitoring',
            ],
            'photos' => [UploadedFile::fake()->image('follow-up.jpg')],
        ])
        ->assertCreated()
        ->assertJsonPath('update.photos.0.url', 'https://images.example/new-update.jpg');

    $this->actingAs($menro)
        ->getJson("/api/reports/{$report->id}/timeline")
        ->assertOk()
        ->assertJsonFragment(['image_url' => 'https://images.example/legacy-update.jpg'])
        ->assertJsonFragment(['url' => 'https://images.example/new-update.jpg']);
});

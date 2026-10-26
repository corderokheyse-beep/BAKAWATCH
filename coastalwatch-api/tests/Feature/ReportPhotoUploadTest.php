<?php

use App\Models\Report;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\MangroveMLService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;

uses(RefreshDatabase::class);

test('threat reports save up to five photos and analyze only the first', function () {
    $reporter = User::factory()->create(['role' => 'field_worker']);
    $photos = array_map(
        fn ($index) => UploadedFile::fake()->image("report-{$index}.jpg"),
        range(1, 5),
    );

    $cloudinary = $this->mock(CloudinaryService::class);
    $cloudinary->shouldReceive('upload')
        ->times(5)
        ->withArgs(fn ($file, $folder) => $folder === 'reports')
        ->andReturnUsing(function ($file) {
            return [
                'secure_url' => "https://images.example/{$file->getClientOriginalName()}",
                'public_id' => "reports/{$file->getClientOriginalName()}",
            ];
        });

    $this->mock(MangroveMLService::class, function ($mock) use ($photos) {
        $mock->shouldReceive('analyze')
            ->once()
            ->with($photos[0])
            ->andReturn(null);
    });

    $response = $this->actingAs($reporter)->post('/api/reports', [
        'title' => 'Five-photo threat report',
        'description' => 'A sufficiently detailed description of the observed threat.',
        'latitude' => 12.9,
        'longitude' => 121.5,
        'category' => 'damage',
        'photos' => $photos,
    ]);

    $response->assertCreated()
        ->assertJsonPath('report.image_url', 'https://images.example/report-1.jpg')
        ->assertJsonCount(5, 'report.photos');

    $report = Report::findOrFail($response->json('report.id'));
    expect($report->photos)->toHaveCount(5)
        ->and($report->image_public_id)->toBe('reports/report-1.jpg');
});

test('threat report validation rejects more than five photos', function () {
    $reporter = User::factory()->create(['role' => 'field_worker']);
    $this->mock(CloudinaryService::class, fn ($mock) => $mock->shouldNotReceive('upload'));

    $photos = array_map(
        fn ($index) => UploadedFile::fake()->image("report-{$index}.jpg"),
        range(1, 6),
    );

    $this->withHeader('Accept', 'application/json')
        ->actingAs($reporter)
        ->post('/api/reports', [
            'title' => 'Too many report photos',
            'description' => 'A sufficiently detailed description of the observed threat.',
            'latitude' => 12.9,
            'longitude' => 121.5,
            'category' => 'damage',
            'photos' => $photos,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('photos');
});

test('map report data resolves legacy local photo URLs against the current host', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    Report::create([
        'user_id' => $admin->id,
        'title' => 'Legacy local image',
        'description' => 'A report with a local image URL saved under an old host.',
        'image_url' => 'http://localhost:8000/api/uploads/reports/legacy.jpg',
        'image_public_id' => 'local:reports/legacy.jpg',
        'latitude' => 12.9,
        'longitude' => 121.5,
        'status' => 'pending',
        'category' => 'damage',
    ]);

    $this->actingAs($admin)
        ->getJson('/api/reports/map')
        ->assertOk()
        ->assertJsonPath('0.image_url', url('/api/uploads/reports/legacy.jpg'))
        ->assertJsonMissingPath('0.image_public_id');
});

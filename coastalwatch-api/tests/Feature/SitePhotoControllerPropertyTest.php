<?php

// Feature: mangrove-monitoring-system, Property 11: Site photo upload stores all required fields
// Feature: mangrove-monitoring-system, Property 12: Photo type filter returns only matching photos
// Feature: mangrove-monitoring-system, Property 13: Invalid photo formats are rejected

use App\Models\RestorationSite;
use App\Models\SitePhoto;
use App\Models\User;
use App\Services\CloudinaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with spc_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function spc_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function spc_makeFieldWorker(): User
{
    return User::factory()->create(['role' => 'field_worker']);
}

function spc_makeMenro(): User
{
    return User::factory()->create(['role' => 'menro']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function spc_makeSite(array $overrides = []): RestorationSite
{
    $admin = spc_makeAdmin();

    return RestorationSite::create(array_merge([
        'created_by'    => $admin->id,
        'name'          => 'Photo Test Site ' . uniqid(),
        'description'   => 'A test site for photo uploads',
        'status'        => 'active',
        'area_hectares' => 10.0,
        'barangay'      => 'Barangay Test',
    ], $overrides));
}

/**
 * Mock CloudinaryService to return a deterministic fake result.
 * Returns the mock so callers can add further expectations if needed.
 */
function spc_mockCloudinary(\Tests\TestCase $testCase, string $fakeUrl = null, string $fakePublicId = null): \Mockery\MockInterface
{
    $url      = $fakeUrl      ?? 'https://res.cloudinary.com/test/image/upload/site-photos/fake_' . uniqid() . '.jpg';
    $publicId = $fakePublicId ?? 'site-photos/fake_' . uniqid();

    return $testCase->mock(CloudinaryService::class, function ($mock) use ($url, $publicId) {
        $mock->shouldReceive('upload')
            ->andReturn([
                'secure_url' => $url,
                'public_id'  => $publicId,
            ]);
    });
}

/**
 * Create a fake JPEG image file for upload.
 */
function spc_fakeJpeg(string $name = 'photo.jpg'): UploadedFile
{
    return UploadedFile::fake()->image($name, 100, 100);
}

/**
 * Create a fake PNG image file for upload.
 */
function spc_fakePng(string $name = 'photo.png'): UploadedFile
{
    return UploadedFile::fake()->image($name, 100, 100);
}

// ---------------------------------------------------------------------------
// Property 11: Site photo upload stores all required fields
//
// For any valid site photo upload, the stored record SHALL contain non-null
// values for: cloudinary_url, cloudinary_public_id, created_at, uploaded_by,
// restoration_site_id, and photo_type.
//
// Uses POST /api/sites/{site}/photos (menro role required per route config).
//
// Validates: Requirements 6.2
// ---------------------------------------------------------------------------
test('Property 11: Site photo upload stores all required fields — non-null for all 6 fields (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 11: Site photo upload stores all required fields

    $photoTypes = ['before', 'after'];
    $menro      = spc_makeMenro();
    $site       = spc_makeSite();

    // Mock CloudinaryService once — it returns a fixed fake URL/public_id.
    // Property 11 only requires that the stored fields are non-null; the exact
    // URL value is not part of the property specification.
    $this->mock(CloudinaryService::class, function ($mock) {
        $mock->shouldReceive('upload')
            ->andReturn([
                'secure_url' => 'https://res.cloudinary.com/test/image/upload/site-photos/fake.jpg',
                'public_id'  => 'site-photos/fake_photo',
            ]);
    });

    for ($i = 0; $i < 100; $i++) {
        $photoType = $photoTypes[array_rand($photoTypes)];

        $file = spc_fakeJpeg("photo_{$i}.jpg");

        $response = $this->actingAs($menro)->postJson("/api/sites/{$site->id}/photos", [
            'photo'      => $file,
            'photo_type' => $photoType,
        ]);

        $response->assertStatus(201,
            "Iteration {$i}: POST /api/sites/{$site->id}/photos should return HTTP 201"
        );

        $photoId = $response->json('id');

        expect($photoId)->not->toBeNull(
            "Iteration {$i}: response should include the new photo id"
        );

        // Fetch the stored record directly from the DB
        $stored = SitePhoto::find($photoId);

        expect($stored)->not->toBeNull(
            "Iteration {$i}: SitePhoto record should exist in the database"
        );

        // Assert all 6 required fields are non-null (Property 11 core requirement)
        expect($stored->cloudinary_url)->not->toBeNull(
            "Iteration {$i}: cloudinary_url must not be null"
        );
        expect($stored->cloudinary_public_id)->not->toBeNull(
            "Iteration {$i}: cloudinary_public_id must not be null"
        );
        expect($stored->created_at)->not->toBeNull(
            "Iteration {$i}: created_at must not be null"
        );
        expect($stored->uploaded_by)->not->toBeNull(
            "Iteration {$i}: uploaded_by must not be null"
        );
        expect($stored->restoration_site_id)->not->toBeNull(
            "Iteration {$i}: restoration_site_id must not be null"
        );
        expect($stored->photo_type)->not->toBeNull(
            "Iteration {$i}: photo_type must not be null"
        );

        // Assert the values are correct (non-empty strings / correct IDs)
        expect($stored->cloudinary_url)->not->toBeEmpty(
            "Iteration {$i}: cloudinary_url must not be empty"
        );
        expect($stored->cloudinary_public_id)->not->toBeEmpty(
            "Iteration {$i}: cloudinary_public_id must not be empty"
        );
        expect($stored->uploaded_by)->toBe($menro->id,
            "Iteration {$i}: uploaded_by should be the authenticated user's id"
        );
        expect($stored->restoration_site_id)->toBe($site->id,
            "Iteration {$i}: restoration_site_id should match the site in the route"
        );
        expect($stored->photo_type)->toBe($photoType,
            "Iteration {$i}: photo_type should match the submitted value '{$photoType}'"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 12: Photo type filter returns only matching photos
//
// For any photo_type filter applied to a site's photo retrieval endpoint,
// all returned photos SHALL have photo_type equal to the requested filter value.
//
// Uses POST /api/sites/{site}/photos to seed, then
//      GET  /api/sites/{site}/photos?photo_type=before|after
//
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------
test('Property 12: Photo type filter returns only matching photos — all results match requested filter (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 12: Photo type filter returns only matching photos

    $menro = spc_makeMenro();
    $admin = spc_makeAdmin();

    for ($i = 0; $i < 100; $i++) {
        $site = spc_makeSite();

        // Decide how many 'before' and 'after' photos to upload (at least 1 each)
        $beforeCount = mt_rand(1, 5);
        $afterCount  = mt_rand(1, 5);

        // Mock CloudinaryService to accept any number of upload calls
        $cloudinaryMock = \Mockery::mock(CloudinaryService::class);
        $cloudinaryMock->shouldReceive('upload')
            ->andReturnUsing(function () {
                return [
                    'secure_url' => 'https://res.cloudinary.com/test/image/upload/fake_' . uniqid() . '.jpg',
                    'public_id'  => 'site-photos/fake_' . uniqid(),
                ];
            });
        $this->app->instance(CloudinaryService::class, $cloudinaryMock);

        // Upload 'before' photos
        for ($b = 0; $b < $beforeCount; $b++) {
            $response = $this->actingAs($menro)->postJson("/api/sites/{$site->id}/photos", [
                'photo'      => spc_fakeJpeg("before_{$b}.jpg"),
                'photo_type' => 'before',
            ]);
            $response->assertStatus(201,
                "Iteration {$i}: uploading 'before' photo #{$b} should return HTTP 201"
            );
        }

        // Upload 'after' photos
        for ($a = 0; $a < $afterCount; $a++) {
            $response = $this->actingAs($menro)->postJson("/api/sites/{$site->id}/photos", [
                'photo'      => spc_fakePng("after_{$a}.png"),
                'photo_type' => 'after',
            ]);
            $response->assertStatus(201,
                "Iteration {$i}: uploading 'after' photo #{$a} should return HTTP 201"
            );
        }

        // --- Test filter: photo_type=before ---
        $beforeResponse = $this->actingAs($admin)
            ->getJson("/api/sites/{$site->id}/photos?photo_type=before");

        $beforeResponse->assertStatus(200,
            "Iteration {$i}: GET /api/sites/{$site->id}/photos?photo_type=before should return HTTP 200"
        );

        $beforePhotos = $beforeResponse->json();

        expect(count($beforePhotos))->toBe($beforeCount,
            "Iteration {$i}: expected {$beforeCount} 'before' photos, got " . count($beforePhotos)
        );

        foreach ($beforePhotos as $idx => $photo) {
            expect($photo['photo_type'])->toBe('before',
                "Iteration {$i}: photo[{$idx}] photo_type should be 'before', got '{$photo['photo_type']}'"
            );
        }

        // --- Test filter: photo_type=after ---
        $afterResponse = $this->actingAs($admin)
            ->getJson("/api/sites/{$site->id}/photos?photo_type=after");

        $afterResponse->assertStatus(200,
            "Iteration {$i}: GET /api/sites/{$site->id}/photos?photo_type=after should return HTTP 200"
        );

        $afterPhotos = $afterResponse->json();

        expect(count($afterPhotos))->toBe($afterCount,
            "Iteration {$i}: expected {$afterCount} 'after' photos, got " . count($afterPhotos)
        );

        foreach ($afterPhotos as $idx => $photo) {
            expect($photo['photo_type'])->toBe('after',
                "Iteration {$i}: photo[{$idx}] photo_type should be 'after', got '{$photo['photo_type']}'"
            );
        }

        // --- Test unfiltered: should return all photos ---
        $allResponse = $this->actingAs($admin)
            ->getJson("/api/sites/{$site->id}/photos");

        $allResponse->assertStatus(200,
            "Iteration {$i}: GET /api/sites/{$site->id}/photos (no filter) should return HTTP 200"
        );

        $allPhotos = $allResponse->json();
        $expectedTotal = $beforeCount + $afterCount;

        expect(count($allPhotos))->toBe($expectedTotal,
            "Iteration {$i}: unfiltered response should return all {$expectedTotal} photos, got " . count($allPhotos)
        );
    }
});

// ---------------------------------------------------------------------------
// Property 13: Invalid photo formats are rejected
//
// For any file submitted with a MIME type not in [image/jpeg, image/png,
// image/webp], the upload endpoint SHALL return a validation error (HTTP 422)
// without attempting a Cloudinary upload.
//
// Uses POST /api/sites/{site}/photos (menro role required per route config).
//
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------
test('Property 13: Invalid photo formats are rejected — HTTP 422 and no Cloudinary upload attempted (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 13: Invalid photo formats are rejected

    $menro = spc_makeMenro();
    $site  = spc_makeSite();

    // Invalid MIME types / extensions that must be rejected
    $invalidFormats = [
        ['ext' => 'pdf',  'mime' => 'application/pdf'],
        ['ext' => 'gif',  'mime' => 'image/gif'],
        ['ext' => 'bmp',  'mime' => 'image/bmp'],
        ['ext' => 'txt',  'mime' => 'text/plain'],
        ['ext' => 'svg',  'mime' => 'image/svg+xml'],
        ['ext' => 'tiff', 'mime' => 'image/tiff'],
        ['ext' => 'ico',  'mime' => 'image/x-icon'],
        ['ext' => 'mp4',  'mime' => 'video/mp4'],
        ['ext' => 'zip',  'mime' => 'application/zip'],
        ['ext' => 'doc',  'mime' => 'application/msword'],
    ];

    for ($i = 0; $i < 100; $i++) {
        // Pick a random invalid format for this iteration
        $format = $invalidFormats[array_rand($invalidFormats)];

        // CloudinaryService::upload must NEVER be called for invalid formats.
        // We set up a mock that will fail the test if upload() is invoked.
        $cloudinaryMock = \Mockery::mock(CloudinaryService::class);
        $cloudinaryMock->shouldReceive('upload')
            ->never()
            ->withAnyArgs();
        $this->app->instance(CloudinaryService::class, $cloudinaryMock);

        // Create a fake file with the invalid extension/MIME type
        $fakeFile = UploadedFile::fake()->create(
            "invalid_file_{$i}.{$format['ext']}",
            100, // 100 KB — well within size limit
            $format['mime']
        );

        $photoType = (mt_rand(0, 1) === 0) ? 'before' : 'after';

        $response = $this->actingAs($menro)->postJson("/api/sites/{$site->id}/photos", [
            'photo'      => $fakeFile,
            'photo_type' => $photoType,
        ]);

        $response->assertStatus(422,
            "Iteration {$i}: uploading a '{$format['ext']}' file should return HTTP 422, got {$response->status()}"
        );

        // Assert the validation error references the 'photo' field
        $errors = $response->json('errors');
        expect(is_array($errors) && array_key_exists('photo', $errors))->toBeTrue(
            "Iteration {$i}: validation errors should include the 'photo' field for format '{$format['ext']}'"
        );

        // Assert no SitePhoto record was created
        $count = SitePhoto::where('restoration_site_id', $site->id)->count();
        expect($count)->toBe(0,
            "Iteration {$i}: no SitePhoto should be stored after rejecting a '{$format['ext']}' file"
        );
    }
});

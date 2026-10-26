<?php

use App\Services\CloudinaryService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

test('uploads fail clearly outside local environments when Cloudinary is not configured', function () {
    $this->app->instance('env', 'production');
    config([
        'cloudinary.cloud_name' => '',
        'cloudinary.api_key' => '',
        'cloudinary.api_secret' => '',
        'filesystems.default' => 'local',
    ]);

    expect(fn () => app(CloudinaryService::class)->upload(
        UploadedFile::fake()->image('report.jpg')
    ))->toThrow(
        ServiceUnavailableHttpException::class,
        'Durable image storage is not configured.'
    );
});

test('uses the configured S3 disk for durable image uploads when Cloudinary is unavailable', function () {
    Storage::fake('s3');
    $this->app->instance('env', 'production');
    config([
        'cloudinary.cloud_name' => '',
        'cloudinary.api_key' => '',
        'cloudinary.api_secret' => '',
        'filesystems.default' => 's3',
        'filesystems.disks.s3.bucket' => 'test-bucket',
    ]);

    $service = app(CloudinaryService::class);
    $upload = $service->upload(UploadedFile::fake()->image('report.jpg'), 'report-updates');
    $path = substr($upload['public_id'], strlen('s3:'));

    expect($upload['public_id'])->toStartWith('s3:report-updates/')
        ->and($upload['secure_url'])->not->toBeEmpty()
        ->and(Storage::disk('s3')->exists($path))->toBeTrue()
        ->and($service->delete($upload['public_id']))->toBeTrue()
        ->and(Storage::disk('s3')->exists($path))->toBeFalse();
});

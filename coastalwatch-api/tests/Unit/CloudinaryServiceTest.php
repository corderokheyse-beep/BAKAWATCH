<?php

use App\Services\CloudinaryService;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

test('uploads fail clearly outside local environments when Cloudinary is not configured', function () {
    $this->app->instance('env', 'production');
    config([
        'cloudinary.cloud_name' => '',
        'cloudinary.api_key' => '',
        'cloudinary.api_secret' => '',
    ]);

    expect(fn () => app(CloudinaryService::class)->upload(
        UploadedFile::fake()->image('report.jpg')
    ))->toThrow(
        ServiceUnavailableHttpException::class,
        'Durable image storage is not configured.'
    );
});

<?php

use App\Models\Report;
use App\Models\ReportUpdate;
use Illuminate\Support\Facades\URL;

beforeEach(function () {
    URL::forceRootUrl('https://api.example.test');
    URL::forceScheme('https');
});

afterEach(function () {
    URL::forceRootUrl(null);
    URL::forceScheme(null);
});

test('report image URLs for local uploads use the current API host', function () {
    $report = new Report();
    $report->setRawAttributes([
        'image_url' => 'http://localhost:8000/api/uploads/reports/photo.jpg',
        'image_public_id' => 'local:reports/photo.jpg',
        'photos' => json_encode([
            ['url' => 'http://localhost:8000/api/uploads/reports/photo.jpg', 'public_id' => 'local:reports/photo.jpg'],
        ]),
    ]);

    expect($report->image_url)->toBe('https://api.example.test/api/uploads/reports/photo.jpg')
        ->and($report->photos[0]['url'])->toBe('https://api.example.test/api/uploads/reports/photo.jpg');
});

test('report update image URLs for local uploads use the current API host', function () {
    $update = new ReportUpdate();
    $update->setRawAttributes([
        'image_url' => 'http://localhost:8000/api/uploads/report-updates/photo.jpg',
        'image_public_id' => 'local:report-updates/photo.jpg',
    ]);

    expect($update->image_url)->toBe('https://api.example.test/api/uploads/report-updates/photo.jpg');
});

test('remote image URLs are unchanged', function () {
    $report = new Report();
    $report->setRawAttributes([
        'image_url' => 'https://res.cloudinary.com/example/image/upload/photo.jpg',
        'image_public_id' => 'reports/photo',
    ]);

    expect($report->image_url)->toBe('https://res.cloudinary.com/example/image/upload/photo.jpg');
});

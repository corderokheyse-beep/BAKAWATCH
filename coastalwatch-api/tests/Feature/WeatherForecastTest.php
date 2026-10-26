<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    Cache::flush();
});

test('field workers and volunteers can read the cached Gloria weather forecast', function () {
    config([
        'services.weather.latitude' => 12.983294,
        'services.weather.longitude' => 121.4666648,
    ]);

    $forecastStart = now('Asia/Manila')->startOfHour();
    $hourlyTimes = collect(range(0, 7))
        ->map(fn ($offset) => $forecastStart->copy()->addHours($offset)->format('Y-m-d\TH:00'))
        ->all();

    Http::fake([
        'api.open-meteo.com/v1/forecast*' => Http::response([
            'timezone' => 'Asia/Manila',
            'current' => [
                'time' => $forecastStart->format('Y-m-d\TH:00'),
                'temperature_2m' => 29.4,
                'relative_humidity_2m' => 78,
                'apparent_temperature' => 34.1,
                'is_day' => 1,
                'precipitation' => 0.1,
                'weather_code' => 61,
                'wind_speed_10m' => 12.5,
                'wind_direction_10m' => 135,
            ],
            'hourly' => [
                'time' => $hourlyTimes,
                'temperature_2m' => [29, 29, 30, 30, 31, 31, 30, 29],
                'precipitation_probability' => [20, 40, 50, 60, 30, 10, 5, 0],
                'precipitation' => [0, 0.1, 0.3, 0.5, 0, 0, 0, 0],
                'weather_code' => [2, 61, 61, 63, 3, 1, 0, 0],
            ],
            'daily' => [
                'time' => [now('Asia/Manila')->toDateString()],
                'weather_code' => [61],
                'temperature_2m_max' => [31.2],
                'temperature_2m_min' => [25.8],
                'precipitation_probability_max' => [60],
            ],
        ]),
    ]);

    foreach (['field_worker', 'volunteer'] as $role) {
        $this->actingAs(User::factory()->create(['role' => $role]))
            ->getJson('/api/weather')
            ->assertOk()
            ->assertJsonPath('location', 'Gloria, Oriental Mindoro')
            ->assertJsonPath('timezone', 'Asia/Manila')
            ->assertJsonPath('current.temperature_2m', 29.4)
            ->assertJsonPath('hourly.0.precipitation_probability', 20)
            ->assertJsonPath('daily.0.temperature_max', 31.2);
    }

    Http::assertSentCount(1);
    Http::assertSent(function ($request) {
        $query = [];
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

        return parse_url($request->url(), PHP_URL_SCHEME) === 'https'
            && parse_url($request->url(), PHP_URL_HOST) === 'api.open-meteo.com'
            && parse_url($request->url(), PHP_URL_PATH) === '/v1/forecast'
            && (float) ($query['latitude'] ?? 0) === 12.983294
            && (float) ($query['longitude'] ?? 0) === 121.4666648
            && ! array_key_exists('apikey', $query);
    });
});

test('weather forecast reports a provider error instead of returning fake data', function () {
    Http::fake([
        'api.open-meteo.com/v1/forecast*' => Http::response(['reason' => 'Service unavailable'], 503),
    ]);

    $this->actingAs(User::factory()->create(['role' => 'volunteer']))
        ->getJson('/api/weather')
        ->assertStatus(502)
        ->assertJsonPath('message', 'Weather forecast is temporarily unavailable.');

    Http::assertSentCount(1);
});

test('weather forecast access requires a field worker or volunteer account', function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']))
        ->getJson('/api/weather')
        ->assertForbidden();

    Http::assertNothingSent();
});

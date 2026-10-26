<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class WeatherForecastService
{
    public function forecast(): array
    {
        $latitude = (float) config('services.weather.latitude');
        $longitude = (float) config('services.weather.longitude');
        $cacheKey = sprintf('weather_forecast_%0.4f_%0.4f', $latitude, $longitude);

        return Cache::remember($cacheKey, now()->addMinutes(30), function () use ($latitude, $longitude) {
            $response = Http::acceptJson()
                ->timeout(12)
                ->get('https://api.open-meteo.com/v1/forecast', [
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'current' => implode(',', [
                        'temperature_2m',
                        'relative_humidity_2m',
                        'apparent_temperature',
                        'is_day',
                        'precipitation',
                        'weather_code',
                        'wind_speed_10m',
                        'wind_direction_10m',
                    ]),
                    'hourly' => implode(',', [
                        'temperature_2m',
                        'precipitation_probability',
                        'precipitation',
                        'weather_code',
                    ]),
                    'daily' => implode(',', [
                        'weather_code',
                        'temperature_2m_max',
                        'temperature_2m_min',
                        'precipitation_probability_max',
                    ]),
                    'forecast_days' => 5,
                    'timezone' => 'Asia/Manila',
                ]);

            if ($response->failed()) {
                throw new RuntimeException('Open-Meteo returned HTTP '.$response->status().'.');
            }

            $data = $response->json();
            if (
                ! is_array($data)
                || ! is_array($data['current'] ?? null)
                || ! is_array($data['hourly'] ?? null)
                || ! is_array($data['daily'] ?? null)
            ) {
                $error = is_array($data) ? ($data['reason'] ?? 'Invalid response') : 'Invalid response';
                throw new RuntimeException('Open-Meteo forecast failed: '.$error);
            }

            return [
                'location' => 'Gloria, Oriental Mindoro',
                'latitude' => $data['latitude'] ?? $latitude,
                'longitude' => $data['longitude'] ?? $longitude,
                'timezone' => $data['timezone'] ?? 'Asia/Manila',
                'fetched_at' => now()->toIso8601String(),
                'current' => $data['current'],
                'hourly' => $this->hourlyForecast($data['hourly']),
                'daily' => $this->dailyForecast($data['daily']),
            ];
        });
    }

    private function hourlyForecast(array $hourly): array
    {
        $forecast = [];
        $times = $hourly['time'] ?? [];
        $start = now('Asia/Manila')->startOfHour()->format('Y-m-d\TH:00');

        foreach ($times as $index => $time) {
            if (! is_string($time) || $time < $start) {
                continue;
            }

            $forecast[] = [
                'time' => $time,
                'temperature' => $hourly['temperature_2m'][$index] ?? null,
                'precipitation_probability' => $hourly['precipitation_probability'][$index] ?? null,
                'precipitation' => $hourly['precipitation'][$index] ?? null,
                'weather_code' => $hourly['weather_code'][$index] ?? null,
            ];

            if (count($forecast) === 6) {
                break;
            }
        }

        if ($forecast === []) {
            throw new RuntimeException('Open-Meteo returned no hourly forecast.');
        }

        return $forecast;
    }

    private function dailyForecast(array $daily): array
    {
        $forecast = [];
        $times = $daily['time'] ?? [];

        foreach ($times as $index => $date) {
            if (! is_string($date)) {
                continue;
            }

            $forecast[] = [
                'date' => $date,
                'weather_code' => $daily['weather_code'][$index] ?? null,
                'temperature_max' => $daily['temperature_2m_max'][$index] ?? null,
                'temperature_min' => $daily['temperature_2m_min'][$index] ?? null,
                'precipitation_probability_max' => $daily['precipitation_probability_max'][$index] ?? null,
            ];
        }

        if ($forecast === []) {
            throw new RuntimeException('Open-Meteo returned no daily forecast.');
        }

        return $forecast;
    }
}

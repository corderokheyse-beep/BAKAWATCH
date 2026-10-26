<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WeatherForecastService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class WeatherForecastController extends Controller
{
    public function __invoke(WeatherForecastService $weather): JsonResponse
    {
        try {
            return response()->json($weather->forecast());
        } catch (ConnectionException $exception) {
            Log::warning('Unable to connect to Open-Meteo.', ['reason' => $exception->getMessage()]);

            return response()->json([
                'message' => 'Weather forecast is temporarily unavailable.',
            ], 502);
        } catch (RuntimeException $exception) {
            Log::warning('Weather forecast unavailable.', ['reason' => $exception->getMessage()]);

            return response()->json([
                'message' => 'Weather forecast is temporarily unavailable.',
            ], 502);
        }
    }
}

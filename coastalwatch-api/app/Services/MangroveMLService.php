<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MangroveMLService
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.ml.url', 'http://127.0.0.1:8001'), '/');
    }

    /**
     * Send an image to the ML service and return the analysis result.
     *
     * Returns an array with keys:
     *   - condition   (string)  e.g. "Healthy", "Stressed", "Diseased", "Dead"
     *   - species     (string)  e.g. "Rhizophora apiculata"
     *   - confidence  (float)   0–100
     *
     * Returns null if the service is unavailable or the image cannot be analysed.
     */
    public function analyze(UploadedFile $image): ?array
    {
        try {
            $response = Http::timeout(15)
                ->attach('file', file_get_contents($image->getRealPath()), $image->getClientOriginalName())
                ->post("{$this->baseUrl}/predict");

            if ($response->successful()) {
                // Return the full ML response — includes species, local_name, family,
                // description, confidence, condition, and all_predictions
                return $response->json();
            }

            Log::warning('MangroveMLService: non-200 response', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
        } catch (\Exception $e) {
            Log::warning('MangroveMLService: request failed — ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Check whether the ML service is reachable.
     */
    public function isAvailable(): bool
    {
        try {
            return Http::timeout(3)->get("{$this->baseUrl}/")->successful();
        } catch (\Exception) {
            return false;
        }
    }
}

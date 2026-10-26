<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

class CloudinaryService
{
    private string $cloudName;
    private string $apiKey;
    private string $apiSecret;
    private string $baseUrl;

    public function __construct()
    {
        $this->cloudName = config('cloudinary.cloud_name');
        $this->apiKey    = config('cloudinary.api_key');
        $this->apiSecret = config('cloudinary.api_secret');
        $this->baseUrl   = "https://api.cloudinary.com/v1_1/{$this->cloudName}";
    }

    public function upload(UploadedFile $file, string $folder = 'coastalwatch'): array
    {
        // When Cloudinary credentials are not configured, fall back to storing
        // the image on the local public disk for local development and tests.
        if (! $this->isConfigured()) {
            if (! app()->environment('local', 'testing')) {
                throw new \Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException(
                    null,
                    'Durable image storage is not configured. Set the Cloudinary credentials before accepting uploads.'
                );
            }

            return $this->storeLocally($file, $folder);
        }

        $timestamp = time();
        $params    = [
            'folder'    => $folder,
            'timestamp' => $timestamp,
        ];

        $signature = $this->generateSignature($params);

        $response = Http::attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName())
            ->post("{$this->baseUrl}/image/upload", array_merge($params, [
                'api_key'   => $this->apiKey,
                'signature' => $signature,
            ]));

        if ($response->failed()) {
            throw new \RuntimeException('Cloudinary upload failed: ' . $response->body());
        }

        return $response->json();
    }

    public function delete(string $publicId): bool
    {
        // Local-storage public IDs are prefixed so we know to delete a file.
        if (str_starts_with($publicId, 'local:')) {
            $path = substr($publicId, strlen('local:'));
            return \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
        }

        if (! $this->isConfigured()) {
            return true;
        }

        $timestamp = time();
        $params    = ['public_id' => $publicId, 'timestamp' => $timestamp];
        $signature = $this->generateSignature($params);

        $response = Http::post("{$this->baseUrl}/image/destroy", array_merge($params, [
            'api_key'   => $this->apiKey,
            'signature' => $signature,
        ]));

        return $response->json('result') === 'ok';
    }

    /** Whether real Cloudinary credentials are configured. */
    private function isConfigured(): bool
    {
        return ! (
            empty($this->cloudName) || $this->cloudName === 'your_cloud_name' ||
            empty($this->apiKey)    || $this->apiKey    === 'your_api_key' ||
            empty($this->apiSecret) || $this->apiSecret === 'your_api_secret'
        );
    }

    /**
     * Store the upload on the local `public` disk and return a Cloudinary-shaped
     * result so callers don't need to change. The public_id is prefixed with
     * "local:" so delete() can remove the file later.
     */
    private function storeLocally(UploadedFile $file, string $folder): array
    {
        $path = $file->store($folder, 'public'); // e.g. "plantation-records/abc.jpg"

        // Serve via a Laravel route (not the /storage symlink) so it works on
        // every host without symlink permissions (Windows dev included).
        $url = url('/api/uploads/' . ltrim($path, '/'));

        return [
            'secure_url' => $url,
            'public_id'  => 'local:' . $path,
        ];
    }

    private function generateSignature(array $params): string
    {
        ksort($params);
        $paramString = collect($params)->map(fn($v, $k) => "{$k}={$v}")->implode('&');
        return sha1($paramString . $this->apiSecret);
    }
}

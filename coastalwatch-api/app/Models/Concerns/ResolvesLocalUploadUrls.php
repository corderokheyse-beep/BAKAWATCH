<?php

namespace App\Models\Concerns;

trait ResolvesLocalUploadUrls
{
    public function getImageUrlAttribute(?string $value): ?string
    {
        return $this->resolveLocalUploadUrl($value, $this->attributes['image_public_id'] ?? null);
    }

    public function getPhotosAttribute($value): ?array
    {
        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        if (! is_array($value)) {
            return null;
        }

        return array_map(function ($photo) {
            if (! is_array($photo)) {
                return $photo;
            }

            $photo['url'] = $this->resolveLocalUploadUrl(
                $photo['url'] ?? null,
                $photo['public_id'] ?? null,
            );

            return $photo;
        }, $value);
    }

    private function resolveLocalUploadUrl(?string $url, ?string $publicId): ?string
    {
        $path = null;
        if ($publicId && str_starts_with($publicId, 'local:')) {
            $path = substr($publicId, strlen('local:'));
        } elseif ($url) {
            $urlPath = parse_url($url, PHP_URL_PATH);
            $uploadPrefix = '/api/uploads/';
            if (is_string($urlPath) && str_starts_with($urlPath, $uploadPrefix)) {
                $path = substr($urlPath, strlen($uploadPrefix));
            }
        }

        if ($path === null) {
            return $url;
        }

        if ($path === '' || str_contains($path, '..') || str_starts_with($path, '/')) {
            return $url;
        }

        return url('/api/uploads/' . $path);
    }
}

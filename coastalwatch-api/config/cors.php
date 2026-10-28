<?php

/**
 * CORS configuration for BAKAWATCH API.
 *
 * Allowed origins are explicitly listed — no wildcard (*) in production.
 * Add your production domain to CORS_ALLOWED_ORIGINS in .env.
 * Example:  CORS_ALLOWED_ORIGINS=https://bakawatch.menrogloria.gov.ph
 */
$normalizeOrigin = static fn (string $origin): string => rtrim(trim($origin), '/');

$allowedOrigins = array_filter(
    array_map($normalizeOrigin, explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')))
);

$frontendUrl = $normalizeOrigin((string) env('FRONTEND_URL', ''));

// Keep local frontend development and deployed Vercel frontends working even
// when CORS_ALLOWED_ORIGINS on the host is unset or has a trailing slash.
$allowedOrigins = array_values(array_unique(array_filter(array_merge(
    $allowedOrigins,
    [
        $frontendUrl,
        'https://bakawatch-beta.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]
))));

return [
    'paths'                    => ['api/*'],
    'allowed_methods'          => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins'          => $allowedOrigins,
    'allowed_origins_patterns' => [
        '#^https://bakawatch(-[a-z0-9-]+)?\.vercel\.app$#i',
    ],
    'allowed_headers'          => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
    'exposed_headers'          => ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    'max_age'                  => 86400,
    'supports_credentials'     => false,
];

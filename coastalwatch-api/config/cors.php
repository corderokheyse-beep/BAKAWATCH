<?php

/**
 * CORS configuration for BAKAWATCH API.
 *
 * Allowed origins are explicitly listed — no wildcard (*) in production.
 * Add your production domain to CORS_ALLOWED_ORIGINS in .env.
 * Example:  CORS_ALLOWED_ORIGINS=https://bakawatch.menrogloria.gov.ph
 */
$allowedOrigins = array_filter(
    array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')))
);

return [
    'paths'                    => ['api/*'],
    'allowed_methods'          => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins'          => $allowedOrigins,
    'allowed_origins_patterns' => [],
    'allowed_headers'          => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
    'exposed_headers'          => ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    'max_age'                  => 86400,
    'supports_credentials'     => false,
];

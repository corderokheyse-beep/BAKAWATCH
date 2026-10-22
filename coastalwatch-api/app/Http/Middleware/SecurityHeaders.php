<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adds HTTP security headers to every response.
 *
 * - X-Content-Type-Options: stops MIME-sniffing attacks
 * - X-Frame-Options: prevents clickjacking
 * - X-XSS-Protection: legacy XSS filter hint for older browsers
 * - Referrer-Policy: controls referrer info leakage
 * - Permissions-Policy: disables unused browser features
 * - Strict-Transport-Security: forces HTTPS (only in production)
 * - Content-Security-Policy: restricts resource origins
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');

        // Only add HSTS in production to avoid breaking local HTTP dev
        if (app()->isProduction()) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains; preload'
            );
        }

        // Content-Security-Policy — allow self + Cloudinary images + Google Fonts
        $csp = implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js needs unsafe-eval in dev
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
            "connect-src 'self' https://api.inaturalist.org",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]);
        $response->headers->set('Content-Security-Policy', $csp);

        return $response;
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Strips leading/trailing whitespace from all string inputs
 * and removes null bytes that could be used for injection.
 *
 * Does NOT HTML-encode — that is the responsibility of output
 * contexts (Blade's {{ }}, React's JSX, etc.).
 */
class SanitizeInput
{
    /** Fields that should never be stripped (passwords, tokens) */
    private array $except = ['password', 'password_confirmation', 'current_password', 'token', 'fcm_token'];

    public function handle(Request $request, Closure $next): Response
    {
        $this->clean($request);
        return $next($request);
    }

    private function clean(Request $request): void
    {
        $input = $request->all();
        $request->merge($this->sanitize($input));
    }

    private function sanitize(array $data): array
    {
        foreach ($data as $key => $value) {
            if (in_array($key, $this->except, true)) {
                continue;
            }
            if (is_array($value)) {
                $data[$key] = $this->sanitize($value);
            } elseif (is_string($value)) {
                // Remove null bytes and trim whitespace
                $data[$key] = trim(str_replace("\0", '', $value));
            }
        }
        return $data;
    }
}

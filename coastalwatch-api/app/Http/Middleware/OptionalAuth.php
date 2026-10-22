<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Optional authentication.
 *
 * Resolves the authenticated user from a Sanctum bearer token WHEN one is
 * present, but never rejects anonymous requests. This lets a route stay public
 * (visible to guests) while still returning role-scoped / owner-scoped data to
 * a logged-in user — e.g. the Field Reports list, which shows approved reports
 * to guests and additionally the caller's own reports when authenticated.
 */
class OptionalAuth
{
    public function handle(Request $request, Closure $next)
    {
        $bearer = $request->bearerToken();

        if ($bearer) {
            $accessToken = PersonalAccessToken::findToken($bearer);
            if ($accessToken && $accessToken->tokenable) {
                // Bind the resolved user to the default guard so auth()->user()
                // / auth()->check() work inside controllers on this request.
                Auth::setUser($accessToken->tokenable);
                $request->setUserResolver(fn () => $accessToken->tokenable);
            }
        }

        return $next($request);
    }
}

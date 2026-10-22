<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Verifies Firebase Authentication ID tokens WITHOUT any third-party SDK.
 *
 * A Firebase ID token is a signed JWT (RS256). We verify it the same way the
 * official SDKs do:
 *   1. Decode header + payload.
 *   2. Fetch Google's public x509 certs (cached per their max-age header).
 *   3. Verify the RS256 signature against the cert named by the token's `kid`.
 *   4. Validate the standard claims: aud = project id, iss, exp, iat, sub.
 *
 * This avoids adding a Composer dependency (the project's audit policy blocks
 * installing new packages) while remaining cryptographically sound.
 */
class FirebaseTokenVerifier
{
    private const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

    public function __construct(private readonly string $projectId)
    {
    }

    public static function fromConfig(): self
    {
        $projectId = (string) config('services.firebase.project_id', env('FIREBASE_PROJECT_ID', ''));
        if ($projectId === '') {
            throw new RuntimeException('FIREBASE_PROJECT_ID is not configured.');
        }
        return new self($projectId);
    }

    /**
     * Verify an ID token and return its decoded claims.
     *
     * @throws RuntimeException when the token is malformed, expired, or invalid.
     * @return array<string,mixed> the verified payload claims
     */
    public function verify(string $idToken): array
    {
        $segments = explode('.', $idToken);
        if (count($segments) !== 3) {
            throw new RuntimeException('Malformed ID token.');
        }
        [$encHeader, $encPayload, $encSignature] = $segments;

        $header  = $this->decodeSegment($encHeader);
        $payload = $this->decodeSegment($encPayload);
        $signature = $this->base64UrlDecode($encSignature);

        if (($header['alg'] ?? null) !== 'RS256') {
            throw new RuntimeException('Unexpected token algorithm.');
        }
        $kid = $header['kid'] ?? null;
        if (!$kid) {
            throw new RuntimeException('Token is missing a key id.');
        }

        // ── Signature verification ───────────────────────────────────────────
        $certs = $this->googleCerts();
        if (!isset($certs[$kid])) {
            throw new RuntimeException('Token key id does not match any Google signing key.');
        }
        $publicKey = openssl_pkey_get_public($certs[$kid]);
        if ($publicKey === false) {
            throw new RuntimeException('Unable to read Google signing certificate.');
        }
        $signedContent = $encHeader . '.' . $encPayload;
        $ok = openssl_verify($signedContent, $signature, $publicKey, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw new RuntimeException('Token signature verification failed.');
        }

        // ── Claim validation ─────────────────────────────────────────────────
        $now = time();
        $leeway = 60; // seconds, to tolerate minor clock skew

        if (($payload['aud'] ?? null) !== $this->projectId) {
            throw new RuntimeException('Token audience does not match this project.');
        }
        if (($payload['iss'] ?? null) !== "https://securetoken.google.com/{$this->projectId}") {
            throw new RuntimeException('Token issuer is invalid.');
        }
        if (($payload['exp'] ?? 0) < ($now - $leeway)) {
            throw new RuntimeException('Token has expired.');
        }
        if (($payload['iat'] ?? 0) > ($now + $leeway)) {
            throw new RuntimeException('Token used before it was issued.');
        }
        if (empty($payload['sub'])) {
            throw new RuntimeException('Token subject (uid) is missing.');
        }

        return $payload;
    }

    /** Fetch and cache Google's public signing certs (keyed by `kid`). */
    private function googleCerts(): array
    {
        return Cache::remember('firebase_secure_token_certs', now()->addHours(1), function () {
            $response = Http::timeout(10)->get(self::CERT_URL);
            if (!$response->successful()) {
                throw new RuntimeException('Unable to fetch Google signing certificates.');
            }
            return $response->json();
        });
    }

    private function decodeSegment(string $segment): array
    {
        $decoded = json_decode($this->base64UrlDecode($segment), true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Unable to decode token segment.');
        }
        return $decoded;
    }

    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Invalid base64url in token.');
        }
        return $decoded;
    }
}

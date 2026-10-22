<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Minimal Firebase Admin client that talks to Google's REST APIs directly,
 * authenticated with the project's service-account key. No SDK dependency.
 *
 * Capabilities used by the user-migration command:
 *   - OAuth2 access token (signed-JWT → token exchange, cached ~55 min).
 *   - Create a Firebase Auth user (Identity Toolkit accounts:signUp... via the
 *     Admin "accounts" endpoint).
 *   - Look up a user by email.
 *   - Generate a password-reset link (so migrated users can set a password).
 */
class FirebaseAdminClient
{
    private array $credentials;
    private string $projectId;

    public function __construct()
    {
        $path = (string) config('services.firebase.credentials', env('FIREBASE_CREDENTIALS', ''));
        if ($path === '' || !is_file($path)) {
            throw new RuntimeException('FIREBASE_CREDENTIALS is not set or the file does not exist.');
        }
        $json = json_decode((string) file_get_contents($path), true);
        if (!is_array($json) || empty($json['client_email']) || empty($json['private_key'])) {
            throw new RuntimeException('The Firebase service-account JSON is invalid.');
        }
        $this->credentials = $json;
        $this->projectId   = (string) ($json['project_id'] ?? config('services.firebase.project_id'));
    }

    /** OAuth2 access token for the Identity Toolkit scope (cached). */
    private function accessToken(): string
    {
        return Cache::remember('firebase_admin_access_token', now()->addMinutes(50), function () {
            $now = time();
            $claims = [
                'iss'   => $this->credentials['client_email'],
                'scope' => 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
                'aud'   => 'https://oauth2.googleapis.com/token',
                'iat'   => $now,
                'exp'   => $now + 3600,
            ];

            $header = $this->b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
            $payload = $this->b64(json_encode($claims));
            $signingInput = "{$header}.{$payload}";

            $signature = '';
            $ok = openssl_sign($signingInput, $signature, $this->credentials['private_key'], OPENSSL_ALGO_SHA256);
            if (!$ok) {
                throw new RuntimeException('Failed to sign the service-account assertion.');
            }
            $assertion = "{$signingInput}." . $this->b64($signature);

            $resp = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $assertion,
            ]);
            if (!$resp->successful() || !$resp->json('access_token')) {
                throw new RuntimeException('Failed to obtain a Google access token: ' . $resp->body());
            }
            return (string) $resp->json('access_token');
        });
    }

    private function authed()
    {
        return Http::withToken($this->accessToken())->acceptJson();
    }

    /** Find a Firebase user by email; returns the account array or null. */
    public function findByEmail(string $email): ?array
    {
        $resp = $this->authed()->post(
            "https://identitytoolkit.googleapis.com/v1/projects/{$this->projectId}/accounts:query",
            ['expression' => [['email' => [$email]]]]
        );
        // The query endpoint returns userInfo[] when matches exist.
        if ($resp->successful() && !empty($resp->json('userInfo'))) {
            return $resp->json('userInfo')[0];
        }
        // Fallback: lookup endpoint (older projects).
        $resp2 = $this->authed()->post(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
            ['email' => [$email]]
        );
        if ($resp2->successful() && !empty($resp2->json('users'))) {
            return $resp2->json('users')[0];
        }
        return null;
    }

    /**
     * Create a Firebase user. Returns the local UID string.
     * Throws on failure (caller decides how to report).
     */
    public function createUser(string $email, string $password, string $displayName, bool $emailVerified): string
    {
        $resp = $this->authed()->post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
            [
                'email'         => $email,
                'password'      => $password,
                'displayName'   => $displayName,
                'emailVerified' => $emailVerified,
            ]
        );
        if (!$resp->successful() || !$resp->json('localId')) {
            throw new RuntimeException($resp->json('error.message') ?? 'Unknown error creating user.');
        }
        return (string) $resp->json('localId');
    }

    /** Set (overwrite) a Firebase user's password by local UID. */
    public function setPassword(string $uid, string $password): void
    {
        $resp = $this->authed()->post(
            "https://identitytoolkit.googleapis.com/v1/accounts:update",
            ['localId' => $uid, 'password' => $password]
        );
        if (!$resp->successful()) {
            throw new RuntimeException($resp->json('error.message') ?? 'Failed to set password.');
        }
    }

    /** Generate a password-reset OOB link for a user (Firebase emails it). */
    public function sendPasswordReset(string $email): void
    {
        $resp = $this->authed()->post(
            "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode",
            ['requestType' => 'PASSWORD_RESET', 'email' => $email]
        );
        if (!$resp->successful()) {
            throw new RuntimeException($resp->json('error.message') ?? 'Failed to send reset email.');
        }
    }

    private function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

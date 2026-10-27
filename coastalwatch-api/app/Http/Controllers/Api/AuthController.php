<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\LoginAttempt;
use App\Models\User;
use App\Services\FirebaseTokenVerifier;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    /** Max failed login attempts before lockout */
    private const MAX_ATTEMPTS   = 10;
    /** Lockout window in minutes */
    private const LOCKOUT_MINUTES = 15;

    /**
     * The canonical strong-password rule used everywhere a password is set
     * (register, reset, change). Requires 8+ chars, mixed case, a number, a
     * symbol, and rejects passwords found in known data breaches
     * (HaveIBeenPwned k-anonymity check — no password is ever sent in full).
     */
    private static function passwordRule(): Password
    {
        return Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised();
    }

    // ─── Register ──────────────────────────────────────────────────────────────

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'email'        => 'required|string|email|max:255|unique:users',
            'password'     => ['required', 'confirmed', self::passwordRule()],
            'phone'        => 'nullable|string|max:20',
            'organization' => 'nullable|string|max:255',
        ]);

        $user = User::create([
            'name'              => $validated['name'],
            'email'             => $validated['email'],
            'password'          => Hash::make($validated['password']),
            'phone'             => $validated['phone'] ?? null,
            'organization'      => $validated['organization'] ?? null,
            'role'              => 'user',
            'is_active'         => true,
            'email_verified_at' => now(),
        ]);

        $token = $user->createToken('auth_token', ['*'], now()->addDays(7))->plainTextToken;
        ActivityLog::record('user.registered', $user);

        return response()->json([
            'message' => 'Registration successful.',
            'user'    => $user,
            'token'   => $token,
        ], 201);
    }

    // ─── Login ─────────────────────────────────────────────────────────────────

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|email|max:255',
            'password' => 'required|string|max:128',
        ]);

        $email = strtolower(trim($request->email));
        $ip    = $request->ip();

        // ── Lockout check ──────────────────────────────────────────────────────
        $failures = LoginAttempt::recentFailures($email, self::LOCKOUT_MINUTES);
        if ($failures >= self::MAX_ATTEMPTS) {
            return response()->json([
                'message' => 'Too many failed login attempts. Please wait ' . self::LOCKOUT_MINUTES . ' minutes before trying again.',
                'locked_out' => true,
            ], 429);
        }

        // ── Credential check ───────────────────────────────────────────────────
        $user = User::where('email', $email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            LoginAttempt::record($email, $ip, false);
            $remaining = max(0, self::MAX_ATTEMPTS - $failures - 1);
            return response()->json([
                'message'            => 'Invalid email or password.',
                'attempts_remaining' => $remaining,
            ], 401);
        }

        if (! $user->is_active) {
            LoginAttempt::record($email, $ip, false);
            return response()->json([
                'message' => 'Your account has been deactivated. Please contact your administrator.',
            ], 403);
        }

        // ── Success ────────────────────────────────────────────────────────────
        LoginAttempt::record($email, $ip, true);

        // Revoke old tokens and issue a fresh expiring token
        $user->tokens()->delete();
        $token = $user->createToken('auth_token', ['*'], now()->addDays(7))->plainTextToken;

        ActivityLog::record('user.login', $user);

        return response()->json([
            'message' => 'Login successful.',
            'user'    => $user,
            'token'   => $token,
        ]);
    }

    // ─── Firebase Authentication (hybrid) ────────────────────────────────────────

    /**
     * Exchange a verified Firebase ID token for a Sanctum session.
     *
     * Firebase owns authentication (identity + password + resets). This endpoint
     * verifies the ID token server-side, then finds-or-links the local account
     * and issues the app's own Sanctum token so authorization (roles, is_active,
     * audit logging) continues to work exactly as before.
     *
     * Behaviour:
     *   - Links an existing account (matched by firebase_uid, then by email).
     *   - Provisions a new account on first login when `name` is supplied
     *     (self-service sign-up through Firebase). New users get the base role.
     *   - Enforces the is_active gate and revokes stale tokens, like /auth/login.
     */
    public function firebaseAuth(Request $request): JsonResponse
    {
        $request->validate([
            'id_token'     => 'required|string',
            'name'         => 'sometimes|string|max:255', // used only when provisioning
            'phone'        => 'nullable|string|max:20',
            'organization' => 'nullable|string|max:255',
        ]);

        try {
            $claims = FirebaseTokenVerifier::fromConfig()->verify($request->id_token);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Invalid or expired sign-in token.'], 401);
        }

        $uid   = $claims['sub'];
        $email = isset($claims['email']) ? strtolower(trim($claims['email'])) : null;

        if (!$email) {
            return response()->json(['message' => 'This sign-in method did not provide an email address.'], 422);
        }

        // Match by Firebase UID first, then fall back to email (first-time link
        // for a legacy account created before Firebase was enabled).
        $user = User::withTrashed()->where('firebase_uid', $uid)->first()
            ?? User::withTrashed()->where('email', $email)->first();

        if ($user && $user->trashed()) {
            return response()->json([
                'message' => 'Your account has been deactivated. Please contact your administrator.',
            ], 403);
        }

        if (!$user) {
            // Provision a new local account for a brand-new Firebase user.
            $user = User::create([
                'name'              => $request->input('name', $claims['name'] ?? strtok($email, '@')),
                'email'             => $email,
                'firebase_uid'      => $uid,
                // Local password is unused for Firebase accounts; store a random
                // unusable value so the column constraint is satisfied.
                'password'          => Hash::make(Str::random(40)),
                'phone'             => $request->input('phone') ?: null,
                'organization'      => $request->input('organization') ?: null,
                'role'              => 'user',
                'is_active'         => true,
                'email_verified_at' => ($claims['email_verified'] ?? false) ? now() : null,
            ]);
            ActivityLog::record('user.registered', $user);
        } else {
            // Link the Firebase identity to the existing account on first use,
            // and fill optional profile fields if supplied during registration.
            $updates = [];
            if ($user->firebase_uid !== $uid) {
                $updates['firebase_uid'] = $uid;
            }
            if ($request->filled('phone') && empty($user->phone)) {
                $updates['phone'] = $request->input('phone');
            }
            if ($request->filled('organization') && empty($user->organization)) {
                $updates['organization'] = $request->input('organization');
            }
            if (!empty($updates)) {
                $user->forceFill($updates)->save();
            }
        }

        if (!$user->is_active) {
            return response()->json([
                'message' => 'Your account has been deactivated. Please contact your administrator.',
            ], 403);
        }

        // Issue a fresh Sanctum token (revoking old ones), mirroring /auth/login.
        $user->tokens()->delete();
        $token = $user->createToken('auth_token', ['*'], now()->addDays(7))->plainTextToken;

        ActivityLog::record('user.login', $user);

        return response()->json([
            'message' => 'Login successful.',
            'user'    => $user,
            'token'   => $token,
        ]);
    }

    // ─── Logout ────────────────────────────────────────────────────────────────

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        ActivityLog::record('user.logout');

        return response()->json(['message' => 'Logged out successfully.']);
    }

    // ─── Me ────────────────────────────────────────────────────────────────────

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    // ─── Update Profile ────────────────────────────────────────────────────────

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name'             => 'sometimes|string|max:255',
            'phone'            => 'nullable|string|max:20',
            'organization'     => 'nullable|string|max:255',
            'current_password' => 'required_with:password|string',
            'password'         => ['nullable', 'confirmed', self::passwordRule()],
        ]);

        // Verify current password before allowing password change
        if (isset($validated['password'])) {
            if (! Hash::check($validated['current_password'] ?? '', $user->password)) {
                return response()->json(['message' => 'Current password is incorrect.'], 422);
            }
            $validated['password'] = Hash::make($validated['password']);
            // Changing the password invalidates all existing sessions/tokens so
            // a leaked old token can't outlive the password change. The current
            // request's token is also revoked, forcing a fresh login.
            $user->tokens()->delete();
        } else {
            unset($validated['password']);
        }

        unset($validated['current_password']);
        $user->update($validated);
        ActivityLog::record('user.profile_updated', $user);

        return response()->json(['message' => 'Profile updated.', 'user' => $user]);
    }

    // ─── Forgot Password ─────────────────────────────────────────────────────────

    /**
     * Begin a password reset: email the user a reset link if the account exists.
     *
     * Responds with the SAME generic message whether or not the email is on file,
     * so an attacker can't use this endpoint to discover which emails have
     * accounts (prevents account enumeration). The reset link points at the
     * frontend reset page (FRONTEND_URL/reset-password?token=..&email=..).
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email|max:255']);

        $status = PasswordBroker::sendResetLink(
            ['email' => strtolower(trim($request->email))]
        );

        if ($status === PasswordBroker::RESET_LINK_SENT) {
            ActivityLog::record('user.password_reset_requested');
        }

        // Always 200 with a generic message — never reveal whether the email exists.
        return response()->json([
            'message' => 'If an account exists for that email, a password reset link has been sent.',
        ]);
    }

    // ─── Reset Password ────────────────────────────────────────────────────────

    /**
     * Complete a password reset using the emailed token.
     *
     * On success: sets the new (strong) password, revokes ALL of the user's
     * existing API tokens so any session that may have been compromised is cut
     * off, and logs the event. The reset token is single-use (the broker
     * deletes it) and expires after 60 minutes (config/auth.php).
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token'    => 'required|string',
            'email'    => 'required|email|max:255',
            'password' => ['required', 'confirmed', self::passwordRule()],
        ]);

        $status = PasswordBroker::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password'       => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                // Invalidate every existing token so a leaked session can't
                // survive the reset — the user must log in again everywhere.
                $user->tokens()->delete();

                event(new PasswordReset($user));
                ActivityLog::record('user.password_reset', $user);
            }
        );

        if ($status === PasswordBroker::PASSWORD_RESET) {
            return response()->json(['message' => 'Your password has been reset. You can now sign in.']);
        }

        // Invalid/expired token or unknown email — generic, non-enumerating error.
        return response()->json([
            'message' => 'This password reset link is invalid or has expired. Please request a new one.',
        ], 422);
    }

    // ─── Update FCM Token ──────────────────────────────────────────────────────

    public function updateFcmToken(Request $request): JsonResponse
    {
        $request->validate(['fcm_token' => 'required|string|max:512']);
        $request->user()->update(['fcm_token' => $request->fcm_token]);

        return response()->json(['message' => 'FCM token updated.']);
    }
}

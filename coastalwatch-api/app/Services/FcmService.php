<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Firebase Cloud Messaging (FCM) v1 HTTP API service.
 *
 * Uses the free FCM HTTP v1 API — no billing required.
 * Setup: create a Firebase project at console.firebase.google.com,
 * download the service account JSON, and set FCM_SERVICE_ACCOUNT_JSON
 * (or FCM_SERVER_KEY for legacy API) in .env.
 *
 * For simplicity this uses the legacy FCM HTTP API which only needs
 * the Server Key (free, no OAuth required). Upgrade to v1 API for production.
 */
class FcmService
{
    private string $serverKey;
    private string $fcmUrl = 'https://fcm.googleapis.com/fcm/send';

    public function __construct()
    {
        $this->serverKey = config('services.fcm.server_key', '');
    }

    /**
     * Send a push notification to a single device.
     *
     * @param  string  $token   FCM registration token
     * @param  string  $title   Notification title
     * @param  string  $body    Notification body
     * @param  array   $data    Optional key-value data payload
     */
    public function sendToDevice(string $token, string $title, string $body, array $data = []): bool
    {
        if (empty($this->serverKey)) {
            Log::info('[FCM] Server key not configured — skipping push notification.');
            return false;
        }

        if (empty($token)) {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'Authorization' => "key={$this->serverKey}",
                'Content-Type'  => 'application/json',
            ])->post($this->fcmUrl, [
                'to'           => $token,
                'notification' => [
                    'title' => $title,
                    'body'  => $body,
                    'sound' => 'default',
                ],
                'data'         => $data,
                'priority'     => 'high',
            ]);

            if ($response->successful()) {
                return true;
            }

            Log::warning('[FCM] Send failed: ' . $response->body());
            return false;
        } catch (\Exception $e) {
            Log::error('[FCM] Exception: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Send to multiple tokens (multicast).
     *
     * @param  string[]  $tokens
     */
    public function sendToMultiple(array $tokens, string $title, string $body, array $data = []): bool
    {
        if (empty($this->serverKey) || empty($tokens)) return false;

        try {
            $response = Http::withHeaders([
                'Authorization' => "key={$this->serverKey}",
                'Content-Type'  => 'application/json',
            ])->post($this->fcmUrl, [
                'registration_ids' => array_values($tokens),
                'notification'     => [
                    'title' => $title,
                    'body'  => $body,
                    'sound' => 'default',
                ],
                'data'             => $data,
                'priority'         => 'high',
            ]);

            return $response->successful();
        } catch (\Exception $e) {
            Log::error('[FCM] Multicast exception: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Notify all admins (and optionally a specific user) of a new report.
     */
    public function notifyNewReport(\App\Models\Report $report): void
    {
        $tokens = \App\Models\User::whereIn('role', ['admin', 'staff', 'menro'])
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        if (! empty($tokens)) {
            $this->sendToMultiple(
                $tokens,
                'New Threat Report',
                "📍 {$report->title} — {$report->location_name}",
                ['type' => 'new_report', 'report_id' => (string) $report->id]
            );
        }
    }

    /**
     * Notify a user that their report status changed.
     */
    public function notifyReportStatus(\App\Models\Report $report): void
    {
        $token = $report->user?->fcm_token;
        if (! $token) return;

        $statusLabels = [
            'approved'      => 'Approved ✅',
            'rejected'      => 'Rejected ❌',
            'investigating' => 'Under Investigation 🔍',
            'resolved'      => 'Resolved ✅',
        ];

        $label = $statusLabels[$report->status] ?? ucfirst($report->status);

        $this->sendToDevice(
            $token,
            "Report {$label}",
            "Your report \"{$report->title}\" has been {$report->status}.",
            ['type' => 'report_status', 'report_id' => (string) $report->id, 'status' => $report->status]
        );
    }

    /**
     * Notify registered volunteers about a planting event.
     */
    public function notifyEventUpdate(\App\Models\PlantingEvent $event, string $message): void
    {
        $tokens = \App\Models\User::whereHas('notifications', function ($q) use ($event) {
            // Notify users registered for this event
        })
        ->whereNotNull('fcm_token')
        ->pluck('fcm_token')
        ->toArray();

        // Fallback: notify all field_worker + volunteer
        $tokens = \App\Models\User::whereIn('role', ['field_worker', 'volunteer'])
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        if (! empty($tokens)) {
            $this->sendToMultiple(
                $tokens,
                "Event Update: {$event->name}",
                $message,
                ['type' => 'event_update', 'event_id' => (string) $event->id]
            );
        }
    }
}

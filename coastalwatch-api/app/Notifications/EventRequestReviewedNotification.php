<?php

namespace App\Notifications;

use App\Models\PlantationEventRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Sent to menro/staff/admin when an event request status changes (approved/rejected/pending).
 * Also used to notify the requesting org — but since they may not have an account,
 * this is sent to the reviewing admin's colleagues so they stay in sync.
 */
class EventRequestReviewedNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantationEventRequest $request) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $status  = ucfirst($this->request->status);
        $emoji   = match ($this->request->status) {
            'approved' => '✅',
            'rejected' => '❌',
            default    => '🔄',
        };

        return [
            'type'              => 'event_request_reviewed',
            'request_id'        => $this->request->id,
            'organization_name' => $this->request->organization_name,
            'event_name'        => $this->request->event_name,
            'status'            => $this->request->status,
            'message'           => "{$emoji} Event request from \"{$this->request->organization_name}\" was {$this->request->status}.",
        ];
    }
}

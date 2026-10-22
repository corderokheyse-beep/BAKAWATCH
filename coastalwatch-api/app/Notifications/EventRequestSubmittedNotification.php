<?php

namespace App\Notifications;

use App\Models\PlantationEventRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Sent to menro/staff/admin when a new plantation event request is submitted by the public.
 */
class EventRequestSubmittedNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantationEventRequest $request, private bool $updated = false) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type'              => $this->updated ? 'event_request_updated' : 'event_request_submitted',
            'request_id'        => $this->request->id,
            'organization_name' => $this->request->organization_name,
            'event_name'        => $this->request->event_name,
            'preferred_date'    => $this->request->preferred_date?->toDateString(),
            'message'           => $this->updated
                ? "\"{$this->request->organization_name}\" updated their plantation event request: \"{$this->request->event_name}\"."
                : "\"{$this->request->organization_name}\" submitted a plantation event request: \"{$this->request->event_name}\".",
        ];
    }
}

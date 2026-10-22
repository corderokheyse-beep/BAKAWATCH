<?php

namespace App\Notifications;

use App\Models\PlantationEventRequest;
use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EventRequestCancelledNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantationEventRequest $request, private PlantingEvent $event) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'event_request_cancelled',
            'request_id' => $this->request->id,
            'event_id' => $this->event->id,
            'event_name' => $this->event->name,
            'organization_name' => $this->request->organization_name,
            'message' => "The requesting participant cancelled the event request for \"{$this->event->name}\".",
        ];
    }
}

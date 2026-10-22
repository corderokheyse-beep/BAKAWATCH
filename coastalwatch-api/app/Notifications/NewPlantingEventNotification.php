<?php

namespace App\Notifications;

use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Sent to all volunteers/field_workers when a new planting event is posted.
 */
class NewPlantingEventNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantingEvent $event) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type'       => 'new_event',
            'event_id'   => $this->event->id,
            'event_name' => $this->event->name,
            'scheduled_at' => $this->event->scheduled_at?->toDateTimeString(),
            'location'   => $this->event->location_name,
            'message'    => "New planting event: \"{$this->event->name}\" — register now!",
        ];
    }
}

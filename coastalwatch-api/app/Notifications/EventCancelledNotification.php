<?php

namespace App\Notifications;

use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EventCancelledNotification extends Notification
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
            'type'       => 'event_cancelled',
            'event_id'   => $this->event->id,
            'event_name' => $this->event->name,
            'message'    => "The planting event \"{$this->event->name}\" has been cancelled.",
        ];
    }
}

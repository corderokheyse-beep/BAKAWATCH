<?php

namespace App\Notifications;

use App\Models\EventRegistration;
use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EventRegistrationSubmittedNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantingEvent $event, private EventRegistration $registration) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'event_registration_submitted',
            'event_id' => $this->event->id,
            'registration_id' => $this->registration->id,
            'event_name' => $this->event->name,
            'participant_name' => $this->registration->full_name,
            'message' => "{$this->registration->full_name} registered for {$this->event->name}.",
        ];
    }
}

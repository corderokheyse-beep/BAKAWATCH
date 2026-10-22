<?php

namespace App\Notifications;

use App\Models\EventRegistration;
use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Sent to a user (via database) when they successfully register for a planting event.
 * For community-requested events the status is pending_approval; for standard events it's confirmed.
 */
class EventRegistrationConfirmedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private PlantingEvent     $event,
        private EventRegistration $registration,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $isPending = $this->registration->registration_status === 'pending_approval';

        $emoji   = $isPending ? '⏳' : '✅';
        $message = $isPending
            ? "{$emoji} Your registration for \"{$this->event->name}\" is pending approval. You'll be notified once reviewed."
            : "{$emoji} You are registered for \"{$this->event->name}\" on " .
              $this->event->scheduled_at?->format('M d, Y') . '.';

        return [
            'type'                  => 'event_registration',
            'event_id'              => $this->event->id,
            'event_name'            => $this->event->name,
            'scheduled_at'          => $this->event->scheduled_at?->toDateTimeString(),
            'location'              => $this->event->location_name,
            'registration_status'   => $this->registration->registration_status,
            'message'               => $message,
        ];
    }
}

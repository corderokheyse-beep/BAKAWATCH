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
        $status = $this->registration->registration_status;

        if ($status === 'pending_approval') {
            $emoji   = '⏳';
            $message = "{$emoji} Your request to join \"{$this->event->name}\" is pending MENRO approval. You'll be notified once reviewed.";
        } elseif ($status === 'rejected') {
            $emoji   = '❌';
            $message = "{$emoji} Your registration request for \"{$this->event->name}\" was not approved.";
        } else {
            $emoji   = '✅';
            $message = "{$emoji} Your registration for \"{$this->event->name}\" on " .
                $this->event->scheduled_at?->format('M d, Y') . ' has been confirmed by MENRO!';
        }

        return [
            'type'                  => 'event_registration',
            'event_id'              => $this->event->id,
            'registration_id'       => $this->registration->id,
            'event_name'            => $this->event->name,
            'scheduled_at'          => $this->event->scheduled_at?->toDateTimeString(),
            'location'              => $this->event->location_name,
            'registration_status'   => $status,
            'message'               => $message,
        ];
    }
}

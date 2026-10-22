<?php

namespace App\Notifications;

use App\Models\PlantingEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Sent to all registered participants when an event's details are updated
 * (date, location, capacity, or status changes other than cancellation).
 */
class EventUpdatedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private PlantingEvent $event,
        private array         $changes,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $changeList = [];
        if (isset($this->changes['scheduled_at'])) {
            $changeList[] = 'date/time updated';
        }
        if (isset($this->changes['location_name'])) {
            $changeList[] = 'location updated';
        }
        if (isset($this->changes['max_volunteers'])) {
            $changeList[] = 'capacity updated';
        }
        if (isset($this->changes['name'])) {
            $changeList[] = 'name updated';
        }
        if (isset($this->changes['status']) && $this->changes['status'] !== 'cancelled') {
            $changeList[] = "status changed to {$this->changes['status']}";
        }

        $summary = count($changeList) > 0
            ? implode(', ', $changeList)
            : 'details updated';

        return [
            'type'       => 'event_updated',
            'event_id'   => $this->event->id,
            'event_name' => $this->event->name,
            'scheduled_at' => $this->event->scheduled_at?->toDateTimeString(),
            'location'   => $this->event->location_name,
            'changes'    => $this->changes,
            'message'    => "📝 Event \"{$this->event->name}\" has been updated: {$summary}.",
        ];
    }
}

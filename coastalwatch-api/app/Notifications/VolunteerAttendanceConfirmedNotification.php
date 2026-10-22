<?php

namespace App\Notifications;

use App\Models\PlantingEvent;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class VolunteerAttendanceConfirmedNotification extends Notification
{
    use Queueable;
    public function __construct(private User $worker, private PlantingEvent $event) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'event_attendance_confirmed',
            'title' => 'Volunteer attendance confirmed',
            'message' => $this->worker->name . ' confirmed attendance for ' . $this->event->name,
            'planting_event_id' => $this->event->id,
            'user_id' => $this->worker->id,
            'url' => '/events',
        ];
    }
}

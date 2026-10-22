<?php

namespace App\Notifications;

use App\Models\EventAccomplishmentReport;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EventAccomplishmentSubmittedNotification extends Notification
{
    use Queueable;
    public function __construct(private EventAccomplishmentReport $report) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return ['type' => 'event_accomplishment_report', 'title' => 'Event Accomplishment Report',
            'message' => $this->report->user->name . ' submitted an accomplishment report for ' . $this->report->event->name,
            'event_id' => $this->report->planting_event_id, 'site_id' => $this->report->restoration_site_id,
            'report_id' => $this->report->report_id, 'url' => '/admin/reports'];
    }
}

<?php

namespace App\Notifications;

use App\Models\Report;
use App\Models\ReportUpdate;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class ReportUpdateAddedNotification extends Notification
{
    use Queueable;
    public function __construct(private Report $report, private ReportUpdate $update) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return ['type' => 'report_update', 'title' => 'Report update added',
            'message' => $this->report->user?->name . ' added an update to ' . $this->report->title,
            'report_id' => $this->report->id, 'update_id' => $this->update->id,
            'url' => '/reports/' . $this->report->id];
    }
}

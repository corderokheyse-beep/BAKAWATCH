<?php

namespace App\Notifications;

use App\Models\Report;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class NewThreatReportNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Report $report) {}

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $category = ucfirst($this->report->category);

        return (new MailMessage)
            ->subject("New Threat Report Submitted — BAKAWATCH")
            ->greeting("Hello {$notifiable->name},")
            ->line("A new **{$category}** threat report has been submitted and requires your review.")
            ->line("**Title:** {$this->report->title}")
            ->when($this->report->location_name, fn($m) => $m->line("**Location:** {$this->report->location_name}"))
            ->line("**Submitted by:** {$this->report->user->name}")
            ->action('Review Report', config('app.frontend_url') . "/admin/threat-reports/{$this->report->id}")
            ->line('Please review and update the status at your earliest convenience.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type'        => 'new_threat_report',
            'report_id'   => $this->report->id,
            'title'       => $this->report->title,
            'category'    => $this->report->category,
            'submitted_by'=> $this->report->user->name,
            'message'     => "New {$this->report->category} report: \"{$this->report->title}\" submitted by {$this->report->user->name}.",
        ];
    }
}

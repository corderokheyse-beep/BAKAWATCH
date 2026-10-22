<?php

namespace App\Notifications;

use App\Models\Report;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ReportStatusNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Report $report) {}

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $status = ucfirst($this->report->status);

        $messages = [
            'pending'       => 'is pending MENRO review.',
            'under_review'  => 'is under review by MENRO.',
            'resolved'      => 'has been resolved. Thank you for your contribution!',
        ];

        $line = $messages[$this->report->status] ?? "has been updated to: {$status}.";

        return (new MailMessage)
            ->subject("Report Update: {$status} — BAKAWATCH")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your report \"{$this->report->title}\" {$line}")
            ->when($this->report->admin_notes, fn($m) => $m->line("**Admin notes:** {$this->report->admin_notes}"))
            ->action('View Report', config('app.frontend_url') . "/reports/{$this->report->id}")
            ->line('Thank you for contributing to BAKAWATCH!');
    }

    public function toArray(object $notifiable): array
    {
        $messages = [
            'pending'       => "Your report \"{$this->report->title}\" is pending review.",
            'under_review'  => "Your report \"{$this->report->title}\" is under review.",
            'resolved'      => "Your report \"{$this->report->title}\" has been resolved.",
        ];

        return [
            'type'       => 'report_status',
            'report_id'  => $this->report->id,
            'title'      => $this->report->title,
            'status'     => $this->report->status,
            'message'    => $messages[$this->report->status] ?? "Your report \"{$this->report->title}\" status changed to {$this->report->status}.",
            'admin_notes'=> $this->report->admin_notes,
        ];
    }
}

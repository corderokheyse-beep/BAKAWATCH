<?php

namespace App\Notifications;

use App\Models\PlantationEventRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent via email to the requesting organization's contact when their
 * plantation event request is approved or rejected by the admin.
 */
class EventRequestStatusNotification extends Notification
{
    use Queueable;

    public function __construct(private PlantationEventRequest $request) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $isApproved = $this->request->status === 'approved';
        $orgName    = $this->request->organization_name;
        $eventName  = $this->request->event_name;
        $adminNotes = $this->request->admin_notes;

        $subject = $isApproved
            ? "✅ Your Event Request Has Been Approved – {$eventName}"
            : "❌ Your Event Request Was Not Approved – {$eventName}";

        $mail = (new MailMessage)
            ->subject($subject)
            ->greeting("Hello, {$this->request->contact_person}!")
            ->line("Thank you for submitting your plantation event request on behalf of **{$orgName}**.");

        if ($isApproved) {
            $mail
                ->line("We are pleased to inform you that your request for **\"{$eventName}\"** has been **approved** by the MENRO Admin.")
                ->line("Your event has been listed on the BAKAWATCH Events page and is now open for participant registration.")
                ->line("Please coordinate with the MENRO office for final site assignment and scheduling details.");
        } else {
            $mail
                ->line("We regret to inform you that your request for **\"{$eventName}\"** has been **rejected** by the MENRO Admin.");
        }

        if ($adminNotes) {
            $mail->line("**Admin Notes:** {$adminNotes}");
        }

        if (!$isApproved) {
            $mail->line("You are welcome to submit a new request with a different date or details.");
        }

        return $mail
            ->line("If you have any questions, please contact the MENRO office directly.")
            ->salutation("Best regards,\nBAKAWATCH – MENRO Gloria, Oriental Mindoro");
    }
}

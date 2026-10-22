<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Password reset email. Overrides Laravel's default so the reset link points at
 * the Next.js FRONTEND reset page (this app is an API + SPA; there is no Blade
 * reset route). The link carries the single-use token and the user's email.
 */
class ResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(public string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        // Base URL of the frontend. Falls back to localhost for local dev.
        $frontend = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://127.0.0.1:3000')), '/');

        $url = $frontend . '/reset-password?token=' . $this->token
            . '&email=' . urlencode($notifiable->getEmailForPasswordReset());

        $expires = (int) config('auth.passwords.' . config('auth.defaults.passwords') . '.expire', 60);

        return (new MailMessage)
            ->subject('Reset your BAKAWATCH password')
            ->greeting('Hello ' . ($notifiable->name ?? '') . ',')
            ->line('We received a request to reset the password for your BAKAWATCH account.')
            ->action('Reset Password', $url)
            ->line("This link will expire in {$expires} minutes.")
            ->line('If you did not request a password reset, no action is needed — your password will stay the same.')
            ->salutation('— BAKAWATCH, MENRO Gloria');
    }
}

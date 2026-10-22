<?php

namespace App\Console\Commands;

use App\Models\PlantingEvent;
use App\Models\User;
use App\Services\FcmService;
use Illuminate\Console\Command;

class NotifyUpcomingEvents extends Command
{
    protected $signature   = 'bakawatch:notify-upcoming-events';
    protected $description = 'Send push notifications for planting events scheduled within 7 days';

    public function handle(FcmService $fcm): int
    {
        $events = PlantingEvent::whereIn('status', ['upcoming', 'on-going'])
            ->whereBetween('scheduled_at', [now(), now()->addDays(7)])
            ->with('site:id,name')
            ->get();

        if ($events->isEmpty()) {
            $this->info('No upcoming events in the next 7 days.');
            return self::SUCCESS;
        }

        // Notify field workers and volunteers
        $tokens = User::whereIn('role', ['field_worker', 'volunteer'])
            ->whereNotNull('fcm_token')
            ->pluck('fcm_token')
            ->toArray();

        if (empty($tokens)) {
            $this->info('No registered device tokens — skipping push.');
            return self::SUCCESS;
        }

        foreach ($events as $event) {
            $daysUntil = now()->diffInDays($event->scheduled_at);
            $label     = $daysUntil === 0 ? 'Today' : ($daysUntil === 1 ? 'Tomorrow' : "In {$daysUntil} days");

            $fcm->sendToMultiple(
                $tokens,
                "Upcoming: {$event->name}",
                "{$label} · {$event->location_name} · {$event->remaining_capacity} spots left",
                ['type' => 'event_reminder', 'event_id' => (string) $event->id]
            );

            $this->line("  Notified: {$event->name} ({$label})");
        }

        $this->info("Sent reminders for {$events->count()} event(s) to " . count($tokens) . " device(s).");
        return self::SUCCESS;
    }
}

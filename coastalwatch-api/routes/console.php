<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── BAKAWATCH Scheduled Tasks ────────────────────────────────────────────────

/**
 * Daily: notify MENRO admins about upcoming planting events (7 days ahead).
 * Runs every morning at 7 AM Philippine time (UTC+8 = 23:00 UTC day before).
 */
Schedule::command('bakawatch:notify-upcoming-events')->dailyAt('23:00');

/**
 * Daily: prune login attempt records older than 24 hours to keep DB lean.
 */
Schedule::command('bakawatch:prune-login-attempts')->dailyAt('02:00');

/**
 * Weekly: auto-close planting events that have passed their scheduled date.
 */
Schedule::command('bakawatch:close-past-events')->weeklyOn(0, '01:00');

/**
 * Daily: send daily digest of pending threat reports to admins.
 */
Schedule::command('bakawatch:pending-reports-digest')->dailyAt('08:00');

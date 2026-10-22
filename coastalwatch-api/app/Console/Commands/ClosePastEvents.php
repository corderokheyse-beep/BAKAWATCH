<?php

namespace App\Console\Commands;

use App\Models\PlantingEvent;
use Illuminate\Console\Command;

class ClosePastEvents extends Command
{
    protected $signature   = 'bakawatch:close-past-events';
    protected $description = 'Automatically close planting events whose scheduled date has passed';

    public function handle(): int
    {
        $count = PlantingEvent::whereIn('status', ['upcoming', 'on-going'])
            ->where('scheduled_at', '<', now())
            ->update(['status' => 'completed']);

        $this->info("Auto-closed {$count} past planting event(s).");
        return self::SUCCESS;
    }
}

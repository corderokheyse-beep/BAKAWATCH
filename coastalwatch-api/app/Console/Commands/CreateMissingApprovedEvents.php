<?php

namespace App\Console\Commands;

use App\Models\PlantationEventRequest;
use App\Models\PlantingEvent;
use App\Models\RestorationSite;
use Illuminate\Console\Command;

class CreateMissingApprovedEvents extends Command
{
    protected $signature   = 'events:create-missing-approved';
    protected $description = 'Create PlantingEvents for approved requests that have no linked event yet.';

    public function handle(): int
    {
        $approved = PlantationEventRequest::where('status', 'approved')
            ->whereDoesntHave('plantingEvent')
            ->get();

        if ($approved->isEmpty()) {
            $this->info('No approved requests without events found.');
            return 0;
        }

        $defaultSiteId = RestorationSite::where('status', 'active')->value('id')
                      ?? RestorationSite::value('id');

        if (!$defaultSiteId) {
            $this->error('No restoration sites found. Cannot create events.');
            return 1;
        }

        foreach ($approved as $req) {
            $event = PlantingEvent::create([
                'restoration_site_id' => $defaultSiteId,
                'created_by'          => $req->reviewed_by ?? 1,
                'name'                => $req->event_name,
                'description'         => trim(
                    ($req->description ?? '') . "\n\n" .
                    "Organized by: {$req->organization_name}. " .
                    ($req->purpose ?? '')
                ),
                'scheduled_at'        => $req->preferred_date,
                'location_name'       => $req->preferred_location,
                'max_volunteers'      => $req->expected_participants,
                'status'              => 'upcoming',
                'is_from_request'     => true,
                'event_request_id'    => $req->id,
            ]);

            $this->info("Created event #{$event->id} \"{$event->name}\" for request #{$req->id}");
        }

        return 0;
    }
}

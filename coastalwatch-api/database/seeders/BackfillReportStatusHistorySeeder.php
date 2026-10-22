<?php

namespace Database\Seeders;

use App\Models\Report;
use App\Models\ReportStatusHistory;
use Illuminate\Database\Seeder;

/**
 * One-off, idempotent backfill so threat reports created before the monitoring
 * feature have a complete status timeline.
 *
 * For every report with NO status history, it seeds:
 *   1. a "submitted" entry dated at the report's created_at, and
 *   2. (when the report has since moved on) a second entry recording the
 *      current status, attributed to the reviewer and dated at reviewed_at.
 *
 * Safe to run repeatedly: reports that already have history are skipped.
 */
class BackfillReportStatusHistorySeeder extends Seeder
{
    public function run(): void
    {
        $seeded = 0;

        Report::query()
            ->whereDoesntHave('statusHistory')
            ->with('user:id')
            ->chunkById(200, function ($reports) use (&$seeded) {
                foreach ($reports as $report) {
                    // 1) Initial submission.
                    ReportStatusHistory::create([
                        'report_id'       => $report->id,
                        'previous_status' => null,
                        'new_status'      => 'submitted',
                        'changed_by'      => $report->user_id,
                        'note'            => 'Threat report submitted (backfilled).',
                        'created_at'      => $report->created_at ?? now(),
                    ]);

                    // 2) Current status, if the case has moved past "submitted".
                    if ($report->status && $report->status !== 'submitted') {
                        ReportStatusHistory::create([
                            'report_id'       => $report->id,
                            'previous_status' => 'submitted',
                            'new_status'      => $report->status,
                            'changed_by'      => $report->reviewed_by ?? $report->user_id,
                            'note'            => $report->admin_notes ?: 'Status recorded (backfilled).',
                            'created_at'      => $report->reviewed_at ?? $report->updated_at ?? now(),
                        ]);
                    }

                    $seeded++;
                }
            });

        $this->command?->info("Backfilled status history for {$seeded} report(s).");
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('report_status_history')) {
            return;
        }

        $legacyPending = ['submitted', 'rejected'];
        $legacyReview = ['investigating', 'under_observation', 'action_taken', 'recovering'];

        DB::table('report_status_history')->whereIn('previous_status', $legacyPending)->update(['previous_status' => 'pending']);
        DB::table('report_status_history')->whereIn('new_status', $legacyPending)->update(['new_status' => 'pending']);
        DB::table('report_status_history')->whereIn('previous_status', $legacyReview)->update(['previous_status' => 'under_review']);
        DB::table('report_status_history')->whereIn('new_status', $legacyReview)->update(['new_status' => 'under_review']);
        DB::table('report_status_history')->where('previous_status', 'approved')->update(['previous_status' => 'resolved']);
        DB::table('report_status_history')->where('new_status', 'approved')->update(['new_status' => 'resolved']);
    }

    public function down(): void
    {
        // Status history is an audit log; the normalized values cannot be
        // safely mapped back to their original legacy statuses.
    }
};

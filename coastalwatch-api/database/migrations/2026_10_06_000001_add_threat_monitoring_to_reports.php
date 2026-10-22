<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public $withinTransaction = false;

    /**
     * Turns a threat report into a monitoring case:
     *   - adds a dedicated `threat_type` field (categories specific to threats),
     *   - migrates the flat status to the environmental-monitoring workflow:
     *       submitted → under_review → under_observation → action_taken
     *       → recovering → resolved  (plus rejected)
     *
     * Existing values are remapped: pending→submitted, approved→resolved,
     * investigating→under_review. The `category` column is left intact for
     * backward compatibility.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            if (! Schema::hasColumn('reports', 'threat_type')) {
                $table->string('threat_type', 50)->nullable()->after('category');
            }
        });

        // Remap legacy status values to the new monitoring workflow.
        DB::table('reports')->where('status', 'pending')->update(['status' => 'submitted']);
        DB::table('reports')->where('status', 'investigating')->update(['status' => 'under_review']);
        DB::table('reports')->where('status', 'approved')->update(['status' => 'resolved']);
        // 'rejected' and already-'resolved' stay as-is.

        // On Postgres the status enum/check would need widening; dev DB is SQLite
        // (status is a plain string) so no constraint change is required.
        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check"); } catch (\Throwable $e) {}
            try {
                DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_status_check
                    CHECK (status IN ('submitted','under_review','under_observation','action_taken','recovering','resolved','rejected'))");
            } catch (\Throwable $e) {}
        }
    }

    public function down(): void
    {
        DB::table('reports')->where('status', 'submitted')->update(['status' => 'pending']);
        DB::table('reports')->where('status', 'under_review')->update(['status' => 'investigating']);
        DB::table('reports')->whereIn('status', ['under_observation', 'action_taken', 'recovering', 'resolved'])->update(['status' => 'approved']);

        Schema::table('reports', function (Blueprint $table) {
            if (Schema::hasColumn('reports', 'threat_type')) {
                $table->dropColumn('threat_type');
            }
        });

        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check"); } catch (\Throwable $e) {}
        }
    }
};

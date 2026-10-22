<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    /**
     * Migrates restoration_sites.status from the old lifecycle set
     * (planned/active/completed/suspended) to the new operational set
     * (active/inactive/in_progress).
     *
     * Mapping:
     *   planned   -> in_progress   (being set up / planting underway)
     *   completed -> active        (established and functioning)
     *   suspended -> inactive      (paused / not operational)
     *   active    -> active        (unchanged)
     */
    public function up(): void
    {
        DB::table('restoration_sites')->where('status', 'planned')->update(['status' => 'in_progress']);
        DB::table('restoration_sites')->where('status', 'completed')->update(['status' => 'active']);
        DB::table('restoration_sites')->where('status', 'suspended')->update(['status' => 'inactive']);

        // Default anything unexpected to in_progress so no row is left invalid.
        DB::table('restoration_sites')
            ->whereNotIn('status', ['active', 'inactive', 'in_progress'])
            ->update(['status' => 'in_progress']);

        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement("ALTER TABLE restoration_sites DROP CONSTRAINT IF EXISTS restoration_sites_status_check"); } catch (\Throwable $e) {}
            try {
                DB::statement("ALTER TABLE restoration_sites ADD CONSTRAINT restoration_sites_status_check
                    CHECK (status IN ('active','inactive','in_progress'))");
            } catch (\Throwable $e) {}
        }
    }

    public function down(): void
    {
        DB::table('restoration_sites')->where('status', 'in_progress')->update(['status' => 'planned']);
        DB::table('restoration_sites')->where('status', 'inactive')->update(['status' => 'suspended']);
        // 'active' maps back to 'active' (was both active and completed; cannot
        // distinguish, so leave as active).

        if (DB::getDriverName() !== 'sqlite') {
            try { DB::statement("ALTER TABLE restoration_sites DROP CONSTRAINT IF EXISTS restoration_sites_status_check"); } catch (\Throwable $e) {}
            try {
                DB::statement("ALTER TABLE restoration_sites ADD CONSTRAINT restoration_sites_status_check
                    CHECK (status IN ('planned','active','completed','suspended'))");
            } catch (\Throwable $e) {}
        }
    }
};

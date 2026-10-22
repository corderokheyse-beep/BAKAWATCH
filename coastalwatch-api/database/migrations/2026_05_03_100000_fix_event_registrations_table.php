<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Make user_id nullable so guest/public registrations work
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
        });

        // 2. Fix registration_status: drop the old check constraint, reset the
        //    column type and default to match what the application expects.
        if (DB::getDriverName() !== 'sqlite') {
            // Drop the auto-generated enum check constraint (may be named differently)
            DB::statement("ALTER TABLE event_registrations
                DROP CONSTRAINT IF EXISTS event_registrations_registration_status_check");

            // Re-create the column as a plain varchar with the correct allowed values
            DB::statement("ALTER TABLE event_registrations
                ALTER COLUMN registration_status TYPE VARCHAR(30)");

            DB::statement("ALTER TABLE event_registrations
                ALTER COLUMN registration_status SET DEFAULT 'confirmed'");

            DB::statement("UPDATE event_registrations
                SET registration_status = 'confirmed'
                WHERE registration_status NOT IN ('confirmed','pending_approval','rejected')");

            DB::statement("ALTER TABLE event_registrations
                ADD CONSTRAINT event_registrations_registration_status_check
                CHECK (registration_status IN ('confirmed','pending_approval','rejected'))");
        } else {
            // SQLite: just update the default (no ALTER COLUMN support needed)
            DB::statement("UPDATE event_registrations
                SET registration_status = 'confirmed'
                WHERE registration_status NOT IN ('confirmed','pending_approval','rejected')");
        }
    }

    public function down(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable(false)->change();
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE event_registrations
                DROP CONSTRAINT IF EXISTS event_registrations_registration_status_check");

            DB::statement("ALTER TABLE event_registrations
                ALTER COLUMN registration_status SET DEFAULT 'pending'");

            DB::statement("ALTER TABLE event_registrations
                ADD CONSTRAINT event_registrations_registration_status_check
                CHECK (registration_status IN ('confirmed','pending','rejected'))");
        }
    }
};

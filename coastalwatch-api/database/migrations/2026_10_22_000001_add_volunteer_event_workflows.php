<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('event_attendance_confirmations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('planting_event_id')->constrained('planting_events')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('confirmed_at');
            $table->timestamps();
            $table->unique(['planting_event_id', 'user_id'], 'event_attendance_unique');
        });

        Schema::create('event_accomplishment_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('planting_event_id')->constrained('planting_events')->cascadeOnDelete();
            $table->foreignId('restoration_site_id')->constrained('restoration_sites')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('mangrove_species_id')->constrained('mangrove_species')->restrictOnDelete();
            $table->string('species_name', 150);
            $table->unsignedInteger('seedlings_planted');
            $table->unsignedInteger('volunteers_present');
            $table->json('photos');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->text('remarks')->nullable();
            $table->timestamp('submitted_at');
            $table->foreignId('report_id')->nullable()->constrained('reports')->nullOnDelete();
            $table->timestamps();
            $table->unique(['planting_event_id', 'user_id'], 'event_accomplishment_once');
            $table->index(['restoration_site_id', 'submitted_at']);
        });

        Schema::table('report_updates', function (Blueprint $table) {
            $table->string('type', 40)->default('threat')->after('updated_by');
            $table->json('fields')->nullable()->after('type');
            $table->json('photos')->nullable()->after('image_public_id');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
        });
        Schema::table('reports', function (Blueprint $table) {
            $table->string('report_type', 40)->default('threat')->after('category');
            $table->decimal('latitude', 10, 8)->nullable()->change();
            $table->decimal('longitude', 11, 8)->nullable()->change();
        });

        // Consolidate volunteer visible report statuses to the three MENRO-managed states.
        DB::table('reports')->whereIn('status', ['submitted', 'rejected', 'pending'])->update(['status' => 'pending']);
        DB::table('reports')->whereIn('status', ['investigating', 'under_observation', 'action_taken', 'recovering'])->update(['status' => 'under_review']);
        DB::table('reports')->where('status', 'approved')->update(['status' => 'resolved']);
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check');
            DB::statement('ALTER TABLE reports ALTER COLUMN status TYPE VARCHAR(30)');
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending','under_review','resolved'))");
            DB::statement("ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'pending'");
        } elseif (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE reports MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending'");
        }

        $driver = DB::getDriverName();
        if ($driver !== 'sqlite') {
            DB::table('planting_events')->where('status', 'open')->update(['status' => 'upcoming']);
            DB::table('planting_events')->where('status', 'closed')->update(['status' => 'completed']);
            if ($driver === 'pgsql') {
                DB::statement('ALTER TABLE planting_events DROP CONSTRAINT IF EXISTS planting_events_status_check');
                DB::statement("ALTER TABLE planting_events ADD CONSTRAINT planting_events_status_check CHECK (status IN ('upcoming','on-going','completed','cancelled'))");
                DB::statement("ALTER TABLE planting_events ALTER COLUMN status SET DEFAULT 'upcoming'");
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                try { DB::statement('ALTER TABLE planting_events DROP CHECK planting_events_status_check'); } catch (\Throwable $e) {}
                DB::statement("ALTER TABLE planting_events MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'upcoming'");
                try { DB::statement("ALTER TABLE planting_events ADD CONSTRAINT planting_events_status_check CHECK (status IN ('upcoming','on-going','completed','cancelled'))"); } catch (\Throwable $e) {}
            }
        } else {
            DB::table('planting_events')->where('status', 'open')->update(['status' => 'upcoming']);
            DB::table('planting_events')->where('status', 'closed')->update(['status' => 'completed']);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('event_accomplishment_reports');
        Schema::dropIfExists('event_attendance_confirmations');
        Schema::table('report_updates', function (Blueprint $table) {
            $table->dropColumn(['type', 'fields', 'photos', 'latitude', 'longitude']);
        });
        Schema::table('reports', function (Blueprint $table) { $table->dropColumn('report_type'); });
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE planting_events DROP CONSTRAINT IF EXISTS planting_events_status_check');
            DB::statement("ALTER TABLE planting_events ADD CONSTRAINT planting_events_status_check CHECK (status IN ('open','upcoming','closed','completed','cancelled'))");
        } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
            try { DB::statement('ALTER TABLE planting_events DROP CHECK planting_events_status_check'); } catch (\Throwable $e) {}
            try { DB::statement("ALTER TABLE planting_events ADD CONSTRAINT planting_events_status_check CHECK (status IN ('open','upcoming','closed','completed','cancelled'))"); } catch (\Throwable $e) {}
        }
    }
};

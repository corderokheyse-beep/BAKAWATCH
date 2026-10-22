<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('planting_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained('restoration_sites')->onDelete('cascade');
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            $table->string('name');
            $table->text('description')->nullable();
            $table->timestamp('scheduled_at');
            $table->string('location_name')->nullable();
            $table->unsignedInteger('max_volunteers')->default(0);
            $table->string('status', 20)->default('open');
            $table->timestamps();
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE planting_events ADD CONSTRAINT planting_events_status_check
                CHECK (status IN ('open','closed','completed','cancelled'))");
        }

        Schema::create('event_registrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('planting_event_id')->constrained('planting_events')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->timestamps();
            $table->unique(['planting_event_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_registrations');
        Schema::dropIfExists('planting_events');
    }
};

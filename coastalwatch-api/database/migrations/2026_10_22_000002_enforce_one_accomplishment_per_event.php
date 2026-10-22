<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('event_accomplishment_reports', function (Blueprint $table) {
            $table->dropUnique('event_accomplishment_once');
            $table->unique('planting_event_id', 'event_accomplishment_event_unique');
        });
    }

    public function down(): void
    {
        Schema::table('event_accomplishment_reports', function (Blueprint $table) {
            $table->dropUnique('event_accomplishment_event_unique');
            $table->unique(['planting_event_id', 'user_id'], 'event_accomplishment_once');
        });
    }
};

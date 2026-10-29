<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->unsignedInteger('seedlings_requested')->default(0)->after('expected_participants');
            $table->dropColumn('contact_age');
        });
    }

    public function down(): void
    {
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->dropColumn('seedlings_requested');
            $table->unsignedTinyInteger('contact_age')->nullable();
        });
    }
};

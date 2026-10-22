<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            // Gender field — optional, stored as a short string
            $table->string('gender', 20)->nullable()->after('age');
            // Group size — 1 for individuals, >1 for organization representatives
            $table->unsignedSmallInteger('group_size')->default(1)->after('gender');
        });
    }

    public function down(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->dropColumn(['gender', 'group_size']);
        });
    }
};

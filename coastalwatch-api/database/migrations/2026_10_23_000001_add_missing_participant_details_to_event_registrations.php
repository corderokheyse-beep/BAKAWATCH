<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->string('organization')->nullable();
            $table->unsignedSmallInteger('age')->nullable();
            $table->text('admin_notes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->dropColumn(['organization', 'age', 'admin_notes']);
        });
    }
};

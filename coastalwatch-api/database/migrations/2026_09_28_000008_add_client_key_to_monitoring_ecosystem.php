<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotency keys for offline-synced monitoring and ecosystem records,
     * matching the mechanism used for plantation records so the offline draft
     * queue never creates duplicates on retry.
     */
    public function up(): void
    {
        Schema::table('monitoring_records', function (Blueprint $table) {
            $table->uuid('client_key')->nullable()->unique()->after('id');
        });
        Schema::table('ecosystem_records', function (Blueprint $table) {
            $table->uuid('client_key')->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_records', function (Blueprint $table) {
            $table->dropUnique(['client_key']);
            $table->dropColumn('client_key');
        });
        Schema::table('ecosystem_records', function (Blueprint $table) {
            $table->dropUnique(['client_key']);
            $table->dropColumn('client_key');
        });
    }
};

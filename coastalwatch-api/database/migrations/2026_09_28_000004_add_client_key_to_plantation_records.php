<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Idempotency key for offline-synced plantation records. The frontend
     * offline draft queue generates a client_key per draft; on sync the server
     * uses it to prevent duplicate records if a submission is retried.
     */
    public function up(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            $table->uuid('client_key')->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            $table->dropUnique(['client_key']);
            $table->dropColumn('client_key');
        });
    }
};

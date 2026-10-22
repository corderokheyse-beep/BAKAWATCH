<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Audit trail for government/agency integration attempts and CSV imports.
     * Records the connector, direction, outcome, counts, and source attribution
     * so locally-entered records stay distinguishable from imported ones and
     * every synchronisation attempt is traceable.
     */
    public function up(): void
    {
        Schema::create('integration_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('connector', 50);            // 'denr' | 'menro' | 'csv_import'
            $table->string('direction', 10)->default('import'); // 'import' | 'export'
            $table->string('status', 20);               // 'success' | 'failed' | 'partial' | 'skipped'
            $table->unsignedInteger('records_imported')->default(0);
            $table->unsignedInteger('records_skipped')->default(0);
            $table->string('source')->nullable();       // filename or endpoint attribution
            $table->text('message')->nullable();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_sync_logs');
    }
};

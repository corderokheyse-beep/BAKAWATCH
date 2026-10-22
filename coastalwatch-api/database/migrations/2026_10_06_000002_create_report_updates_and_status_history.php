<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Follow-up monitoring entries (many per threat report).
        Schema::create('report_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_id')->constrained('reports')->cascadeOnDelete();
            $table->foreignId('updated_by')->constrained('users')->cascadeOnDelete();
            $table->text('observation');
            $table->text('action_taken')->nullable();
            $table->string('status', 30);            // the status set at this update
            $table->string('image_url')->nullable();
            $table->string('image_public_id')->nullable();
            $table->date('update_date');
            $table->timestamps();
            $table->index(['report_id', 'update_date']);
        });

        // Immutable status log — never overwritten.
        Schema::create('report_status_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_id')->constrained('reports')->cascadeOnDelete();
            $table->string('previous_status', 30)->nullable();
            $table->string('new_status', 30);
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 1000)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['report_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_status_history');
        Schema::dropIfExists('report_updates');
    }
};

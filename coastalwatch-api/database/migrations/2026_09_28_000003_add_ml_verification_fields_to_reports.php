<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds human-verification fields for AI species classification.
     *
     * The AI prediction (ml_species / ml_confidence) is kept UNCHANGED. These
     * new columns store the separate, human-verified outcome so that an AI
     * guess is never mistaken for a confirmed scientific identification.
     *
     *   ml_model_version       — which model produced the prediction (traceability)
     *   ml_all_predictions     — full ranked prediction list (JSON) for review
     *   human_verified_species — the species an authorized reviewer confirmed
     *   verification_status    — unverified | confirmed | corrected | rejected
     *   verified_by / verified_at — who verified and when
     *   verification_notes     — reviewer remarks
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('ml_model_version', 50)->nullable()->after('ml_analyzed');
            $table->text('ml_all_predictions')->nullable()->after('ml_model_version');
            $table->string('human_verified_species', 100)->nullable()->after('ml_all_predictions');
            $table->string('verification_status', 20)->default('unverified')->after('human_verified_species');
            $table->foreignId('verified_by')->nullable()->after('verification_status')->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable()->after('verified_by');
            $table->text('verification_notes')->nullable()->after('verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn([
                'ml_model_version', 'ml_all_predictions', 'human_verified_species',
                'verification_status', 'verified_at', 'verification_notes',
            ]);
        });
    }
};

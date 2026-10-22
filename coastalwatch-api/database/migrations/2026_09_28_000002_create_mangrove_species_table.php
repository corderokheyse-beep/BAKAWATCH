<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Managed reference table for mangrove species. Replaces free-text species
     * entry across the system with a validated, centrally-managed list.
     * The `ml_supported` flag marks the species the AI classifier can predict
     * (kept in sync with ml-service class labels) so the UI can indicate which
     * identifications the model is trained to recognise.
     */
    public function up(): void
    {
        Schema::create('mangrove_species', function (Blueprint $table) {
            $table->id();
            $table->string('scientific_name')->unique();
            $table->string('local_name')->nullable();
            $table->string('family')->nullable();
            $table->text('description')->nullable();
            $table->boolean('ml_supported')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mangrove_species');
    }
};

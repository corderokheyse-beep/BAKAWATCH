<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Curated list of mangrove species known to be present at a restoration
     * site. This is distinct from plantation_records (what was planted and is
     * being tracked): it captures the site's documented biodiversity, set by
     * MENRO/admin, so sites can display their full species inventory even
     * before any individual plantings are logged.
     */
    public function up(): void
    {
        Schema::create('restoration_site_species', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('mangrove_species_id')->constrained('mangrove_species')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['restoration_site_id', 'mangrove_species_id'], 'site_species_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restoration_site_species');
    }
};

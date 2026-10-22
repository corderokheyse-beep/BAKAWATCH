<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seedling_inventories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('recorded_by')->constrained('users')->cascadeOnDelete();
            $table->string('species_name');
            $table->string('source_nursery')->nullable();          // e.g. DENR-PENRO, LGU Gloria
            $table->date('date_received');
            $table->integer('quantity_received');
            $table->integer('quantity_planted')->default(0);
            $table->integer('quantity_damaged')->default(0);
            // quantity_remaining is computed in app logic: received - planted - damaged
            $table->string('stage')->default('seedling');          // seedling, propagule, cutting
            $table->text('notes')->nullable();
            $table->string('image_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seedling_inventories');
    }
};

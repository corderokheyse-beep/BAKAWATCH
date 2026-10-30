<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->json('seedling_quantities')->nullable();
        });

        Schema::table('event_accomplishment_reports', function (Blueprint $table) {
            $table->json('plantings')->nullable();
        });

        Schema::create('event_seedling_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plantation_event_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('planting_event_id')->constrained()->cascadeOnDelete();
            $table->foreignId('seedling_inventory_id')->constrained()->restrictOnDelete();
            $table->foreignId('mangrove_species_id')->constrained()->restrictOnDelete();
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('dispatched_quantity');
            $table->unsignedInteger('planted_quantity')->default(0);
            $table->unsignedInteger('returned_quantity')->default(0);
            $table->timestamps();

            $table->index(['planting_event_id', 'mangrove_species_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_seedling_allocations');
        Schema::table('event_accomplishment_reports', function (Blueprint $table) {
            $table->dropColumn('plantings');
        });
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->dropColumn('seedling_quantities');
        });
    }
};

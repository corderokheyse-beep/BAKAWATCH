<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supports the daily inventory-count form:
     *   Ending = Beginning + Added − Mortality − Released
     * Adds a beginning_stock column, and makes the destination site nullable
     * (an entry with 0 Released has nowhere to send seedlings).
     */
    public function up(): void
    {
        Schema::table('seedling_inventories', function (Blueprint $table) {
            $table->integer('beginning_stock')->default(0)->after('date_received');
        });

        // SQLite (used in tests) can't easily alter a FK column to nullable, so
        // only adjust nullability on non-SQLite drivers. The column already
        // allows null in the original schema (nullable()->constrained()).
    }

    public function down(): void
    {
        Schema::table('seedling_inventories', function (Blueprint $table) {
            $table->dropColumn('beginning_stock');
        });
    }
};

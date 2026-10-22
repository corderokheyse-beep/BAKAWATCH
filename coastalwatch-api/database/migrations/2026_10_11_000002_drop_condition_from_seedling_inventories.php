<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the `condition` (Good/Fair/Poor) column from seedling_inventories.
 * Seedling condition is now captured in Reports instead of the inventory entry.
 *
 * NOTE: this discards any existing `condition` values in inventory rows. That
 * was agreed as part of moving condition out of inventory. The down() re-adds
 * the column (nullable) but cannot restore the old values.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('seedling_inventories', 'condition')) {
            Schema::table('seedling_inventories', function (Blueprint $table) {
                $table->dropColumn('condition');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('seedling_inventories', 'condition')) {
            Schema::table('seedling_inventories', function (Blueprint $table) {
                $table->string('condition')->nullable();
            });
        }
    }
};

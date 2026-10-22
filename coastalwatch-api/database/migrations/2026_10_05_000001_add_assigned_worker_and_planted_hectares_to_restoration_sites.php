<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            // Assigned Bantay Bakawan (field worker). One per site; nullable.
            if (! Schema::hasColumn('restoration_sites', 'assigned_to')) {
                $table->foreignId('assigned_to')
                    ->nullable()
                    ->after('created_by')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            // Manually-maintained planted area. Unplanted is derived
            // (area_hectares - planted_hectares) and never stored.
            if (! Schema::hasColumn('restoration_sites', 'planted_hectares')) {
                $table->decimal('planted_hectares', 10, 4)
                    ->nullable()
                    ->after('area_hectares');
            }
        });
    }

    public function down(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            if (Schema::hasColumn('restoration_sites', 'assigned_to')) {
                // Drop FK first where supported; guard for SQLite.
                try { $table->dropForeign(['assigned_to']); } catch (\Throwable $e) {}
                $table->dropColumn('assigned_to');
            }
            if (Schema::hasColumn('restoration_sites', 'planted_hectares')) {
                $table->dropColumn('planted_hectares');
            }
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds threat severity and an affected-area radius to field reports so the
     * map can draw an impact circle around each report. Severity drives the
     * default radius; affected_radius_m (metres) overrides it when set.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            if (! Schema::hasColumn('reports', 'severity')) {
                // low | medium | high | critical  (nullable; defaults applied in app)
                $table->string('severity', 20)->nullable()->after('category');
            }
            if (! Schema::hasColumn('reports', 'affected_radius_m')) {
                $table->unsignedInteger('affected_radius_m')->nullable()->after('severity');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            if (Schema::hasColumn('reports', 'affected_radius_m')) {
                $table->dropColumn('affected_radius_m');
            }
            if (Schema::hasColumn('reports', 'severity')) {
                $table->dropColumn('severity');
            }
        });
    }
};

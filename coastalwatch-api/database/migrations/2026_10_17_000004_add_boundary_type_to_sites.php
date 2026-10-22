<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Classifies a site's drawn area:
     *   'mangrove' (default) → general mangrove area, shown GREEN
     *   'planted'            → currently-planted area, shown RED
     */
    public function up(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->string('boundary_type')->default('mangrove')->after('boundary_geojson');
        });
    }

    public function down(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->dropColumn('boundary_type');
        });
    }
};

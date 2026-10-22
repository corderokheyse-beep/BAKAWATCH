<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Portable boundary storage. The original design keeps the authoritative
     * geometry in a PostGIS `boundary` column, but that only works on Postgres.
     * To support the in-app mangrove-area draw tool on every driver (incl. the
     * SQLite dev/test DB), we also persist the raw GeoJSON geometry as text.
     * Reads prefer PostGIS when available and fall back to this column.
     */
    public function up(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->text('boundary_geojson')->nullable()->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->dropColumn('boundary_geojson');
        });
    }
};

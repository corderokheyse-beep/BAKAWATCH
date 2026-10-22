<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Multiple drawn areas per restoration site. A site can now hold BOTH a
     * green "mangrove" area and one or more red "planted" areas simultaneously
     * (previously a single boundary_geojson could only be one or the other).
     *
     * Existing single boundaries are migrated into this table so nothing is lost.
     */
    public function up(): void
    {
        Schema::create('site_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('mangrove'); // mangrove | planted
            $table->text('geojson');                      // GeoJSON geometry (polygon)
            $table->decimal('area_hectares', 10, 4)->nullable();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['restoration_site_id', 'type']);
        });

        // Migrate any existing single boundary into a site_areas row.
        $sites = DB::table('restoration_sites')
            ->whereNotNull('boundary_geojson')
            ->get(['id', 'boundary_geojson', 'boundary_type', 'created_by', 'planted_hectares', 'area_hectares']);
        $now = now();
        foreach ($sites as $s) {
            $type = $s->boundary_type ?: 'mangrove';
            DB::table('site_areas')->insert([
                'restoration_site_id' => $s->id,
                'created_by'          => $s->created_by,
                'type'                => $type,
                'geojson'             => $s->boundary_geojson,
                'area_hectares'       => $type === 'planted' ? $s->planted_hectares : $s->area_hectares,
                'note'                => 'Migrated from site boundary',
                'created_at'          => $now,
                'updated_at'          => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('site_areas');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a site_type column to restoration_sites to distinguish between:
 *   - planting_site  : active mangrove planting / restoration areas
 *                      (Tambong, Balete, Sta. Theresa, Agsalin)
 *   - mangrove_area  : identified existing natural mangrove zones
 *                      (Maragooc, Guimbonan)
 *
 * Defaults to 'planting_site' so existing records remain valid.
 * Back-fills known Gloria barangay sites to their correct type.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->string('site_type', 30)->default('planting_site')->after('status');
        });

        // Back-fill the two natural mangrove area sites
        $mangroveAreas = ['Maragooc', 'Guimbonan'];
        DB::table('restoration_sites')
            ->whereIn('barangay', $mangroveAreas)
            ->update(['site_type' => 'mangrove_area']);

        // Explicitly mark the four planting sites
        $plantingSites = ['Tambong', 'Balete', 'Sta. Theresa', 'Agsalin'];
        DB::table('restoration_sites')
            ->whereIn('barangay', $plantingSites)
            ->update(['site_type' => 'planting_site']);
    }

    public function down(): void
    {
        Schema::table('restoration_sites', function (Blueprint $table) {
            $table->dropColumn('site_type');
        });
    }
};

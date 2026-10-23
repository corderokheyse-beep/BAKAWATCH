<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('reports')
            ->where('title', 'SAMPLE: Mangrove shoreline inspection')
            ->where('location_name', 'SAMPLE: Agsalin, Gloria, Oriental Mindoro')
            ->where('latitude', 12.9280)
            ->where('longitude', 121.5020)
            ->update([
                'latitude' => 12.8838292,
                'longitude' => 121.4727700,
            ]);

        DB::table('reports')
            ->where('title', 'SAMPLE: Community restoration activity')
            ->where('location_name', 'SAMPLE: Agsalin, Gloria, Oriental Mindoro')
            ->where('latitude', 12.9290)
            ->where('longitude', 121.5030)
            ->update([
                'latitude' => 12.8838292,
                'longitude' => 121.4727700,
            ]);
    }

    public function down(): void
    {
        DB::table('reports')
            ->where('title', 'SAMPLE: Mangrove shoreline inspection')
            ->where('location_name', 'SAMPLE: Agsalin, Gloria, Oriental Mindoro')
            ->where('latitude', 12.8838292)
            ->where('longitude', 121.4727700)
            ->update([
                'latitude' => 12.9280,
                'longitude' => 121.5020,
            ]);

        DB::table('reports')
            ->where('title', 'SAMPLE: Community restoration activity')
            ->where('location_name', 'SAMPLE: Agsalin, Gloria, Oriental Mindoro')
            ->where('latitude', 12.8838292)
            ->where('longitude', 121.4727700)
            ->update([
                'latitude' => 12.9290,
                'longitude' => 121.5030,
            ]);
    }
};

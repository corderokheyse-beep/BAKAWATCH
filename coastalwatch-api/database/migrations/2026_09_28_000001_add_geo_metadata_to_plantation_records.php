<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds GPS provenance + geofence-override + replacement-cohort metadata to
     * plantation records. This lets the system:
     *  - record whether a location came from GPS or was entered manually,
     *  - store GPS accuracy for verification,
     *  - allow an authorized out-of-boundary submission to be kept with a
     *    recorded reason (instead of being silently flagged/rejected),
     *  - distinguish original seedlings from replacement seedlings for
     *    transparent survival-rate denominators (see config/monitoring.php).
     */
    public function up(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            // GPS provenance
            $table->string('gps_source', 10)->default('gps')->after('longitude'); // 'gps' | 'manual'
            $table->decimal('gps_accuracy_m', 8, 2)->nullable()->after('gps_source');

            // Geofence override — set when a record is knowingly submitted
            // outside its site boundary by an authorized user.
            $table->boolean('geo_override')->default(false)->after('geo_mismatch');
            $table->text('geo_override_reason')->nullable()->after('geo_override');

            // Replacement-cohort flag for survival methodology.
            $table->boolean('is_replacement')->default(false)->after('geo_override_reason');

            // Verification flag for manually entered coordinates.
            $table->boolean('location_verified')->default(true)->after('is_replacement');
        });
    }

    public function down(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            $table->dropColumn([
                'gps_source', 'gps_accuracy_m', 'geo_override', 'geo_override_reason',
                'is_replacement', 'location_verified',
            ]);
        });
    }
};

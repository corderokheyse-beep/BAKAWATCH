<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        Schema::create('ecosystem_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained('restoration_sites')->onDelete('cascade');
            $table->foreignId('submitted_by')->constrained('users')->onDelete('cascade');
            $table->date('measurement_date');
            $table->decimal('soil_salinity_ppt', 6, 2);
            $table->decimal('water_ph', 4, 2);
            $table->decimal('water_temp_celsius', 5, 2);
            $table->string('tidal_condition', 10);
            $table->decimal('latitude', 10, 8)->nullable();
            $table->decimal('longitude', 11, 8)->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement("ALTER TABLE ecosystem_records ADD CONSTRAINT ecosystem_records_tidal_check
                    CHECK (tidal_condition IN ('low','mid','high','storm'))");
                DB::statement('ALTER TABLE ecosystem_records ADD COLUMN location geometry(Point, 4326)');
            } catch (\Exception $e) {}
        }
        DB::statement('CREATE INDEX ecosystem_records_site_idx ON ecosystem_records(restoration_site_id)');
    }

    public function down(): void
    {
        Schema::dropIfExists('ecosystem_records');
    }
};

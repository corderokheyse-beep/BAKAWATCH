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
        Schema::create('monitoring_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plantation_record_id')->constrained('plantation_records')->onDelete('cascade');
            $table->foreignId('submitted_by')->constrained('users')->onDelete('cascade');
            $table->date('monitoring_date');
            $table->decimal('height_cm', 8, 2);
            $table->decimal('diameter_cm', 8, 2);
            $table->string('survival_status', 10);
            $table->string('growth_stage', 20);
            $table->text('disease_observation')->nullable();
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->timestamps();
        });

        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement("ALTER TABLE monitoring_records ADD CONSTRAINT monitoring_records_survival_check
                    CHECK (survival_status IN ('alive','dead'))");
                DB::statement("ALTER TABLE monitoring_records ADD CONSTRAINT monitoring_records_growth_check
                    CHECK (growth_stage IN ('seedling','sapling','juvenile','mature'))");
                DB::statement('ALTER TABLE monitoring_records ADD COLUMN location geometry(Point, 4326)');
                DB::statement('CREATE INDEX monitoring_records_location_idx ON monitoring_records USING GIST(location)');
                DB::statement('CREATE INDEX monitoring_records_plantation_idx ON monitoring_records(plantation_record_id)');
            } catch (\Exception $e) {}
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_records');
    }
};

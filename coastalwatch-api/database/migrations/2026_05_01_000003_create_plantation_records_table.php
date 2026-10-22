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
        Schema::create('plantation_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained('restoration_sites')->onDelete('cascade');
            $table->foreignId('submitted_by')->constrained('users')->onDelete('cascade');
            $table->string('species_name');
            $table->date('date_planted');
            $table->string('seedling_source')->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('image_public_id')->nullable();
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->string('status', 20)->default('active');
            $table->boolean('geo_mismatch')->default(false);
            $table->date('mortality_date')->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement("ALTER TABLE plantation_records ADD CONSTRAINT plantation_records_status_check
                    CHECK (status IN ('active','flagged','dead'))");
                DB::statement('ALTER TABLE plantation_records ADD COLUMN location geometry(Point, 4326)');
                DB::statement('CREATE INDEX plantation_records_location_idx ON plantation_records USING GIST(location)');
                DB::statement('CREATE INDEX plantation_records_site_idx ON plantation_records(restoration_site_id)');
            } catch (\Exception $e) {}
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('plantation_records');
    }
};

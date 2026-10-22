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
        Schema::create('restoration_sites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('area_hectares', 10, 4)->nullable();
            $table->string('barangay')->nullable();
            $table->string('status', 20)->default('planned');
            $table->unsignedSmallInteger('established_year')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE restoration_sites ADD CONSTRAINT restoration_sites_status_check
                CHECK (status IN ('planned','active','completed','suspended'))");
        }

        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement('ALTER TABLE restoration_sites ADD COLUMN boundary geometry(Polygon, 4326)');
                DB::statement('CREATE INDEX restoration_sites_boundary_idx ON restoration_sites USING GIST(boundary)');
            } catch (\Exception $e) {}
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('restoration_sites');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        // Enable PostGIS extension (PostgreSQL only, skip if not available)
        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement('CREATE EXTENSION IF NOT EXISTS postgis');
            } catch (\Exception $e) {
                // PostGIS not installed — geometry features will be unavailable
            }
        }

        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('title');
            $table->text('description');
            $table->string('image_url')->nullable();
            $table->string('image_public_id')->nullable();
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->string('location_name')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->enum('category', ['damage', 'restoration', 'wildlife', 'pollution', 'other'])->default('other');
            $table->text('admin_notes')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Add PostGIS geometry column (skip if PostGIS not available)
        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement('ALTER TABLE reports ADD COLUMN location geometry(Point, 4326)');
                DB::statement('CREATE INDEX reports_location_idx ON reports USING GIST(location)');
            } catch (\Exception $e) {
                // PostGIS not installed — geometry column skipped
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reports');
    }
};

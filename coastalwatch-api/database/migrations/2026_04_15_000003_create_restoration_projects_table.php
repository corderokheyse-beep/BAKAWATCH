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
        Schema::create('restoration_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            $table->string('name');
            $table->text('description');
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->string('location_name');
            $table->decimal('area_hectares', 8, 2)->nullable();
            $table->enum('status', ['planned', 'active', 'completed', 'suspended'])->default('planned');
            $table->integer('progress_percent')->default(0);
            $table->integer('trees_planted')->default(0);
            $table->integer('trees_target')->default(0);
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('image_url')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        if (DB::getDriverName() !== 'sqlite') {
            try {
                DB::statement('ALTER TABLE restoration_projects ADD COLUMN location geometry(Point, 4326)');
                DB::statement('CREATE INDEX restoration_projects_location_idx ON restoration_projects USING GIST(location)');
            } catch (\Exception $e) {}
        }

        Schema::create('project_volunteers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('restoration_projects')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->enum('role', ['volunteer', 'lead', 'coordinator'])->default('volunteer');
            $table->date('joined_date')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'user_id']);
        });

        Schema::create('project_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('restoration_projects')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('title');
            $table->text('content');
            $table->integer('trees_planted_update')->default(0);
            $table->string('image_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_updates');
        Schema::dropIfExists('project_volunteers');
        Schema::dropIfExists('restoration_projects');
    }
};

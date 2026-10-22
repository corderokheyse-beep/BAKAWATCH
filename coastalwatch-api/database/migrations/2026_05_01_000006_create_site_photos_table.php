<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('restoration_site_id')->constrained('restoration_sites')->onDelete('cascade');
            $table->foreignId('uploaded_by')->constrained('users')->onDelete('cascade');
            $table->string('cloudinary_url', 500);
            $table->string('cloudinary_public_id');
            $table->string('photo_type', 10);
            $table->timestamps();
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE site_photos ADD CONSTRAINT site_photos_type_check
                CHECK (photo_type IN ('before','after'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('site_photos');
    }
};

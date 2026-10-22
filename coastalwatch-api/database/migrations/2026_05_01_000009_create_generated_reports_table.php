<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('generated_by')->constrained('users')->onDelete('cascade');
            $table->foreignId('restoration_site_id')->nullable()->constrained('restoration_sites')->nullOnDelete();
            $table->string('report_type', 50);
            $table->date('date_from')->nullable();
            $table->date('date_to')->nullable();
            $table->string('file_path', 500)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_reports');
    }
};

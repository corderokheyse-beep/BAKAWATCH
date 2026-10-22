<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nurseries', function (Blueprint $table) {
            $table->id();
            $table->string('name');                 // e.g. "DENR-PENRO", "LGU Gloria"
            $table->string('location')->nullable(); // optional barangay / address
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nurseries');
    }
};

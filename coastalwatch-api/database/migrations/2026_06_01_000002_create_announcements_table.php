<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('author_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('content');
            $table->string('type')->default('info'); // info, warning, success, urgent
            $table->boolean('is_active')->default(true);
            $table->timestamp('expires_at')->nullable();
            $table->string('target_roles')->nullable(); // comma-separated or null = all
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
    }
};

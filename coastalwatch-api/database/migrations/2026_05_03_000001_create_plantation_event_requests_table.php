<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plantation_event_requests', function (Blueprint $table) {
            $table->id();

            // Requesting organization / group
            $table->string('organization_name');
            $table->string('contact_person');
            $table->string('contact_email');
            $table->string('contact_phone')->nullable();

            // Event details
            $table->string('event_name');
            $table->text('description')->nullable();
            $table->date('preferred_date');
            $table->string('preferred_location')->nullable();
            $table->unsignedInteger('expected_participants')->default(1);
            $table->text('purpose')->nullable();          // why they want to plant

            // Review
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('admin_notes')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            // Optional link to a created planting event after approval
            $table->foreignId('planting_event_id')->nullable()->constrained('planting_events')->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plantation_event_requests');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Mark events that originated from a public request
        Schema::table('planting_events', function (Blueprint $table) {
            $table->boolean('is_from_request')->default(false)->after('status');
            $table->foreignId('source_request_id')
                  ->nullable()
                  ->constrained('plantation_event_requests')
                  ->nullOnDelete()
                  ->after('is_from_request');
        });

        // Add personal info + approval status to registrations
        Schema::table('event_registrations', function (Blueprint $table) {
            // Personal info — required for request-sourced events, optional otherwise
            $table->string('full_name')->nullable()->after('user_id');
            $table->string('email')->nullable()->after('full_name');
            $table->string('phone')->nullable()->after('email');
            $table->string('address')->nullable()->after('phone');
            $table->text('motivation')->nullable()->after('address');

            // Approval workflow for request-sourced events
            $table->enum('registration_status', ['confirmed', 'pending_approval', 'rejected'])
                  ->default('confirmed')
                  ->after('motivation');
        });
    }

    public function down(): void
    {
        Schema::table('event_registrations', function (Blueprint $table) {
            $table->dropColumn(['full_name', 'email', 'phone', 'address', 'motivation', 'registration_status']);
        });
        Schema::table('planting_events', function (Blueprint $table) {
            $table->dropForeign(['source_request_id']);
            $table->dropColumn(['is_from_request', 'source_request_id']);
        });
    }
};

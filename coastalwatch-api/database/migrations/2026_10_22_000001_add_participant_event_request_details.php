<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->foreignId('requester_id')->nullable()->after('id')->constrained('users')->nullOnDelete();
            $table->unsignedTinyInteger('contact_age')->nullable();
            $table->string('contact_address')->nullable();
            $table->foreignId('preferred_restoration_site_id')->nullable()->constrained('restoration_sites')->nullOnDelete();
            $table->json('target_species')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('plantation_event_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('requester_id');
            $table->dropConstrainedForeignId('preferred_restoration_site_id');
            $table->dropColumn(['contact_age', 'target_species']);
        });
    }
};

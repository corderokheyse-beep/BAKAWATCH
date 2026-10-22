<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Links a local account to its Firebase Authentication identity.
            // Nullable so legacy (pre-Firebase) accounts remain valid during the
            // hybrid cutover; populated on first Firebase sign-in.
            $table->string('firebase_uid')->nullable()->unique()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['firebase_uid']);
            $table->dropColumn('firebase_uid');
        });
    }
};

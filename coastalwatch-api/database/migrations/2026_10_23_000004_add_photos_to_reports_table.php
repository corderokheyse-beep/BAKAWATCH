<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('reports', 'photos')) {
            Schema::table('reports', function (Blueprint $table) {
                $table->json('photos')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('reports', 'photos')) {
            Schema::table('reports', function (Blueprint $table) {
                $table->dropColumn('photos');
            });
        }
    }
};

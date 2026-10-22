<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            // ML analysis results stored alongside the report
            $table->string('ml_condition',  50)->nullable()->after('image_public_id');
            $table->string('ml_species',   100)->nullable()->after('ml_condition');
            $table->decimal('ml_confidence', 5, 2)->nullable()->after('ml_species'); // 0.00–100.00
            $table->boolean('ml_analyzed')->default(false)->after('ml_confidence');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn(['ml_condition', 'ml_species', 'ml_confidence', 'ml_analyzed']);
        });
    }
};

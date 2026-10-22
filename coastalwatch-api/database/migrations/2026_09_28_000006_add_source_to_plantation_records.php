<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Records the provenance of a plantation record so locally-entered data is
     * always distinguishable from externally-imported data (CSV or agency API).
     * Defaults to 'local' for all existing and field-entered records.
     */
    public function up(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            $table->string('source', 30)->default('local')->after('client_key'); // 'local' | 'csv_import' | 'denr' | 'menro'
        });
    }

    public function down(): void
    {
        Schema::table('plantation_records', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};

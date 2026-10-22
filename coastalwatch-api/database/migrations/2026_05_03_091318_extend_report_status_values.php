<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            // PostgreSQL: ALTER TYPE or use a raw ALTER COLUMN with text cast
            DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check");
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending','approved','rejected','investigating','resolved'))");
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE reports MODIFY COLUMN status ENUM('pending','approved','rejected','investigating','resolved') NOT NULL DEFAULT 'pending'");
        }
        // SQLite does not enforce ENUM constraints — no action needed
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check");
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending','approved','rejected'))");
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE reports MODIFY COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
        }
    }
};

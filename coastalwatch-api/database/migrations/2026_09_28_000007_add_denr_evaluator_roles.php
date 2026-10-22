<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Adds two authorized read/evaluation roles:
     *   denr      — DENR / authorized agency evaluator
     *   evaluator — environmentalist / marine scientist / research evaluator
     *
     * These are least-privilege roles: they read authorized monitoring data and
     * (evaluator) validate AI species classifications, but cannot submit field
     * data or perform administrative functions.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            // SQLite bakes enum CHECK constraints into the table definition and
            // cannot ALTER them in place. Rebuild the constraint by copying the
            // column: drop the CHECK by recreating role as a plain TEXT column.
            // (Application-level validation restricts allowed values.)
            $this->rebuildSqliteRoleColumn();
            return;
        }

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin','staff','user','public','field_worker','volunteer','menro','denr','evaluator'))");
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return; // role stays a plain TEXT column on SQLite
        }

        DB::statement("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin','staff','user','public','field_worker','volunteer','menro'))");
    }

    /**
     * Replace the enum-constrained `role` column with a plain TEXT column on
     * SQLite so newly-added roles are accepted. Data is preserved.
     */
    private function rebuildSqliteRoleColumn(): void
    {
        // Turn off FK checks during the rebuild.
        DB::statement('PRAGMA foreign_keys=OFF');
        DB::beginTransaction();
        try {
            DB::statement("ALTER TABLE users RENAME COLUMN role TO role_old");
            DB::statement("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
            DB::statement("UPDATE users SET role = role_old");
            DB::statement("ALTER TABLE users DROP COLUMN role_old");
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        } finally {
            DB::statement('PRAGMA foreign_keys=ON');
        }
    }
};

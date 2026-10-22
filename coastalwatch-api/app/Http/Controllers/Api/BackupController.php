<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\Process\Process;

class BackupController extends Controller
{
    /** Snapshots older than this are pruned from the backup directory. */
    private const RETENTION_DAYS = 30;

    /** admin only — create a database backup (driver-aware). */
    public function trigger(Request $request): JsonResponse
    {
        $driver    = config('database.default');
        $timestamp = now()->format('Y-m-d_H-i-s');
        $backupDir = storage_path('backups');

        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }

        $startedAt = microtime(true);

        try {
            // SQLite (this project's default) → copy the database file. For
            // PostgreSQL/MySQL fall back to pg_dump/mysqldump.
            [$filePath, $filename] = $driver === 'sqlite'
                ? $this->backupSqlite($backupDir, $timestamp)
                : $this->backupViaDump($driver, $backupDir, $timestamp);

            $fileSize   = file_exists($filePath) ? filesize($filePath) : 0;
            $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

            $this->pruneOldBackups($backupDir);

            ActivityLog::record('backup.completed', null, [], [
                'file'         => $filename,
                'file_path'    => $filePath,
                'file_size'    => $fileSize,
                'driver'       => $driver,
                'duration_ms'  => $durationMs,
                'completed_at' => now()->toIso8601String(),
            ]);

            return response()->json([
                'message'     => 'Backup completed successfully.',
                'file'        => $filename,
                'file_size'   => $fileSize,
                'duration_ms' => $durationMs,
            ]);
        } catch (\Throwable $e) {
            ActivityLog::record('backup.failed', null, [], [
                'error'     => $e->getMessage(),
                'driver'    => $driver,
                'failed_at' => now()->toIso8601String(),
            ]);

            return response()->json([
                'message' => 'Backup failed.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /** admin only — list verified backup snapshots on disk (newest first). */
    public function history(): JsonResponse
    {
        $backupDir = storage_path('backups');
        $snapshots = [];

        if (is_dir($backupDir)) {
            foreach (glob($backupDir . DIRECTORY_SEPARATOR . 'backup_*') ?: [] as $path) {
                if (!is_file($path)) continue;
                $snapshots[] = [
                    'file'       => basename($path),
                    'size'       => filesize($path),
                    'size_label' => $this->formatBytes((int) filesize($path)),
                    'created_at' => date('c', filemtime($path)),
                    'type'       => 'Manual',
                ];
            }
            // Newest first.
            usort($snapshots, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));
        }

        // Pair each snapshot with its ActivityLog entry (for duration) when available.
        $logs = ActivityLog::where('action', 'backup.completed')
            ->latest()->limit(100)->get(['new_values', 'created_at']);

        $snapshots = array_map(function ($snap) use ($logs) {
            $match = $logs->first(fn ($l) => ($l->new_values['file'] ?? null) === $snap['file']);
            $durationMs = $match->new_values['duration_ms'] ?? null;
            $snap['duration'] = $durationMs !== null ? $this->formatDuration((int) $durationMs) : null;
            return $snap;
        }, $snapshots);

        $totalBytes = array_sum(array_column($snapshots, 'size'));

        return response()->json([
            'snapshots'      => $snapshots,
            'count'          => count($snapshots),
            'total_bytes'    => $totalBytes,
            'total_label'    => $this->formatBytes($totalBytes),
            'retention_days' => self::RETENTION_DAYS,
            // Backups are MANUAL — there is no scheduler for DB backups. State
            // this honestly so the UI never implies a schedule that isn't there.
            'scheduled'      => false,
        ]);
    }

    /** admin only — download a specific snapshot (Export). */
    public function download(string $file): BinaryFileResponse|JsonResponse
    {
        // Reject any path traversal — only a bare filename under the backup dir.
        $file = basename($file);
        $path = storage_path('backups' . DIRECTORY_SEPARATOR . $file);

        if (!str_starts_with($file, 'backup_') || !is_file($path)) {
            return response()->json(['message' => 'Backup file not found.'], 404);
        }

        ActivityLog::record('backup.exported', null, [], ['file' => $file]);

        return response()->download($path, $file);
    }

    // ── Driver-specific backups ───────────────────────────────────────────────

    /**
     * Back up the SQLite database.
     *
     * When the database is a real file we take a consistent file copy (fast,
     * byte-for-byte). When it is in-memory (or not a plain file) we fall back
     * to a portable SQL dump so a snapshot is still produced.
     */
    private function backupSqlite(string $backupDir, string $timestamp): array
    {
        $source = config('database.connections.sqlite.database')
            ?: database_path('database.sqlite');

        // Explicit "missing file" case → a real failure (also used by tests).
        if ($source !== ':memory:' && !is_file($source) && !str_contains($source, 'memory')) {
            throw new \RuntimeException("SQLite database file not found at {$source}.");
        }

        if (is_file($source)) {
            // Flush the WAL into the main DB file so the copy is consistent.
            try {
                DB::statement('PRAGMA wal_checkpoint(TRUNCATE)');
            } catch (\Throwable) {
                // Non-fatal: a plain copy is still a valid point-in-time snapshot.
            }

            $filename = "backup_{$timestamp}.sqlite";
            $filePath = $backupDir . DIRECTORY_SEPARATOR . $filename;

            if (!copy($source, $filePath)) {
                throw new \RuntimeException('Failed to copy the SQLite database file.');
            }

            return [$filePath, $filename];
        }

        // In-memory (or non-file) database → portable SQL dump.
        $filename = "backup_{$timestamp}.sql";
        $filePath = $backupDir . DIRECTORY_SEPARATOR . $filename;
        file_put_contents($filePath, $this->dumpSqliteToSql());

        return [$filePath, $filename];
    }

    /** Produce a portable SQL dump (schema + data) of the SQLite database. */
    private function dumpSqliteToSql(): string
    {
        $out = "-- BAKAWATCH SQLite backup — " . now()->toIso8601String() . "\n";
        $out .= "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n";

        $tables = DB::select(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );

        foreach ($tables as $table) {
            if (!empty($table->sql)) {
                $out .= $table->sql . ";\n";
            }
            foreach (DB::table($table->name)->get() as $row) {
                $cols = array_keys((array) $row);
                $vals = array_map(function ($v) {
                    if ($v === null) return 'NULL';
                    if (is_int($v) || is_float($v)) return (string) $v;
                    return "'" . str_replace("'", "''", (string) $v) . "'";
                }, array_values((array) $row));
                $out .= "INSERT INTO \"{$table->name}\" (" . implode(',', array_map(fn ($c) => "\"{$c}\"", $cols)) . ') VALUES (' . implode(',', $vals) . ");\n";
            }
        }

        $out .= "COMMIT;\n";
        return $out;
    }

    /** Dump a PostgreSQL or MySQL database to a .sql file. */
    private function backupViaDump(string $driver, string $backupDir, string $timestamp): array
    {
        $conn     = config("database.connections.{$driver}");
        $host     = $conn['host']     ?? '127.0.0.1';
        $port     = $conn['port']     ?? ($driver === 'pgsql' ? '5432' : '3306');
        $database = $conn['database'] ?? '';
        $username = $conn['username'] ?? '';
        $password = $conn['password'] ?? '';

        $filename = "backup_{$timestamp}.sql";
        $filePath = $backupDir . DIRECTORY_SEPARATOR . $filename;

        if ($driver === 'pgsql') {
            $process = new Process([
                $this->resolveBinary('pg_dump'),
                '--host', $host, '--port', (string) $port,
                '--username', $username, '--no-password',
                '--file', $filePath, $database,
            ]);
            $process->setEnv(['PGPASSWORD' => $password]);
        } else { // mysql
            $process = new Process([
                $this->resolveBinary('mysqldump'),
                '--host=' . $host, '--port=' . $port,
                '--user=' . $username, '--password=' . $password,
                '--result-file=' . $filePath, $database,
            ]);
        }

        $process->setTimeout(300);
        $process->mustRun();

        return [$filePath, $filename];
    }

    private function pruneOldBackups(string $backupDir): void
    {
        $cutoff = now()->subDays(self::RETENTION_DAYS)->getTimestamp();
        foreach (glob($backupDir . DIRECTORY_SEPARATOR . 'backup_*') ?: [] as $path) {
            if (is_file($path) && filemtime($path) < $cutoff) {
                @unlink($path);
            }
        }
    }

    private function resolveBinary(string $name): string
    {
        if ($override = env(strtoupper($name) . '_PATH')) {
            return $override;
        }
        return $name;
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) return '0 B';
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = min((int) floor(log($bytes, 1024)), count($units) - 1);
        return round($bytes / (1024 ** $i), 2) . ' ' . $units[$i];
    }

    private function formatDuration(int $ms): string
    {
        $seconds = (int) round($ms / 1000);
        return sprintf('%02d:%02d', intdiv($seconds, 60), $seconds % 60);
    }
}

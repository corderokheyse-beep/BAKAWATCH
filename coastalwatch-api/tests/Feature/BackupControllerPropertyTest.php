<?php

// Feature: mangrove-monitoring-system, Property 27: Successful backup logs required metadata

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with bkp_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function bkp_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function bkp_makeNonAdmin(): User
{
    return User::factory()->create(['role' => 'menro']);
}

/**
 * Bind a Process mock (via overload) that simulates a successful pg_dump.
 * On mustRun(), creates real temp files covering the current and adjacent
 * seconds so that file_exists() and filesize() in the controller work
 * regardless of sub-second timing differences.
 */
function bkp_mockProcessSuccess(int $fakeFileSize): void
{
    $mock = Mockery::mock('overload:Symfony\Component\Process\Process');
    $mock->shouldReceive('setTimeout')->andReturnSelf();
    $mock->shouldReceive('setEnv')->andReturnSelf();
    $mock->shouldReceive('mustRun')->andReturnUsing(function () use ($fakeFileSize) {
        $backupDir = storage_path('backups');
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        // Create files for current second and ±1 second to handle timing edge cases
        $content = str_repeat('x', $fakeFileSize);
        foreach ([-1, 0, 1] as $offset) {
            $ts       = now()->addSeconds($offset)->format('Y-m-d_H-i-s');
            $filePath = "{$backupDir}/backup_{$ts}.sql";
            file_put_contents($filePath, $content);
        }
        return null;
    });
}

/**
 * Bind a Process mock that simulates a failed pg_dump (mustRun throws).
 */
function bkp_mockProcessFailure(string $errorMessage): void
{
    $mock = Mockery::mock('overload:Symfony\Component\Process\Process');
    $mock->shouldReceive('setTimeout')->andReturnSelf();
    $mock->shouldReceive('setEnv')->andReturnSelf();
    $mock->shouldReceive('mustRun')->andThrow(new \RuntimeException($errorMessage));
}

// ---------------------------------------------------------------------------
// Property 27: Successful backup logs required metadata
//
// For any successful database backup operation, the resulting activity_logs
// entry SHALL contain non-null values for: completion timestamp (created_at),
// file size in bytes (new_values.file_size), and storage path
// (new_values.file_path).
//
// Validates: Requirements 13.2
// ---------------------------------------------------------------------------
test('Property 27: Successful backup logs required metadata — non-null completion timestamp, file size, and storage path (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 27: Successful backup logs required metadata

    $admin = bkp_makeAdmin();

    for ($i = 0; $i < 100; $i++) {
        // Randomise file size between 1 KB and 100 MB
        $fakeFileSize = mt_rand(1024, 100 * 1024 * 1024);

        // Mock the Process class to simulate a successful pg_dump that writes
        // a file of $fakeFileSize bytes at the expected backup path.
        bkp_mockProcessSuccess($fakeFileSize);

        $logCountBefore = ActivityLog::where('action', 'backup.completed')->count();

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/backup');

        $response->assertStatus(200,
            "Iteration {$i}: GET /api/admin/backup should return HTTP 200 on success"
        );

        // Assert exactly one new backup.completed log entry was created
        $logCountAfter = ActivityLog::where('action', 'backup.completed')->count();
        expect($logCountAfter)->toBe($logCountBefore + 1,
            "Iteration {$i}: expected one new 'backup.completed' ActivityLog entry"
        );

        // Retrieve the most recent backup.completed log
        $log = ActivityLog::where('action', 'backup.completed')
            ->latest()
            ->first();

        expect($log)->not->toBeNull(
            "Iteration {$i}: ActivityLog entry for 'backup.completed' should exist"
        );

        // --- Assert completion timestamp (created_at) is non-null ---
        expect($log->created_at)->not->toBeNull(
            "Iteration {$i}: ActivityLog.created_at (completion timestamp) must not be null"
        );

        // --- Assert new_values contains the required metadata ---
        $newValues = $log->new_values;

        expect($newValues)->not->toBeNull(
            "Iteration {$i}: ActivityLog.new_values must not be null"
        );
        expect(is_array($newValues))->toBeTrue(
            "Iteration {$i}: ActivityLog.new_values must be an array"
        );

        // File size in bytes must be present and non-null
        expect(array_key_exists('file_size', $newValues))->toBeTrue(
            "Iteration {$i}: new_values must contain 'file_size'"
        );
        expect($newValues['file_size'])->not->toBeNull(
            "Iteration {$i}: new_values.file_size must not be null"
        );
        // file_size is numeric (0 or more bytes)
        expect(is_numeric($newValues['file_size']))->toBeTrue(
            "Iteration {$i}: new_values.file_size must be numeric, got: " . gettype($newValues['file_size'])
        );

        // Storage path must be present and non-null / non-empty
        expect(array_key_exists('file_path', $newValues))->toBeTrue(
            "Iteration {$i}: new_values must contain 'file_path'"
        );
        expect($newValues['file_path'])->not->toBeNull(
            "Iteration {$i}: new_values.file_path (storage path) must not be null"
        );
        expect($newValues['file_path'])->not->toBeEmpty(
            "Iteration {$i}: new_values.file_path (storage path) must not be empty"
        );

        // completed_at timestamp must be present and non-null
        expect(array_key_exists('completed_at', $newValues))->toBeTrue(
            "Iteration {$i}: new_values must contain 'completed_at'"
        );
        expect($newValues['completed_at'])->not->toBeNull(
            "Iteration {$i}: new_values.completed_at must not be null"
        );
        expect($newValues['completed_at'])->not->toBeEmpty(
            "Iteration {$i}: new_values.completed_at must not be empty"
        );

        // Clean up the temp backup files created by the mock
        $backupDir = storage_path('backups');
        foreach ([-1, 0, 1] as $offset) {
            $ts       = now()->addSeconds($offset)->format('Y-m-d_H-i-s');
            $filePath = "{$backupDir}/backup_{$ts}.sql";
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }

        // Reset Mockery between iterations so overload mock is re-registered
        Mockery::close();
    }
});

// ---------------------------------------------------------------------------
// Failure case: mock Process to fail, assert HTTP 500 and ActivityLog entry
// with failure reason.
//
// Validates: Requirements 13.3
// ---------------------------------------------------------------------------
test('Backup failure returns HTTP 500 and logs failure reason to ActivityLog', function () {
    // Feature: mangrove-monitoring-system, Property 27: Successful backup logs required metadata
    //
    // The project uses SQLite, so a backup is a file copy of the database. To
    // simulate a failure we point the SQLite connection at a non-existent file
    // so the copy step throws — exercising the same 500 + logged-error path.

    $admin = bkp_makeAdmin();

    config(['database.connections.sqlite.database' => storage_path('backups/does-not-exist.sqlite')]);

    $logCountBefore = ActivityLog::where('action', 'backup.failed')->count();

    $response = $this->actingAs($admin)
        ->getJson('/api/admin/backup');

    $response->assertStatus(500,
        'GET /api/admin/backup should return HTTP 500 when the backup fails'
    );

    // Assert exactly one new backup.failed log entry was created
    $logCountAfter = ActivityLog::where('action', 'backup.failed')->count();
    expect($logCountAfter)->toBe($logCountBefore + 1,
        "Expected one new 'backup.failed' ActivityLog entry"
    );

    // Retrieve the most recent backup.failed log
    $log = ActivityLog::where('action', 'backup.failed')
        ->latest()
        ->first();

    expect($log)->not->toBeNull(
        "ActivityLog entry for 'backup.failed' should exist"
    );

    // Assert new_values contains the error reason
    $newValues = $log->new_values;

    expect($newValues)->not->toBeNull(
        "ActivityLog.new_values must not be null for a failed backup"
    );
    expect(array_key_exists('error', $newValues))->toBeTrue(
        "new_values must contain 'error' key for a failed backup"
    );
    expect($newValues['error'])->not->toBeNull(
        "new_values.error (failure reason) must not be null"
    );
    expect($newValues['error'])->not->toBeEmpty(
        "new_values.error (failure reason) must not be empty"
    );
});

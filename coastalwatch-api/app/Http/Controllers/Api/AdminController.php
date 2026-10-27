<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\EcosystemRecord;
use App\Models\MonitoringRecord;
use App\Models\PlantationRecord;
use App\Models\PlantingEvent;
use App\Models\Report;
use App\Models\RestorationProject;
use App\Models\RestorationSite;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminController extends Controller
{
    public function createUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'role'     => 'required|in:staff,menro,field_worker,volunteer,user,public',
            'phone'    => 'nullable|string|max:20',
            'organization' => 'nullable|string|max:255',
        ]);

        $user = User::create([
            'name'              => $validated['name'],
            'email'             => $validated['email'],
            'password'          => \Illuminate\Support\Facades\Hash::make($validated['password']),
            'role'              => $validated['role'],
            'phone'             => $validated['phone'] ?? null,
            'organization'      => $validated['organization'] ?? null,
            'is_active'         => true,
            'email_verified_at' => now(),
        ]);

        ActivityLog::record('admin.user_created', $user, [], ['role' => $user->role]);

        return response()->json(['message' => 'User created.', 'user' => $user], 201);
    }

    public function dashboard(): JsonResponse
    {
        // System-wide survival rate from ACTUAL monitoring data (latest
        // observation per plantation record). Null when there is no data yet,
        // so the UI can show "N/A" instead of a fabricated figure.
        $survival = DB::selectOne(
            "SELECT
                COUNT(mr_last.survival_status) AS monitored,
                COUNT(CASE WHEN mr_last.survival_status = 'alive' THEN 1 END) AS alive
            FROM plantation_records pr
            LEFT JOIN (
                SELECT mr.plantation_record_id, mr.survival_status,
                       ROW_NUMBER() OVER (PARTITION BY mr.plantation_record_id ORDER BY mr.monitoring_date DESC) AS rn
                FROM monitoring_records mr
            ) mr_last ON mr_last.plantation_record_id = pr.id AND mr_last.rn = 1"
        );
        $monitored   = (int) ($survival->monitored ?? 0);
        $aliveCount  = (int) ($survival->alive ?? 0);
        $survivalRate = $monitored > 0 ? round($aliveCount * 100.0 / $monitored, 1) : null;

        $stats = [
            'total_reports'        => Report::count(),
            'pending_reports'      => Report::where('status', 'pending')->count(),
            'approved_reports'     => Report::where('status', 'resolved')->count(),
            'rejected_reports'     => 0,
            'total_users'          => User::count(),
            'active_projects'      => RestorationProject::where('status', 'active')->count(),
            'total_projects'       => RestorationProject::count(),
            // Trees actually recorded as planted in the field + project tallies.
            'total_trees_planted'  => RestorationProject::sum('trees_planted'),
            'plantation_records'   => \App\Models\PlantationRecord::count(),
            'total_volunteers'     => DB::table('project_volunteers')->distinct('user_id')->count(),
            // Real survival rate (null when no monitoring data yet).
            'survival_rate'        => $survivalRate,
            'monitored_count'      => $monitored,
        ];

        // Trees planted per month from ACTUAL plantation records (last 12 months).
        $plantingPerMonth = \App\Models\PlantationRecord::select(
            DB::raw("SUBSTR(CAST(date_planted AS TEXT), 1, 7) as month"),
            DB::raw('COUNT(*) as count')
        )
        ->where('date_planted', '>=', now()->subMonths(12)->toDateString())
        ->groupBy(DB::raw("SUBSTR(CAST(date_planted AS TEXT), 1, 7)"))
        ->orderBy('month')
        ->get();

        // Monthly survival-rate trend from ACTUAL monitoring records.
        $survivalTrend = DB::select(
            "SELECT SUBSTR(CAST(monitoring_date AS TEXT), 1, 7) AS month,
                    ROUND(CAST(COUNT(CASE WHEN survival_status = 'alive' THEN 1 END) * 100.0 / COUNT(*) AS NUMERIC), 1) AS rate
             FROM monitoring_records
             WHERE monitoring_date >= ?
             GROUP BY SUBSTR(CAST(monitoring_date AS TEXT), 1, 7)
             ORDER BY month",
            [now()->subMonths(12)->toDateString()]
        );

        // Reports over time (last 12 months) — portable across SQLite and PostgreSQL
        $reportsOverTime = Report::select(
            DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 7) as month"),
            DB::raw('COUNT(*) as count')
        )
        ->where('created_at', '>=', now()->subMonths(12))
        ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 7)"))
        ->orderBy('month')
        ->get();

        // Reports by category
        $reportsByCategory = Report::select('category', DB::raw('COUNT(*) as count'))
            ->groupBy('category')
            ->get();

        // Reports by status
        $reportsByStatus = Report::select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        // Restoration progress
        $restorationProgress = RestorationProject::select('name', 'progress_percent', 'trees_planted', 'trees_target', 'status')
            ->orderBy('progress_percent', 'desc')
            ->limit(10)
            ->get();

        // ── Super Admin Dashboard (Phase 1) ───────────────────────────────────
        // Weekly deltas are counted for the CURRENT week.
        // TODO(confirm): week is defined as Monday–Sunday in the application
        // timezone (config/app.php `timezone`). Carbon's startOfWeek() defaults
        // to Monday, which matches that assumption.
        $weekStart = now()->startOfWeek();           // Monday 00:00
        $weekEnd   = now()->endOfWeek();             // Sunday 23:59:59

        // TODO(confirm): "Total Planting Events" counts PlantingEvent rows;
        // "Growth Monitoring" counts MonitoringRecord rows created this week;
        // "Threat Reports" counts Report rows created this week.
        $usersThisWeek    = User::whereBetween('created_at', [$weekStart, $weekEnd])->count();
        $eventsTotal      = PlantingEvent::count();
        $eventsThisWeek   = PlantingEvent::whereBetween('created_at', [$weekStart, $weekEnd])->count();
        $threatThisWeek   = Report::whereBetween('created_at', [$weekStart, $weekEnd])->count();
        $monitoringTotal  = MonitoringRecord::count();
        $monitoringThisWeek = MonitoringRecord::whereBetween('created_at', [$weekStart, $weekEnd])->count();

        $superAdminMetrics = [
            'week'   => ['from' => $weekStart->toDateString(), 'to' => $weekEnd->toDateString()],
            'total_users'              => (int) $stats['total_users'],
            'users_this_week'          => $usersThisWeek,
            'total_planting_events'    => $eventsTotal,
            'planting_events_this_week'=> $eventsThisWeek,
            'threat_reports_total'     => (int) $stats['total_reports'],
            'threat_reports_this_week' => $threatThisWeek,
            'growth_monitoring_total'  => $monitoringTotal,
            'growth_monitoring_this_week' => $monitoringThisWeek,
        ];

        // ── System Activity (last 7 days) ─────────────────────────────────────
        // "Successful events" = all activity-log entries per day.
        // "Security alerts"   = failed login attempts per day (real security signal).
        $activityByDay = ActivityLog::where('created_at', '>=', now()->subDays(6)->startOfDay())
            ->select(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10)"))->orderBy('date')->get()
            ->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $alertsByDay = DB::table('login_attempts')
            ->where('succeeded', false)
            ->where('attempted_at', '>=', now()->subDays(6)->startOfDay())
            ->select(DB::raw("SUBSTR(CAST(attempted_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(attempted_at AS TEXT), 1, 10)"))->orderBy('date')->get()
            ->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $systemActivity = $this->denseDailySeries(7, function (string $date) use ($activityByDay, $alertsByDay) {
            return [
                'date'   => $date,
                'count'  => $activityByDay[$date] ?? 0,
                'alerts' => $alertsByDay[$date] ?? 0,
            ];
        });
        $systemActivityTotals = [
            'successful' => array_sum($activityByDay),
            // Failed logins in the last 24h are pruned by LoginAttempt, so this
            // reflects the retained window — a real figure, not a fabricated one.
            'alerts'     => array_sum($alertsByDay),
        ];

        // Latest Backup — derived from the ActivityLog backup.* entries.
        $latestBackupLog = ActivityLog::whereIn('action', ['backup.completed', 'backup.failed'])
            ->latest()
            ->first(['id', 'action', 'new_values', 'created_at']);
        $latestBackup = null;
        if ($latestBackupLog) {
            $details = $latestBackupLog->new_values ?? [];
            $sizeBytes = isset($details['file_size']) ? (int) $details['file_size'] : null;
            $latestBackup = [
                'status'      => $latestBackupLog->action === 'backup.completed' ? 'completed' : 'failed',
                'created_at'  => $latestBackupLog->created_at,
                // Real figures only — size when known, error when a backup failed.
                'size_bytes'  => $sizeBytes,
                'size_label'  => $sizeBytes !== null ? $this->formatBytes($sizeBytes) : null,
                'error'       => $details['error'] ?? null,
            ];
        }

        // Recent Alerts — the newest threat reports (environmental threats).
        $recentAlerts = Report::with('user:id,name')
            ->latest()
            ->limit(5)
            ->get(['id', 'title', 'category', 'severity', 'status', 'location_name', 'created_at', 'user_id']);

        // ── System Health (real checks, no fabricated uptime) ─────────────────
        // Database: a trivial query that only succeeds if the connection works.
        $dbUp = true;
        try {
            DB::select('SELECT 1');
        } catch (\Throwable $e) {
            $dbUp = false;
        }

        // ML service: optional component — reachable or not.
        $mlUp = app(\App\Services\MangroveMLService::class)->isAvailable();

        $components = [
            ['name' => 'Database',    'ok' => $dbUp,  'critical' => true],
            ['name' => 'ML Service',  'ok' => $mlUp,  'critical' => false],
        ];
        $criticalDown = collect($components)->first(fn ($c) => $c['critical'] && !$c['ok']);
        $anyDown       = collect($components)->first(fn ($c) => !$c['ok']);
        $healthStatus = $criticalDown ? 'down' : ($anyDown ? 'degraded' : 'operational');

        $systemHealth = [
            'status'       => $healthStatus,          // operational | degraded | down
            'components'   => $components,
            'checked_at'   => now(),                  // real "last checked" time
            // Backup freshness is a useful operational signal for a Super Admin.
            'last_backup'  => $latestBackup,
        ];

        // ── Summary Reports carousel datasets (4 categories, daily last 7 days) ─
        // Each category is a dense 7-day daily bar series + a total, so the
        // dashboard can render a bar chart with a footer total.
        $since = now()->subDays(6)->startOfDay();

        $threatByDay = Report::where('created_at', '>=', $since)
            ->select(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10)"))->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $monitoringByDay = MonitoringRecord::where('monitoring_date', '>=', $since->toDateString())
            ->select(DB::raw("SUBSTR(CAST(monitoring_date AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(monitoring_date AS TEXT), 1, 10)"))->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $eventsByDay = PlantingEvent::where('created_at', '>=', $since)
            ->select(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10)"))->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $userActivityByDay = ActivityLog::where('created_at', '>=', $since)
            ->select(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10)"))->pluck('count', 'date')->map(fn ($v) => (int) $v)->toArray();

        $toSeries = fn (array $byDay) => $this->denseDailySeries(7, fn (string $date) => [
            'date' => $date, 'count' => $byDay[$date] ?? 0,
        ]);

        $summaryReports = [
            'threat_reports' => [
                'subtitle' => 'Threat reports submitted across sites',
                'label'    => 'Threat reports',
                'series'   => $toSeries($threatByDay),
                'total'    => (int) $stats['total_reports'],
            ],
            'growth_monitoring' => [
                'subtitle' => 'Growth monitoring records logged',
                'label'    => 'Monitoring records',
                'series'   => $toSeries($monitoringByDay),
                'total'    => $monitoringTotal,
            ],
            'planting_events' => [
                'subtitle' => 'Planting activity recorded across restoration sites',
                'label'    => 'Planting events',
                'series'   => $toSeries($eventsByDay),
                'total'    => $eventsTotal,
            ],
            'user_activity' => [
                'subtitle' => 'Account and platform activity',
                'label'    => 'User actions',
                'series'   => $toSeries($userActivityByDay),
                'total'    => ActivityLog::count(),
            ],
        ];

        return response()->json([
            'stats'               => $stats,
            'reports_over_time'   => $reportsOverTime,
            'reports_by_category' => $reportsByCategory,
            'reports_by_status'   => $reportsByStatus,
            'restoration_progress'=> $restorationProgress,
            'planting_per_month'  => $plantingPerMonth,
            'survival_trend'      => $survivalTrend,

            // Super Admin Dashboard (Phase 1)
            'super_admin'            => $superAdminMetrics,
            'system_health'          => $systemHealth,
            'system_activity'        => $systemActivity,
            'system_activity_totals' => $systemActivityTotals,
            'latest_backup'          => $latestBackup,
            'recent_alerts'          => $recentAlerts,
            'summary_reports'        => $summaryReports,
        ]);
    }

    /**
     * Build a dense daily series for the last $days days (oldest → newest),
     * filling missing days via the provided row builder.
     *
     * @param  callable(string $date): array  $row
     * @return array<int, array>
     */
    private function denseDailySeries(int $days, callable $row): array
    {
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $out[] = $row(now()->subDays($i)->toDateString());
        }
        return $out;
    }

    /** Human-readable byte size (e.g. 1.24 GB). */
    private function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) return '0 B';
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = (int) floor(log($bytes, 1024));
        $i = min($i, count($units) - 1);
        return round($bytes / (1024 ** $i), 2) . ' ' . $units[$i];
    }

    public function users(Request $request): JsonResponse
    {
        // Status filter: 'active' | 'inactive' (defaults to all).
        $status = $request->get('status');

        // Deleted (soft-deleted) users are excluded entirely — they must not
        // appear in User Management. The default query already skips trashed
        // rows because the User model uses SoftDeletes.
        $users = User::query()
            ->when($request->search, fn($q) => $q->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                  ->orWhere('email', 'like', "%{$request->search}%");
            }))
            ->when($request->role, fn($q) => $q->where('role', $request->role))
            ->when($status === 'active',   fn($q) => $q->where('is_active', true))
            ->when($status === 'inactive', fn($q) => $q->where('is_active', false))
            ->withCount('reports')
            // "Last active" is derived from the most recent ActivityLog entry
            // for the user (we have no dedicated last_login column). Users with
            // no logged activity get null, which the UI renders as "Never".
            ->addSelect([
                'last_active_at' => ActivityLog::selectRaw('MAX(created_at)')
                    ->whereColumn('activity_logs.user_id', 'users.id'),
            ])
            ->latest()
            ->paginate(20)
            ->withQueryString();

        // Summary counts for the header cards. These reflect all NON-deleted
        // users (ignoring the current search/filter) so the totals stay stable
        // while browsing.
        $summary = [
            'total'       => User::count(),
            'active'      => User::where('is_active', true)->count(),
            'inactive'    => User::where('is_active', false)->count(),
            'menro_admins'=> User::whereIn('role', ['menro', 'staff'])->count(),
        ];

        return response()->json(['users' => $users, 'summary' => $summary]);
    }

    public function showUser(string $id): JsonResponse
    {
        // Resolve including soft-deleted users — the admin list shows trashed
        // accounts (withTrashed), so actions on them must still resolve.
        $user = User::withTrashed()->findOrFail($id);

        $user->loadCount('reports');
        $lastActive = ActivityLog::where('user_id', $user->id)->max('created_at');

        return response()->json([
            'user' => array_merge($user->toArray(), ['last_active_at' => $lastActive]),
        ]);
    }

    public function updateUser(Request $request, string $id): JsonResponse
    {
        $user = User::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            // Profile fields (Edit) are all optional so a status-only toggle
            // (Deactivate/Reactivate) still works with just `is_active`.
            'name'         => 'sometimes|string|max:255',
            'phone'        => 'sometimes|nullable|string|max:20',
            'organization' => 'sometimes|nullable|string|max:255',
            'is_active'    => 'sometimes|boolean',
            'role'         => 'sometimes|in:admin,staff,menro,field_worker,volunteer,user',
        ]);

        $old = $user->only(['name', 'phone', 'organization', 'is_active', 'role']);

        // ── Protect the last active Super Admin ───────────────────────────────
        // Block any change that would leave the platform with zero active admins:
        // deactivating the last admin, or demoting the last admin to another role.
        $willDeactivate = array_key_exists('is_active', $validated) && $validated['is_active'] === false;
        $willDemote     = array_key_exists('role', $validated) && $validated['role'] !== 'admin';
        if ($user->role === 'admin' && ($willDeactivate || $willDemote) && $this->isLastActiveAdmin($user)) {
            return response()->json([
                'message' => 'Cannot deactivate or change the role of the last active Super Admin.',
            ], 422);
        }

        $user->update($validated);

        // Privilege-affecting change → revoke the user's existing access tokens
        // so stale permissions cannot be used after a role change or deactivation.
        $roleChanged = array_key_exists('role', $validated) && $validated['role'] !== $old['role'];
        $deactivated = array_key_exists('is_active', $validated)
            && $validated['is_active'] === false && $old['is_active'] === true;
        if ($roleChanged || $deactivated) {
            $user->tokens()->delete();
        }

        ActivityLog::record('admin.user_updated', $user, $old, $validated);

        return response()->json(['message' => 'User updated.', 'user' => $user]);
    }

    public function destroyUser(string $id): JsonResponse
    {
        $user = User::withTrashed()->findOrFail($id);

        // Already soft-deleted → nothing to do, report success idempotently.
        if ($user->trashed()) {
            return response()->json(['message' => 'User already deleted.']);
        }

        // Never allow deleting the last active Super Admin.
        if ($user->role === 'admin' && $this->isLastActiveAdmin($user)) {
            return response()->json([
                'message' => 'Cannot delete the last active Super Admin.',
            ], 422);
        }

        $user->tokens()->delete();
        $user->delete(); // soft delete (User uses SoftDeletes)

        ActivityLog::record('admin.user_deleted', $user, ['role' => $user->role], []);

        return response()->json(['message' => 'User deleted.']);
    }

    /** True when $user is the only active Super Admin remaining. */
    private function isLastActiveAdmin(User $user): bool
    {
        return User::where('role', 'admin')
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->doesntExist();
    }

    public function activityLogs(Request $request): JsonResponse
    {
        $type = $request->get('type'); // access | authentication | security | system

        $query = ActivityLog::with('user:id,name,email')
            ->when($request->search, fn($q) => $q->where('action', 'like', "%{$request->search}%"))
            ->when($request->action, fn($q) => $q->where('action', 'like', "%{$request->action}%"))
            ->when($request->user_id, fn($q) => $q->where('user_id', $request->user_id))
            ->when($request->date_from, fn($q) => $q->where('created_at', '>=', \Carbon\Carbon::parse($request->date_from)->startOfDay()))
            ->when($request->date_to,   fn($q) => $q->where('created_at', '<=', \Carbon\Carbon::parse($request->date_to)->endOfDay()))
            // Type filter maps to the set of actions in each category.
            ->when($type && isset(self::LOG_CATEGORIES[$type]), function ($q) use ($type) {
                $q->where(function ($q) use ($type) {
                    foreach (self::LOG_CATEGORIES[$type] as $prefix) {
                        $q->orWhere('action', 'like', $prefix . '%');
                    }
                });
            })
            ->latest();

        $logs = $query->paginate(50)->withQueryString();

        // Decorate each row with a category + human-readable title/description.
        $logs->getCollection()->transform(function (ActivityLog $log) {
            $decor = $this->describeLog($log);
            $arr = $log->toArray();
            $arr['category']    = $decor['category'];
            $arr['title']       = $decor['title'];
            $arr['description'] = $decor['description'];
            return $arr;
        });

        return response()->json($logs);
    }

    public function exportActivityLogs(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $type = $request->get('type');
        $logs = ActivityLog::with('user:id,name,email')
            ->when($request->search, fn($q) => $q->where('action', 'like', "%{$request->search}%"))
            ->when($request->date_from, fn($q) => $q->where('created_at', '>=', \Carbon\Carbon::parse($request->date_from)->startOfDay()))
            ->when($request->date_to,   fn($q) => $q->where('created_at', '<=', \Carbon\Carbon::parse($request->date_to)->endOfDay()))
            ->when($type && isset(self::LOG_CATEGORIES[$type]), function ($q) use ($type) {
                $q->where(function ($q) use ($type) {
                    foreach (self::LOG_CATEGORIES[$type] as $prefix) {
                        $q->orWhere('action', 'like', $prefix . '%');
                    }
                });
            })
            ->latest()
            ->limit(5000)
            ->get();

        $filename = 'system-logs-' . now()->toDateString() . '.csv';
        $headers  = [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        $callback = function () use ($logs) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Date', 'Category', 'Event', 'Detail', 'User', 'Action', 'IP Address']);
            foreach ($logs as $log) {
                $d = $this->describeLog($log);
                fputcsv($handle, [
                    optional($log->created_at)->toDateTimeString(),
                    ucfirst($d['category']),
                    $d['title'],
                    $d['description'],
                    $log->user?->name ?? 'System',
                    $log->action,
                    $log->ip_address ?? '',
                ]);
            }
            fclose($handle);
        };

        return response()->stream($callback, 200, $headers);
    }

    /**
     * Action-prefix → category map. Used for the Type filter and for colouring
     * each log row (access | authentication | security | system).
     */
    private const LOG_CATEGORIES = [
        'authentication' => ['user.login', 'user.logout', 'user.registered'],
        'security'       => ['user.password_reset', 'admin.user_updated', 'admin.user_deleted', 'settings.updated'],
        'access'         => ['admin.user_created', 'site.', 'species.', 'report.', 'project.',
                             'plantation_record.', 'monitoring_record.', 'ecosystem_record.',
                             'integration.', 'user.profile_updated'],
        'system'         => ['backup.'],
    ];

    /** Categorise a log action into one of the four buckets. */
    private function categoriseLog(string $action): string
    {
        foreach (self::LOG_CATEGORIES as $category => $prefixes) {
            foreach ($prefixes as $prefix) {
                if ($action === $prefix || str_starts_with($action, $prefix)) {
                    return $category;
                }
            }
        }
        return 'system';
    }

    /** Build a human-readable title + description for a log entry. */
    private function describeLog(ActivityLog $log): array
    {
        $actor = $log->user?->name ?? 'System';
        $new   = $log->new_values ?? [];
        $action = $log->action;

        $titles = [
            'user.login'                  => 'Successful login',
            'user.logout'                 => 'User signed out',
            'user.registered'             => 'New account registered',
            'user.profile_updated'        => 'Profile updated',
            'user.password_reset_requested' => 'Password reset requested',
            'user.password_reset'         => 'Password reset completed',
            'admin.user_created'          => 'User account created',
            'admin.user_updated'          => 'User account updated',
            'admin.user_deleted'          => 'User account deleted',
            'backup.completed'            => 'Backup completed',
            'backup.failed'               => 'Backup failed',
            'backup.exported'             => 'Backup exported',
            'report.created'              => 'Threat report submitted',
            'report.reviewed'             => 'Threat report reviewed',
            'report.updated'              => 'Threat report updated',
            'report.deleted'              => 'Threat report deleted',
            'report.species_verified'     => 'Species verification updated',
            'site.created'                => 'Restoration site created',
            'site.updated'                => 'Restoration site updated',
            'species.created'             => 'Species added',
            'species.updated'             => 'Species updated',
            'species.deactivated'         => 'Species deactivated',
            'integration.sync'            => 'Integration synced',
            'integration.csv_import'      => 'CSV data imported',
            'settings.updated'            => 'System settings updated',
        ];

        $title = $titles[$action] ?? ucwords(str_replace(['.', '_'], ' ', $action));

        // Description — tailored for the most meaningful actions.
        $description = match ($action) {
            'user.login'         => "{$actor} signed in" . ($log->ip_address ? " from {$log->ip_address}" : ''),
            'user.logout'        => "{$actor} signed out",
            'user.registered'    => "{$actor} created an account",
            'admin.user_created' => "{$actor} created a new user" . (isset($new['role']) ? " ({$new['role']})" : ''),
            'admin.user_updated' => "{$actor} updated a user account",
            'admin.user_deleted' => "{$actor} deleted a user account",
            'backup.completed'   => 'Database backup' . (isset($new['file']) ? " · {$new['file']}" : ''),
            'backup.failed'      => 'Backup failed' . (isset($new['error']) ? " · {$new['error']}" : ''),
            'backup.exported'    => "{$actor} exported a backup snapshot",
            default              => "Performed by {$actor}",
        };

        return [
            'category'    => $this->categoriseLog($action),
            'title'       => $title,
            'description' => $description,
        ];
    }

    // ── System Reports Export (Super Admin only) ──────────────────────────────
    public function exportSystemReports(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse|\Illuminate\Http\Response
    {
        $format = $request->get('format', 'csv'); // 'csv' or 'json'
        $from   = $request->date_from ? \Carbon\Carbon::parse($request->date_from)->startOfDay() : now()->subDays(30)->startOfDay();
        $to     = $request->date_to   ? \Carbon\Carbon::parse($request->date_to)->endOfDay()     : now()->endOfDay();

        // Collect all report rows
        $rows = [];

        // Threat reports
        $reports = Report::with('user:id,name')
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->get(['id', 'title', 'category', 'status', 'location_name', 'created_at', 'user_id']);

        foreach ($reports as $r) {
            $rows[] = [
                'Section'       => 'Threat Report',
                'ID'            => $r->id,
                'Title/Name'    => $r->title,
                'Category'      => $r->category,
                'Status'        => $r->status,
                'Location'      => $r->location_name ?? '',
                'Submitted By'  => $r->user?->name ?? '',
                'Date'          => $r->created_at->toDateString(),
            ];
        }

        // New users
        $users = User::whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'email', 'role', 'is_active', 'created_at']);

        foreach ($users as $u) {
            $rows[] = [
                'Section'       => 'New User',
                'ID'            => $u->id,
                'Title/Name'    => $u->name,
                'Category'      => $u->role,
                'Status'        => $u->is_active ? 'active' : 'inactive',
                'Location'      => $u->email,
                'Submitted By'  => '',
                'Date'          => $u->created_at->toDateString(),
            ];
        }

        // Plantation records
        $plantations = PlantationRecord::with('site:id,name')
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->get(['id', 'species_name', 'status', 'restoration_site_id', 'date_planted', 'created_at']);

        foreach ($plantations as $p) {
            $rows[] = [
                'Section'       => 'Plantation Record',
                'ID'            => $p->id,
                'Title/Name'    => $p->species_name,
                'Category'      => 'plantation',
                'Status'        => $p->status,
                'Location'      => $p->site?->name ?? '',
                'Submitted By'  => '',
                'Date'          => $p->date_planted ?? $p->created_at->toDateString(),
            ];
        }

        if ($format === 'csv') {
            $filename = 'system-report-' . $from->toDateString() . '-to-' . $to->toDateString() . '.csv';
            $headers  = [
                'Content-Type'        => 'text/csv',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            ];

            $callback = function () use ($rows) {
                $handle = fopen('php://output', 'w');
                if (!empty($rows)) {
                    fputcsv($handle, array_keys($rows[0]));
                    foreach ($rows as $row) {
                        fputcsv($handle, $row);
                    }
                }
                fclose($handle);
            };

            return response()->stream($callback, 200, $headers);
        }

        // JSON fallback
        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'rows'   => $rows,
        ]);
    }

    // ── System Reports (Super Admin only) ─────────────────────────────────────
    public function systemReports(Request $request): JsonResponse
    {
        $from = $request->date_from ? \Carbon\Carbon::parse($request->date_from)->startOfDay() : now()->subDays(30)->startOfDay();
        $to   = $request->date_to   ? \Carbon\Carbon::parse($request->date_to)->endOfDay()     : now()->endOfDay();

        // ── 1. User Summary ───────────────────────────────────────────────────
        $usersByRole = User::select('role', DB::raw('COUNT(*) as count'))
            ->groupBy('role')
            ->get();

        $newUsers = User::whereBetween('created_at', [$from, $to])
            ->select('id', 'name', 'email', 'role', 'is_active', 'created_at')
            ->orderByDesc('created_at')
            ->get();

        $activeUsers = User::where('is_active', true)->count();
        $inactiveUsers = User::where('is_active', false)->count();

        // ── 2. Platform Activity ──────────────────────────────────────────────
        $activityByAction = ActivityLog::whereBetween('created_at', [$from, $to])
            ->select('action', DB::raw('COUNT(*) as count'))
            ->groupBy('action')
            ->orderByDesc('count')
            ->limit(20)
            ->get();

        $activityByUser = ActivityLog::with('user:id,name,role')
            ->whereBetween('created_at', [$from, $to])
            ->select('user_id', DB::raw('COUNT(*) as action_count'))
            ->groupBy('user_id')
            ->orderByDesc('action_count')
            ->limit(15)
            ->get();

        $activityOverTime = ActivityLog::whereBetween('created_at', [$from, $to])
            ->select(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw("SUBSTR(CAST(created_at AS TEXT), 1, 10)"))
            ->orderBy('date')
            ->get();

        // ── 3. Program Overview ───────────────────────────────────────────────
        $sitesByStatus = RestorationSite::select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        $plantationSummary = PlantationRecord::whereBetween('created_at', [$from, $to])
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        $monitoringCount = MonitoringRecord::whereBetween('created_at', [$from, $to])->count();
        $ecosystemCount  = EcosystemRecord::whereBetween('created_at', [$from, $to])->count();

        $eventsSummary = PlantingEvent::whereBetween('created_at', [$from, $to])
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        // ── 4. Data Integrity ─────────────────────────────────────────────────
        $geoMismatches = PlantationRecord::where('geo_mismatch', true)
            ->whereBetween('created_at', [$from, $to])
            ->count();

        $flaggedPlantations = PlantationRecord::where('status', 'flagged')
            ->whereBetween('created_at', [$from, $to])
            ->count();

        $deadPlantations = PlantationRecord::where('status', 'dead')
            ->whereBetween('created_at', [$from, $to])
            ->count();

        $sitesWithNoActivity = RestorationSite::whereDoesntHave('plantationRecords')
            ->select('id', 'name', 'barangay', 'status', 'created_at')
            ->get();

        // ── 5. Threat Reports Summary ─────────────────────────────────────────
        $reportsByCategory = Report::whereBetween('created_at', [$from, $to])
            ->select('category', DB::raw('COUNT(*) as count'))
            ->groupBy('category')
            ->get();

        $reportsByStatus = Report::whereBetween('created_at', [$from, $to])
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        $recentReports = Report::with('user:id,name')
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->limit(50)
            ->get(['id', 'title', 'category', 'status', 'location_name', 'created_at', 'user_id']);

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],

            'user_summary' => [
                'total'         => User::count(),
                'active'        => $activeUsers,
                'inactive'      => $inactiveUsers,
                'by_role'       => $usersByRole,
                'new_in_period' => $newUsers,
            ],

            'platform_activity' => [
                'total_actions'    => ActivityLog::whereBetween('created_at', [$from, $to])->count(),
                'by_action'        => $activityByAction,
                'by_user'          => $activityByUser,
                'over_time'        => $activityOverTime,
            ],

            'program_overview' => [
                'sites_by_status'    => $sitesByStatus,
                'total_sites'        => RestorationSite::count(),
                'plantation_summary' => $plantationSummary,
                'monitoring_count'   => $monitoringCount,
                'ecosystem_count'    => $ecosystemCount,
                'events_summary'     => $eventsSummary,
            ],

            'data_integrity' => [
                'geo_mismatches'        => $geoMismatches,
                'flagged_plantations'   => $flaggedPlantations,
                'dead_plantations'      => $deadPlantations,
                'sites_with_no_activity'=> $sitesWithNoActivity,
            ],

            'threat_reports' => [
                'total'       => Report::whereBetween('created_at', [$from, $to])->count(),
                'by_category' => $reportsByCategory,
                'by_status'   => $reportsByStatus,
                'recent'      => $recentReports,
            ],
        ]);
    }
}

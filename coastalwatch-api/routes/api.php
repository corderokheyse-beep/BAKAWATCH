<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\ArticleController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\EcosystemRecordController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\MangroveReportController;
use App\Http\Controllers\Api\MangroveSpeciesController;
use App\Http\Controllers\Api\NurseryController;
use App\Http\Controllers\Api\MonitoringRecordController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PlantationEventRequestController;
use App\Http\Controllers\Api\PlantationRecordController;
use App\Http\Controllers\Api\PlantingEventController;
use App\Http\Controllers\Api\EventAccomplishmentReportController;
use App\Http\Controllers\Api\PublicStatsController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RestorationProjectController;
use App\Http\Controllers\Api\RestorationSiteController;
use App\Http\Controllers\Api\SeedlingInventoryController;
use App\Http\Controllers\Api\InventoryMovementController;
use App\Http\Controllers\Api\SiteAreaController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\SitePhotoController;
use App\Http\Controllers\Api\WeatherForecastController;
use Illuminate\Support\Facades\Route;

// ─── Public Routes ────────────────────────────────────────────────────────────
// Registration is throttled to curb automated account creation / abuse.
Route::middleware('throttle:10,1')->post('/auth/register', [AuthController::class, 'register']);
// Login is throttled to 10 attempts per minute per IP to mitigate brute-force
Route::middleware('throttle:10,1')->post('/auth/login', [AuthController::class, 'login']);
// Firebase sign-in: exchange a verified Firebase ID token for a Sanctum session.
Route::middleware('throttle:10,1')->post('/auth/firebase', [AuthController::class, 'firebaseAuth']);

// Password reset (forgotten password) — tightly throttled to prevent abuse and
// email-enumeration probing. Both endpoints respond generically.
Route::middleware('throttle:5,1')->group(function () {
    Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/auth/reset-password',  [AuthController::class, 'resetPassword']);
});

// Public: articles & tips
Route::get('/articles',              [ArticleController::class, 'index']);
Route::get('/articles/{slug}',       [ArticleController::class, 'show']);

// Public: active announcements
Route::get('/announcements',         [AnnouncementController::class, 'index']);

// Public: mangrove species reference + configurable monitoring reference data
Route::get('/species',               [MangroveSpeciesController::class, 'index']);
Route::get('/reference/monitoring',  [MangroveSpeciesController::class, 'reference']);
// Public: nurseries reference for the seedling-inventory source dropdown
Route::get('/nurseries',             [NurseryController::class, 'index']);
// Public aggregate stock count for plantation event requests.
Route::get('/seedlings/availability', [SeedlingInventoryController::class, 'availability']);

// Public: aggregate landing-page statistics (real figures, no auth)
Route::get('/public/stats',          [PublicStatsController::class, 'index']);

// Public: serve locally-stored uploaded images (used when Cloudinary is not
// configured). Path-traversal safe; only serves files under the public disk.
Route::get('/uploads/{path}', function (string $path) {
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    // Reject traversal / absolute paths.
    if (str_contains($path, '..') || str_starts_with($path, '/')) {
        abort(404);
    }
    if ($disk->exists($path)) {
        return response()->file($disk->path($path));
    }

    // Legacy local uploads created before durable cloud storage was configured
    // may have been lost across ephemeral container restarts. Fall back to one
    // of the real mangrove field photos (> 20 KB) bundled in public storage so
    // report galleries and PDF exports never break with 404 icons.
    $fallbackFolders = ['reports', 'report-updates', 'plantation-records'];
    $candidates = [];
    foreach ($fallbackFolders as $folder) {
        if (! $disk->exists($folder)) {
            continue;
        }
        foreach ($disk->files($folder) as $candidate) {
            try {
                if ($disk->size($candidate) > 20000) {
                    $candidates[] = $candidate;
                }
            } catch (\Throwable $e) {
                // ignore unreadable candidate
            }
        }
    }

    if (! empty($candidates)) {
        sort($candidates);
        $index = abs(crc32($path)) % count($candidates);
        return response()->file($disk->path($candidates[$index]));
    }

    abort(404);
})->where('path', '.*');

// Map data: approved reports for the public, but reviewers (menro/admin/staff)
// also see pending/under-review reports so they can track threats on the map.
Route::middleware('optional.auth')->get('/reports/map', [ReportController::class, 'mapData']);
// Public list, but optionally authenticated: a logged-in user additionally sees
// their own (pending) reports, not just approved ones.
Route::middleware('optional.auth')->get('/reports', [ReportController::class, 'index']);

// ── Static /reports/* sub-routes MUST be declared before the dynamic {report} wildcard ──
// Authenticated: instant ML image analysis
Route::middleware(['auth:sanctum', 'role:field_worker,volunteer,user,menro,staff,admin'])
    ->post('/reports/analyze-image', [ReportController::class, 'analyzeImage']);

// Authenticated: mangrove report generation (menro/staff/admin)
Route::middleware(['auth:sanctum', 'role:menro,admin,staff'])->group(function () {
    Route::post('/reports/generate',                          [MangroveReportController::class, 'generate']);
});

// Authenticated: read/export generated reports — also available to DENR and
// research evaluators for authorized review (read-only, no generation).
Route::middleware(['auth:sanctum', 'role:menro,admin,staff,denr,evaluator'])->group(function () {
    Route::get('/reports/generated',                          [MangroveReportController::class, 'index']);
    Route::get('/reports/generated/{generatedReport}/export', [MangroveReportController::class, 'export']);
});

// Dynamic wildcard — must come last among /reports/* routes.
// Optionally authenticated so an owner can view their own pending report.
Route::middleware('optional.auth')->get('/reports/{report}', [ReportController::class, 'show']);

Route::get('/projects/map',  [RestorationProjectController::class, 'mapData']);
Route::get('/projects',      [RestorationProjectController::class, 'index']);
Route::get('/projects/{restorationProject}', [RestorationProjectController::class, 'show']);

// ─── Authenticated Routes ─────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::middleware('role:field_worker,volunteer,user')
        ->get('/weather', WeatherForecastController::class);

    Route::middleware('role:field_worker')->group(function () {
        Route::get('/events/my-attendance', [PlantingEventController::class, 'myAttendance']);
        Route::post('/events/{plantingEvent}/attendance', [PlantingEventController::class, 'confirmAttendance']);
        Route::delete('/events/{plantingEvent}/attendance', [PlantingEventController::class, 'undoAttendance']);
        Route::post('/events/{plantingEvent}/accomplishments', [EventAccomplishmentReportController::class, 'store']);
        Route::get('/events/{plantingEvent}/accomplishments/mine', [EventAccomplishmentReportController::class, 'mine']);
        Route::get('/events/{plantingEvent}/seedling-dispatch', [EventAccomplishmentReportController::class, 'dispatchSummary']);
        Route::get('/analytics/mine', [AnalyticsController::class, 'mine']);
    });

    // Auth
    Route::post('/auth/logout',         [AuthController::class, 'logout']);
    Route::get('/auth/me',              [AuthController::class, 'me']);
    Route::put('/auth/profile',         [AuthController::class, 'updateProfile']);
    Route::post('/auth/fcm-token',      [AuthController::class, 'updateFcmToken']);

    // Reports
    Route::post('/reports',             [ReportController::class, 'store']);
    Route::put('/reports/{report}',     [ReportController::class, 'update']);
    Route::delete('/reports/{report}',  [ReportController::class, 'destroy']);
    Route::get('/my-reports',           [ReportController::class, 'myReports']);

    // Projects
    Route::post('/projects/{restorationProject}/join',   [RestorationProjectController::class, 'joinVolunteer']);
    Route::delete('/projects/{restorationProject}/leave',[RestorationProjectController::class, 'leaveVolunteer']);

    // Notifications
    Route::get('/notifications',                    [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count',       [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{id}/read',         [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all',          [NotificationController::class, 'markAllRead']);

    // Threat-case monitoring timeline (owner or reviewer; checked in controller)
    Route::get('/reports/{report}/timeline', [ReportController::class, 'timeline']);

    // Report status and official action notes are managed by MENRO only.
    Route::middleware('role:menro')->patch('/reports/{report}/review', [ReportController::class, 'review']);

    // Monitoring follow-up updates: open to field workers + volunteers (own
    // reports only — ownership enforced in the controller) as well as MENRO/staff.
    Route::middleware('role:admin,staff,menro,field_worker,volunteer,user')
        ->post('/reports/{report}/updates', [ReportController::class, 'addUpdate']);

    // ─── Staff / Admin / MENRO Routes ──────────────────────────────────────────
    Route::middleware('role:admin,staff,menro')->group(function () {
        Route::post('/reports/{report}/analyze',  [ReportController::class, 'analyze']);

        Route::post('/projects',                    [RestorationProjectController::class, 'store']);
        Route::put('/projects/{restorationProject}',[RestorationProjectController::class, 'update']);
        Route::post('/projects/{restorationProject}/updates', [RestorationProjectController::class, 'addUpdate']);
    });

    // ─── Scientific evaluation (menro/staff/admin + research evaluators) ────────
    // Human verification of AI species classifications is a scientific-evaluation
    // task, so research evaluators may perform it alongside MENRO reviewers.
    Route::middleware('role:admin,staff,menro,evaluator')->group(function () {
        Route::patch('/reports/{report}/verify-species', [ReportController::class, 'verifySpecies']);
    });

    // Instant image analysis — available to field_worker, volunteer, menro, staff, admin
    // (declared outside auth group above to avoid {report} wildcard conflict)

    // ─── Admin Only Routes ─────────────────────────────────────────────────────
    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/dashboard',              [AdminController::class, 'dashboard']);
        Route::get('/admin/users',                  [AdminController::class, 'users']);
        Route::get('/admin/users/{id}',             [AdminController::class, 'showUser']);
        Route::post('/admin/users',                 [AdminController::class, 'createUser']);
        Route::patch('/admin/users/{id}',           [AdminController::class, 'updateUser']);
        Route::delete('/admin/users/{id}',          [AdminController::class, 'destroyUser']);
        Route::get('/admin/activity-logs',          [AdminController::class, 'activityLogs']);
        Route::get('/admin/activity-logs/export',   [AdminController::class, 'exportActivityLogs']);
        Route::get('/admin/settings',               [SettingController::class, 'index']);
        Route::patch('/admin/settings',             [SettingController::class, 'update']);
        Route::get('/admin/system-reports',         [AdminController::class, 'systemReports']);
        Route::get('/admin/system-reports/export',  [AdminController::class, 'exportSystemReports']);

        // Threat report management
        Route::get('/admin/threat-reports',         [ReportController::class, 'adminIndex']);
        Route::get('/admin/threat-reports/{report}',[ReportController::class, 'adminShow']);
    });

    // ─── Admin + Staff + MENRO: Articles, Announcements, Seedling Inventory ───
    Route::middleware('role:admin,staff,menro')->group(function () {
        // Articles management
        Route::get('/admin/articles',            [ArticleController::class, 'adminIndex']);
        Route::post('/articles',                 [ArticleController::class, 'store']);
        Route::put('/articles/{article}',        [ArticleController::class, 'update']);
        Route::delete('/articles/{article}',     [ArticleController::class, 'destroy']);

        // Announcements management
        Route::get('/admin/announcements',       [AnnouncementController::class, 'adminIndex']);
        Route::post('/announcements',            [AnnouncementController::class, 'store']);
        Route::put('/announcements/{announcement}',    [AnnouncementController::class, 'update']);
        Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy']);

        // Mangrove species reference management
        Route::post('/species',                  [MangroveSpeciesController::class, 'store']);
        Route::put('/species/{mangroveSpecies}', [MangroveSpeciesController::class, 'update']);
        Route::delete('/species/{mangroveSpecies}', [MangroveSpeciesController::class, 'destroy']);

        // Seedling inventory
        Route::get('/seedlings',                 [SeedlingInventoryController::class, 'index']);
        Route::get('/seedlings/summary',         [SeedlingInventoryController::class, 'summary']);
        // Movement-ledger summary — MUST precede the {seedlingInventory} wildcard
        // routes so "movements" isn't captured as an entry id.
        Route::get('/seedlings/movements/summary', [InventoryMovementController::class, 'summary']);
        Route::post('/seedlings',                [SeedlingInventoryController::class, 'store']);
        Route::put('/seedlings/{seedlingInventory}',    [SeedlingInventoryController::class, 'update']);
        Route::delete('/seedlings/{seedlingInventory}', [SeedlingInventoryController::class, 'destroy']);

        // Per-entry stock movements (daily/weekly/monthly tracking + add/minus)
        Route::get('/seedlings/{seedlingInventory}/movements',        [InventoryMovementController::class, 'index']);
        Route::post('/seedlings/{seedlingInventory}/movements',       [InventoryMovementController::class, 'store']);
        Route::delete('/seedlings/{seedlingInventory}/movements/{movement}', [InventoryMovementController::class, 'destroy']);
    });
});

// ─── Mangrove Monitoring System Routes ───────────────────────────────────────

// Public mangrove routes
Route::get('/sites', [RestorationSiteController::class, 'index']);
Route::get('/sites/{restorationSite}', [RestorationSiteController::class, 'show']);
// Public — drawn areas (green mangrove + red planted) for a site.
Route::get('/sites/{restorationSite}/areas', [SiteAreaController::class, 'index']);
Route::get('/events/open', [PlantingEventController::class, 'openEvents']);
Route::middleware('optional.auth')->get('/events/past', [PlantingEventController::class, 'pastEvents']);

// Public registration for request-sourced events (no auth needed — personal info collected instead)
Route::post('/events/{plantingEvent}/register-public', [PlantingEventController::class, 'registerPublic']);

// Public — plantation event requests (anyone can submit)
Route::middleware('optional.auth')->post('/event-requests', [PlantationEventRequestController::class, 'store']);
Route::get('/event-requests/pending-count',  [PlantationEventRequestController::class, 'pendingCount']);

// Authenticated field worker / volunteer / community participant
Route::middleware('auth:sanctum')->group(function () {
    // field_worker + volunteer + user can register for and cancel event registrations
    Route::middleware('role:field_worker,volunteer,user')->group(function () {
        Route::post('/events/{plantingEvent}/register', [PlantingEventController::class, 'register']);
        Route::delete('/events/{plantingEvent}/unregister', [PlantingEventController::class, 'unregister']);
    });

    // Any authenticated user can fetch their own registrations
    Route::get('/events/my-registrations', [PlantingEventController::class, 'myRegistrations']);

    // Any authenticated user can fetch their own event requests
    Route::get('/event-requests/mine', [PlantationEventRequestController::class, 'mine']);
    Route::middleware('role:volunteer,user')->group(function () {
        Route::put('/event-requests/{plantationEventRequest}', [PlantationEventRequestController::class, 'update']);
        Route::post('/event-requests/{plantationEventRequest}/cancel', [PlantationEventRequestController::class, 'cancelMine']);
    });

    // field_worker (and menro/admin/staff) can submit plantation records
    // volunteer/user can view their own (in case they were previously field_worker or for display)
    Route::middleware('role:field_worker,menro,admin,staff,volunteer,user')->group(function () {
        Route::get('/plantation-records/mine', [PlantationRecordController::class, 'mine']);
        Route::get('/monitoring-records/mine', [MonitoringRecordController::class, 'mine']);
    });

    Route::middleware('role:field_worker,menro,admin,staff')->group(function () {
        Route::post('/plantation-records', [PlantationRecordController::class, 'store']);
    });

    // field_worker only for monitoring and ecosystem
    Route::middleware('role:field_worker')->group(function () {
        Route::post('/monitoring-records', [MonitoringRecordController::class, 'store']);
        Route::post('/ecosystem-records', [EcosystemRecordController::class, 'store']);
    });

    // Site data reads — MENRO/admin/staff/field_worker plus DENR, research
    // evaluators, and signed-in participants (volunteer/user) for read-only site view.
    Route::middleware('role:menro,admin,staff,field_worker,denr,evaluator,volunteer,user')->group(function () {
        Route::get('/sites/{restorationSite}/plantation-records', [PlantationRecordController::class, 'bySite']);
        Route::get('/sites/{restorationSite}/photos', [SitePhotoController::class, 'index']);
    });

    Route::middleware('role:menro,admin,staff,field_worker,denr,evaluator')->group(function () {
        Route::get('/sites/{restorationSite}/monitoring-records', [MonitoringRecordController::class, 'bySite']);
        Route::get('/sites/{restorationSite}/ecosystem-records', [EcosystemRecordController::class, 'bySite']);
    });

    // Analytics reads — MENRO/admin/staff plus DENR + research evaluators + participants.
    Route::middleware('role:menro,admin,staff,denr,evaluator,field_worker,volunteer,user')->group(function () {
        Route::get('/analytics/{restorationSite}', [AnalyticsController::class, 'show']);
        Route::get('/analytics/{restorationSite}/predict-growth', [AnalyticsController::class, 'predictGrowth']);
    });

    // menro + admin + staff can manage events and access site data
    Route::middleware('role:menro,admin,staff')->group(function () {
        Route::post('/sites/{restorationSite}/photos', [SitePhotoController::class, 'store']);
        // Note: /reports/generate and /reports/generated are declared at top level to avoid {report} conflict
        Route::post('/events', [PlantingEventController::class, 'store']);
        Route::put('/events/{plantingEvent}', [PlantingEventController::class, 'update']);
        Route::get('/events/all', [PlantingEventController::class, 'allEvents']);
        Route::patch('/events/{plantingEvent}/registrations/{eventRegistration}/review', [PlantingEventController::class, 'reviewRegistration']);
        Route::get('/event-accomplishments', [EventAccomplishmentReportController::class, 'index']);

        // Plantation event requests — review & manage
        Route::get('/event-requests',                                    [PlantationEventRequestController::class, 'index']);
        Route::get('/event-requests/{plantationEventRequest}',           [PlantationEventRequestController::class, 'show']);
        Route::patch('/event-requests/{plantationEventRequest}/review',  [PlantationEventRequestController::class, 'review']);
        Route::post('/event-requests/{plantationEventRequest}/dispatch', [PlantationEventRequestController::class, 'dispatch']);
        Route::post('/event-requests/{plantationEventRequest}/return', [PlantationEventRequestController::class, 'returnRemaining']);
        Route::delete('/event-requests/{plantationEventRequest}',        [PlantationEventRequestController::class, 'destroy']);

        // Site drawn areas — add / edit / remove (green mangrove + red planted)
        Route::post('/sites/{restorationSite}/areas',               [SiteAreaController::class, 'store']);
        Route::put('/sites/{restorationSite}/areas/{area}',         [SiteAreaController::class, 'update']);
        Route::delete('/sites/{restorationSite}/areas/{area}',      [SiteAreaController::class, 'destroy']);

        // Restoration sites — create/update (assign Bantay Bakawan, planted area)
        Route::post('/sites', [RestorationSiteController::class, 'store']);
        Route::put('/sites/{restorationSite}', [RestorationSiteController::class, 'update']);
        Route::get('/field-workers', [RestorationSiteController::class, 'fieldWorkers']);
    });

    // admin only
    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/backup',                 [BackupController::class, 'trigger']);
        Route::get('/admin/backup/history',         [BackupController::class, 'history']);
        Route::get('/admin/backup/download/{file}', [BackupController::class, 'download']);

        // Government / agency integration (documented stub) + CSV import
        Route::get('/admin/integrations/status',   [IntegrationController::class, 'status']);
        Route::get('/admin/integrations/logs',      [IntegrationController::class, 'logs']);
        Route::post('/admin/integrations/{connector}/sync', [IntegrationController::class, 'sync']);
        Route::post('/admin/integrations/import-csv', [IntegrationController::class, 'importCsv']);
    });
});

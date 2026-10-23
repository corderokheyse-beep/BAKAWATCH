<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Report;
use App\Notifications\NewThreatReportNotification;
use App\Notifications\ReportStatusNotification;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\FcmService;
use App\Services\MangroveMLService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function __construct(
        private CloudinaryService  $cloudinary,
        private MangroveMLService  $ml,
        private FcmService         $fcm,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Report::with([
            'user:id,name,email,role', 'reviewer:id,name',
            'eventAccomplishment.event:id,name,scheduled_at',
            'eventAccomplishment.site:id,name',
            'eventAccomplishment.species:id,scientific_name,local_name',
        ])
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->category === 'event_accomplishment', fn($q) => $q->where('report_type', 'event_accomplishment'))
            ->when($request->category && $request->category !== 'event_accomplishment', fn($q) => $q->where('category', $request->category))
            ->when($request->date_from, fn($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to, fn($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->when($request->search, fn($q) => $q->where(function ($q) use ($request) {
                $q->where('title', 'like', "%{$request->search}%")
                  ->orWhere('description', 'like', "%{$request->search}%");
            }));

        // Non-admin users only see approved reports (unless viewing their own)
        if (!auth()->check() || auth()->user()->role === 'public') {
            $query->approved();
        } elseif (in_array(auth()->user()->role, ['user', 'volunteer', 'field_worker'])) {
            $query->where(function ($q) {
                $q->approved()->orWhere('user_id', auth()->id());
            });
        }
        // admin, staff, menro see all reports (no additional filter)

        $reports = $query->latest()->paginate($request->per_page ?? 15);

        return response()->json($reports);
    }

    public function mapData(Request $request): JsonResponse
    {
        $query = Report::query()
            ->select([
                'id', 'title', 'description', 'latitude', 'longitude', 'location_name',
                'status', 'category', 'severity', 'affected_radius_m', 'image_url',
                'admin_notes', 'created_at',
            ])
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->category, fn($q) => $q->where('category', $request->category));

        // Reviewers (menro/admin/staff) can see every report on the map so they
        // can track pending threats. Everyone else sees approved reports only.
        $user = auth()->user();
        if (! $user || ! in_array($user->role, ['admin', 'staff', 'menro'], true)) {
            $query->approved();
        }

        return response()->json($query->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'         => 'required|string|max:255',
            'description'   => 'required|string|max:5000',
            'latitude'      => 'required|numeric|between:-90,90',
            'longitude'     => 'required|numeric|between:-180,180',
            'location_name' => 'nullable|string|max:255',
            'category'      => 'required|in:damage,restoration,wildlife,pollution,other',
            'threat_type'   => 'nullable|in:damaged_tree,illegal_cutting,disease_pest,pollution,coastal_erosion,storm_damage,other',
            'severity'      => 'nullable|in:low,medium,high,critical',
            'affected_radius_m' => 'nullable|integer|min:0|max:5000',
            'human_verified_species' => 'nullable|string|max:255',
            // Accept common phone/camera formats. Validate by actual MIME type
            // (mimetypes) rather than extension so files like image/jpeg saved
            // as .jfif are still accepted. Up to 10 MB.
            'image'         => 'nullable|file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
            'photos'        => 'sometimes|array|max:5',
            'photos.*'      => 'file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
        ], [
            'image.mimetypes' => 'The photo must be a JPEG, PNG, WebP, or HEIC image.',
            'image.max'       => 'The photo must be 10 MB or smaller.',
            'photos.max'      => 'You can upload up to 5 photos.',
            'photos.*.mimetypes' => 'Each photo must be a JPEG, PNG, WebP, or HEIC image.',
            'photos.*.max'    => 'Each photo must be 10 MB or smaller.',
        ]);

        $photos = $request->file('photos', []);
        if (! $photos && $request->hasFile('image')) {
            $photos = [$request->file('image')];
        }

        $photoData = [];
        foreach ($photos as $photo) {
            $result = $this->cloudinary->upload($photo, 'reports');
            $photoData[] = [
                'url' => $result['secure_url'],
                'public_id' => $result['public_id'],
            ];
        }

        $imageData = [];
        if ($photoData) {
            $imageData = [
                'image_url'       => $photoData[0]['url'],
                'image_public_id' => $photoData[0]['public_id'],
                'photos'          => $photoData,
            ];
        }

        // ── ML analysis — run on the uploaded image before saving ─────────────
        $mlData = [];
        if ($photos) {
            $analysis = $this->ml->analyze($photos[0]);
            if ($analysis) {
                // Store the model's actual top guess (predicted_species) even when
                // it fell below the confidence threshold and reported "Uncertain".
                $topSpecies = $analysis['predicted_species'] ?? $analysis['species'] ?? 'Unknown';
                $mlData = [
                    'ml_condition'      => $analysis['condition']  ?? 'Unknown',
                    'ml_species'        => $topSpecies,
                    'ml_confidence'     => round((float) ($analysis['confidence'] ?? 0), 2),
                    'ml_analyzed'       => true,
                    'ml_model_version'  => config('services.ml.model_version'),
                    'ml_all_predictions'=> isset($analysis['all_predictions'])
                        ? json_encode($analysis['all_predictions'])
                        : null,
                    // AI output starts unverified — never treated as confirmed.
                    'verification_status' => 'unverified',
                ];
            }
        }

        // If the reporter picked a species, record it as a human-supplied value
        // (reporter-level, not an official MENRO verification).
        $humanSpecies = $validated['human_verified_species'] ?? null;
        $humanData = $humanSpecies
            ? ['human_verified_species' => $humanSpecies, 'verification_status' => 'unverified']
            : [];

        $report = Report::create(array_merge($validated, $imageData, $mlData, $humanData, [
            'user_id'  => auth()->id(),
            'status'   => 'pending',
            // Always have a severity so the map can draw an impact circle.
            'severity' => $validated['severity'] ?? 'medium',
        ]));

        // Seed the immutable status history with the initial submission.
        \App\Models\ReportStatusHistory::create([
            'report_id'       => $report->id,
            'previous_status' => null,
            'new_status'      => 'pending',
            'changed_by'      => auth()->id(),
            'note'            => 'Threat report submitted.',
            'created_at'      => now(),
        ]);

        $report->load('user:id,name');

        ActivityLog::record('report.created', $report);

        // Notify all admins about the new threat report
        $admins = User::where('role', 'admin')->get();
        foreach ($admins as $admin) {
            $admin->notify(new NewThreatReportNotification($report));
        }

        // Push notification via FCM
        $this->fcm->notifyNewReport($report);

        return response()->json([
            'message' => 'Report submitted successfully.',
            'report'  => $report,
        ], 201);
    }

    public function show(Report $report): JsonResponse
    {
        $user = auth()->user();
        $isReviewer = $user && in_array($user->role, ['admin', 'staff', 'menro'], true);
        $isOwner    = $user && $report->user_id === $user->id;

        // Only reviewers or the owner may see a case that is not yet public
        // (public visibility = recovering/resolved).
        $isPublic = $report->status === 'resolved';
        if (! $isPublic && ! $isReviewer && ! $isOwner) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json($report->load(['user:id,name,email', 'reviewer:id,name']));
    }

    public function update(Request $request, Report $report): JsonResponse
    {
        $this->authorize('update', $report);

        $validated = $request->validate([
            'title'         => 'sometimes|string|max:255',
            'description'   => 'sometimes|string|max:5000',
            'latitude'      => 'sometimes|numeric|between:-90,90',
            'longitude'     => 'sometimes|numeric|between:-180,180',
            'location_name' => 'nullable|string|max:255',
            'category'      => 'sometimes|in:damage,restoration,wildlife,pollution,other',
            'status'        => 'prohibited',
            'threat_type'   => 'nullable|in:damaged_tree,illegal_cutting,disease_pest,pollution,coastal_erosion,storm_damage,other',
            'severity'      => 'nullable|in:low,medium,high,critical',
            'affected_radius_m' => 'nullable|integer|min:0|max:5000',
            // Match store(): validate by MIME type (accepts HEIC/JFIF), up to 10 MB.
            'image'         => 'nullable|file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
        ], [
            'image.mimetypes' => 'The photo must be a JPEG, PNG, WebP, or HEIC image.',
            'image.max'       => 'The photo must be 10 MB or smaller.',
        ]);

        if ($request->hasFile('image')) {
            if ($report->image_public_id) {
                $this->cloudinary->delete($report->image_public_id);
            }
            $result = $this->cloudinary->upload($request->file('image'), 'reports');
            $validated['image_url'] = $result['secure_url'];
            $validated['image_public_id'] = $result['public_id'];
            $existingPhotos = $report->photos ?? [];
            $validated['photos'] = array_merge(
                [['url' => $result['secure_url'], 'public_id' => $result['public_id']]],
                array_values(array_filter(
                    $existingPhotos,
                    fn ($photo) => ($photo['public_id'] ?? null) !== $report->image_public_id,
                )),
            );

            // Re-run AI species detection on the new image (best-effort).
            $analysis = $this->ml->analyze($request->file('image'));
            if ($analysis) {
                $validated['ml_condition']       = $analysis['condition']  ?? 'Unknown';
                $validated['ml_species']         = $analysis['predicted_species'] ?? $analysis['species'] ?? 'Unknown';
                $validated['ml_confidence']      = round((float) ($analysis['confidence'] ?? 0), 2);
                $validated['ml_analyzed']        = true;
                $validated['ml_model_version']   = config('services.ml.model_version');
                $validated['ml_all_predictions'] = isset($analysis['all_predictions'])
                    ? json_encode($analysis['all_predictions'])
                    : null;
                $validated['verification_status'] = 'unverified';
            }
        }

        $old = $report->toArray();
        $report->update($validated);
        ActivityLog::record('report.updated', $report, $old, $report->toArray());

        return response()->json(['message' => 'Report updated.', 'report' => $report]);
    }

    public function review(Request $request, Report $report): JsonResponse
    {
        $request->validate([
            'status'            => 'required|in:pending,under_review,resolved',
            'admin_notes'       => 'nullable|string|max:1000',
            'action_taken'      => 'nullable|string|max:5000',
            'severity'          => 'nullable|in:low,medium,high,critical',
            'affected_radius_m' => 'nullable|integer|min:0|max:5000',
        ]);

        $newStatus = $request->status;
        $previous  = $report->status;

        $old = $report->only(['status', 'admin_notes', 'severity', 'affected_radius_m']);

        $report->update(array_merge([
            'status'      => $newStatus,
            'admin_notes' => $request->input('action_taken', $request->admin_notes),
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ],
            // Only overwrite severity/radius when the reviewer supplied them.
            $request->filled('severity')          ? ['severity' => $request->severity] : [],
            $request->has('affected_radius_m')    ? ['affected_radius_m' => $request->affected_radius_m] : [],
        ));

        // Append to the immutable status history (never overwrite).
        $actionTaken = $request->input('action_taken', $request->admin_notes);
        $actionChanged = $request->hasAny(['action_taken', 'admin_notes'])
            && trim((string) $actionTaken) !== trim((string) ($old['admin_notes'] ?? ''));
        if ($previous !== $newStatus || $actionChanged) {
            \App\Models\ReportStatusHistory::create([
                'report_id'       => $report->id,
                'previous_status' => $previous,
                'new_status'      => $newStatus,
                'changed_by'      => auth()->id(),
                'note'            => $actionTaken,
                'created_at'      => now(),
            ]);
        }

        // Notify the report owner of the status change
        $report->user->notify(new ReportStatusNotification($report));
        // Push notification via FCM
        $this->fcm->notifyReportStatus($report);

        ActivityLog::record('report.reviewed', $report, $old, ['status' => $newStatus, 'action_taken' => $report->admin_notes]);

        return response()->json(['message' => "Report marked as {$newStatus}.", 'report' => $report->load(['user:id,name', 'reviewer:id,name'])]);
    }

    /** GET the full monitoring timeline (status history + updates) for a case. */
    public function timeline(Report $report): JsonResponse
    {
        $user = auth()->user();
        $isReviewer = $user && in_array($user->role, ['admin', 'staff', 'menro'], true);
        $isOwner    = $user && $report->user_id === $user->id;
        $isPublic   = $report->status === 'resolved';
        if (! $isPublic && ! $isReviewer && ! $isOwner) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $report->load([
            'user:id,name,role,email',
            'updates.updater:id,name',
            'statusHistory.changer:id,name',
        ]);

        return response()->json([
            'report'         => $report,
            'before_photo'   => $report->image_url,
            'after_photo'    => $report->latestUpdatePhoto(),
            'updates'        => $report->updates,
            'status_history' => $report->statusHistory,
        ]);
    }

    /** Add a monitoring follow-up update to a threat case. */
    public function addUpdate(Request $request, Report $report): JsonResponse
    {
        $user = $request->user();

        // Field workers and volunteers may only update reports they submitted.
        $isStaff = in_array($user->role, ['admin', 'staff', 'menro'], true);
        if (! $isStaff && $report->user_id !== $user->id) {
            return response()->json(['message' => 'You can only add updates to your own reports.'], 403);
        }

        $validated = $request->validate([
            'type' => 'required|in:threat,growth_monitoring',
            'fields' => 'required|array',
            'fields.*' => 'nullable|string|max:5000',
            'fields.threat_status' => 'required_if:type,threat|in:Lumala / Natuluyan nang nasira,May Aksyon na / Nae-remediate,Naresolba na / Ligtas na,Walang Pagbabago',
            'fields.area_trend' => 'required_if:type,threat|in:Lumawak (Expanded),Umiit (Reduced),Pareho pa rin (Same)',
            'fields.next_step' => 'required_if:type,threat|in:Kailangan ng Agarang Aksyon / Escalation,Ituloy ang Regular na Monitoring,Pwede nang Isara ang Kaso',
            'fields.period' => 'required_if:type,growth_monitoring|in:1st Month Check,3rd Month Check,6th Month Check,1st Year Check',
            'fields.survival_rate' => 'required_if:type,growth_monitoring|numeric|min:0|max:100',
            'fields.average_height' => 'nullable|numeric|min:0|max:1000',
            'fields.health' => 'required_if:type,growth_monitoring|in:Malusog / Mabilis ang Paglaki,Bansot / Mabagal Lumaki,Inaatake ng Peste / Barnacles,Maraming Namatay',
            'observation'  => 'nullable|string|max:5000',
            'action_taken' => 'nullable|string|max:5000',
            'status'       => 'prohibited',
            'update_date'  => 'nullable|date',
            'image'        => 'nullable|file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'photos' => 'required|array|min:1|max:5',
            'photos.*' => 'file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
        ], [
            'image.mimetypes' => 'The photo must be a JPEG, PNG, WebP, or HEIC image.',
            'image.max'       => 'The photo must be 10 MB or smaller.',
        ]);

        $expectedType = $report->report_type === 'event_accomplishment' ? 'growth_monitoring' : 'threat';
        if ($validated['type'] !== $expectedType) {
            return response()->json(['message' => 'The update type must match the parent report.'], 422);
        }

        if (! $isStaff && !empty($validated['action_taken'])) {
            return response()->json(['message' => 'Only MENRO can post action taken.'], 403);
        }

        if (($validated['latitude'] ?? null) === null xor ($validated['longitude'] ?? null) === null) {
            return response()->json(['message' => 'Latitude and longitude must be provided together.'], 422);
        }

        if (empty($validated['observation']) && empty($validated['fields'])) {
            return response()->json(['message' => 'Add at least one field note or update value.'], 422);
        }

        $imageUrl = null; $imagePublicId = null;
        if ($request->hasFile('image')) {
            $result        = $this->cloudinary->upload($request->file('image'), 'reports');
            $imageUrl      = $result['secure_url'];
            $imagePublicId = $result['public_id'];
        }
        $photos = [];
        foreach ($request->file('photos', []) as $photo) {
            $uploaded = $this->cloudinary->upload($photo, 'report-updates');
            $photos[] = ['url' => $uploaded['secure_url'], 'public_id' => $uploaded['public_id']];
        }
        if ($photos && ! $imageUrl) {
            $imageUrl = $photos[0]['url'];
            $imagePublicId = $photos[0]['public_id'];
        }

        $update = \App\Models\ReportUpdate::create([
            'report_id'       => $report->id,
            'updated_by'      => auth()->id(),
            'type'            => $validated['type'] ?? 'threat',
            'fields'          => $validated['fields'] ?? [],
            'photos'          => $photos,
            'latitude'        => $validated['latitude'] ?? null,
            'longitude'       => $validated['longitude'] ?? null,
            'observation'     => $validated['observation'] ?? '',
            'action_taken'    => null,
            'status'          => $report->status,
            'image_url'       => $imageUrl,
            'image_public_id' => $imagePublicId,
            'update_date'     => $validated['update_date'] ?? now()->toDateString(),
        ]);

        ActivityLog::record('report.update_added', $report, [], ['update_id' => $update->id]);

        if (! $isStaff) {
            $admins = User::whereIn('role', ['menro', 'admin', 'staff'])->where('is_active', true)->get();
            foreach ($admins as $admin) $admin->notify(new \App\Notifications\ReportUpdateAddedNotification($report, $update));
        }

        return response()->json([
            'message' => 'Monitoring update added.',
            'update'  => $update->load('updater:id,name'),
        ], 201);
    }

    /**
     * Human verification of an AI species classification.
     *
     * The AI prediction (ml_species) is NEVER overwritten — the reviewer's
     * outcome is recorded separately so an AI guess can't be mistaken for a
     * confirmed identification.
     *
     *   confirmed → the AI species is accepted as-is
     *   corrected → reviewer supplies the correct species (species required)
     *   rejected  → the AI classification is dismissed
     */
    public function verifySpecies(Request $request, Report $report): JsonResponse
    {
        $validated = $request->validate([
            'verification_status' => 'required|in:confirmed,corrected,rejected',
            'human_verified_species' => 'nullable|string|max:100',
            'verification_notes'  => 'nullable|string|max:1000',
        ]);

        // A correction must name the correct species.
        if ($validated['verification_status'] === 'corrected' && empty($validated['human_verified_species'])) {
            return response()->json([
                'message' => 'A corrected classification requires the verified species name.',
            ], 422);
        }

        // Resolve the human-verified species per outcome.
        $verifiedSpecies = match ($validated['verification_status']) {
            'confirmed' => $report->ml_species,
            'corrected' => $validated['human_verified_species'],
            'rejected'  => null,
        };

        $old = $report->only(['verification_status', 'human_verified_species']);

        $report->update([
            'verification_status'    => $validated['verification_status'],
            'human_verified_species' => $verifiedSpecies,
            'verification_notes'     => $validated['verification_notes'] ?? null,
            'verified_by'            => auth()->id(),
            'verified_at'            => now(),
        ]);

        ActivityLog::record('report.species_verified', $report, $old, [
            'verification_status'    => $validated['verification_status'],
            'human_verified_species' => $verifiedSpecies,
        ]);

        return response()->json([
            'message' => 'Species classification verification saved.',
            'report'  => $report->load(['user:id,name', 'reviewer:id,name', 'verifier:id,name']),
        ]);
    }

    public function destroy(Report $report): JsonResponse
    {
        $this->authorize('delete', $report);

        $publicIds = collect($report->photos ?? [])
            ->pluck('public_id')
            ->push($report->image_public_id)
            ->filter()
            ->unique();
        foreach ($publicIds as $publicId) {
            $this->cloudinary->delete($publicId);
        }

        $report->delete();
        ActivityLog::record('report.deleted', $report);

        return response()->json(['message' => 'Report deleted.']);
    }

    /**
     * Instant image analysis — proxies to ML service without saving anything.
     * Called by the frontend as soon as the user selects an image.
     */
    public function analyzeImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|file|mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif|max:10240',
        ], [
            'image.mimetypes' => 'The photo must be a JPEG, PNG, WebP, or HEIC image.',
            'image.max'       => 'The photo must be 10 MB or smaller.',
        ]);

        $result = $this->ml->analyze($request->file('image'));

        if (!$result) {
            return response()->json(['message' => 'ML service unavailable.'], 503);
        }

        return response()->json($result);
    }

    public function myReports(Request $request): JsonResponse
    {
        $reports = Report::where('user_id', auth()->id())
            ->when($request->status,   fn($q) => $q->where('status', $request->status))
            ->when($request->category === 'event_accomplishment', fn($q) => $q->where('report_type', 'event_accomplishment'))
            ->when($request->category && $request->category !== 'event_accomplishment', fn($q) => $q->where('category', $request->category))
            ->when($request->search,   fn($q) => $q->where(function ($q) use ($request) {
                $q->where('title', 'like', "%{$request->search}%")
                  ->orWhere('description', 'like', "%{$request->search}%");
            }))
            ->latest()
            ->paginate($request->per_page ?? 15);

        return response()->json($reports);
    }

    /**
     * Admin: full list of all threat reports with filters.
     */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = Report::with(['user:id,name,email,role', 'reviewer:id,name', 'updates.updater:id,name', 'eventAccomplishment.event:id,name,scheduled_at', 'eventAccomplishment.site:id,name', 'eventAccomplishment.species:id,scientific_name,local_name'])
            ->when($request->status,   fn($q) => $q->where('status', $request->status))
            ->when($request->category === 'event_accomplishment', fn($q) => $q->where('report_type', 'event_accomplishment'))
            ->when($request->category && $request->category !== 'event_accomplishment', fn($q) => $q->where('category', $request->category))
            ->when($request->search,   fn($q) => $q->where(function ($q) use ($request) {
                $q->where('title', 'like', "%{$request->search}%")
                  ->orWhere('description', 'like', "%{$request->search}%")
                  ->orWhere('location_name', 'like', "%{$request->search}%");
            }))
            ->when($request->date_from, fn($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to,   fn($q) => $q->whereDate('created_at', '<=', $request->date_to));

        $reports = $query->latest()->paginate($request->per_page ?? 20);

        return response()->json($reports);
    }

    /**
     * Admin: single report detail.
     */
    public function adminShow(Report $report): JsonResponse
    {
        return response()->json($report->load(['user:id,name,email', 'reviewer:id,name']));
    }

    /**
     * Re-run ML analysis on an existing report that has an image.
     * Useful for reports submitted before the ML service was available.
     */
    public function analyze(Report $report): JsonResponse
    {
        if (!$report->image_url) {
            return response()->json(['message' => 'This report has no image to analyze.'], 422);
        }

        // Download the image from Cloudinary and send to ML service
        try {
            $imageContents = file_get_contents($report->image_url);
            if (!$imageContents) {
                return response()->json(['message' => 'Could not retrieve report image.'], 422);
            }

            // Write to a temp file so we can pass it as UploadedFile-like
            $tmpPath = tempnam(sys_get_temp_dir(), 'mangrove_') . '.jpg';
            file_put_contents($tmpPath, $imageContents);

            $response = \Illuminate\Support\Facades\Http::timeout(15)
                ->attach('file', file_get_contents($tmpPath), 'image.jpg')
                ->post(config('services.ml.url', 'http://127.0.0.1:8001') . '/predict');

            @unlink($tmpPath);

            if ($response->successful()) {
                $data = $response->json();
                $report->update([
                    'ml_condition'  => $data['condition']  ?? 'Unknown',
                    'ml_species'    => $data['species']    ?? 'Unknown',
                    'ml_confidence' => round((float) ($data['confidence'] ?? 0), 2),
                    'ml_analyzed'   => true,
                ]);

                return response()->json([
                    'message'   => 'Analysis complete.',
                    'condition' => $report->ml_condition,
                    'species'   => $report->ml_species,
                    'confidence'=> $report->ml_confidence,
                ]);
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning('Re-analyze failed: ' . $e->getMessage());
        }

        return response()->json(['message' => 'ML service unavailable. Please try again later.'], 503);
    }
}

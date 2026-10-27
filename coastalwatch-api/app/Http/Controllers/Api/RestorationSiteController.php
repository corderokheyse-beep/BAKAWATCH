<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\RestorationSite;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RestorationSiteController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    /** Check if PostGIS is available */
    private function hasPostGIS(): bool
    {
        if (DB::getDriverName() === 'sqlite') return false;
        try {
            DB::selectOne("SELECT PostGIS_Lib_Version()");
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * List assignable Bantay Bakawan (field workers) for the site
     * assignment dropdown. Accessible to menro + admin.
     */
    public function fieldWorkers(): JsonResponse
    {
        $workers = \App\Models\User::where('role', 'field_worker')
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json($workers);
    }

    /** Planted area can never exceed the site's total area. */
    private function assertPlantedWithinArea(?float $planted, ?float $area): void
    {
        if ($planted !== null && $area !== null && $planted > $area) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'planted_hectares' => 'Planted hectares cannot exceed the site area.',
            ]);
        }
    }

    /** The assigned Bantay Bakawan must be a field worker. */
    private function assertAssigneeIsFieldWorker(?int $userId): void
    {
        if ($userId === null) return;
        $role = \App\Models\User::whereKey($userId)->value('role');
        if ($role !== 'field_worker') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'assigned_to' => 'The assigned worker must be a Bantay Bakawan (field worker).',
            ]);
        }
    }

    /** Public — all non-deleted sites with GeoJSON boundary */
    public function index(): JsonResponse
    {
        $statsBySite = $this->analytics->survivalSummaryBySite();

        if (!$this->hasPostGIS()) {
            $sites = RestorationSite::with([
                    'assignedWorker:id,name',
                    'speciesList:id,scientific_name,local_name',
                    // Drawn areas (green mangrove + red planted) for every site,
                    // so all maps can render them from the list payload.
                    'areas:id,restoration_site_id,type,geojson,area_hectares,note',
                ])
                ->withCount('speciesList')
                ->whereNull('deleted_at')
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(function ($s) use ($statsBySite) {
                    $stats = $statsBySite[$s->id] ?? ['plantation_count' => 0, 'survival_rate' => null];
                    return array_merge($s->toArray(), [
                        'boundary_geojson' => $s->boundary_geojson ?? null,
                        'plantation_count' => $stats['plantation_count'],
                        'survival_rate'    => $stats['survival_rate'],
                    ]);
                });
            return response()->json($sites);
        }

        $sites = DB::select(
            "SELECT id, name, description, area_hectares, planted_hectares, barangay, status,
                    established_year, latitude, longitude, created_by, assigned_to, created_at, updated_at,
                    boundary_type, COALESCE(ST_AsGeoJSON(boundary), boundary_geojson) AS boundary_geojson
             FROM restoration_sites
             WHERE deleted_at IS NULL
             ORDER BY created_at DESC"
        );

        // Attach assigned worker (id + name) without an N+1 round trip.
        $workerIds = array_values(array_filter(array_map(fn($s) => $s->assigned_to ?? null, $sites)));
        $workers   = $workerIds
            ? \App\Models\User::whereIn('id', $workerIds)->get(['id', 'name'])->keyBy('id')
            : collect();

        // Attach curated species (list + count) + drawn areas for every site in
        // one query each (no N+1).
        $siteIds  = array_map(fn($s) => $s->id, $sites);
        $sitesEloquent = $siteIds
            ? RestorationSite::with('speciesList:id,scientific_name,local_name')
                ->whereIn('id', $siteIds)->get()->keyBy('id')
            : collect();
        $areasBySite = $siteIds
            ? \App\Models\SiteArea::whereIn('restoration_site_id', $siteIds)
                ->get(['id', 'restoration_site_id', 'type', 'geojson', 'area_hectares', 'note'])
                ->groupBy('restoration_site_id')
            : collect();

        foreach ($sites as $s) {
            $s->assigned_worker = $s->assigned_to && $workers->has($s->assigned_to)
                ? ['id' => $workers[$s->assigned_to]->id, 'name' => $workers[$s->assigned_to]->name]
                : null;
            $list = $sitesEloquent->get($s->id)?->speciesList ?? collect();
            $s->species_list       = $list->map(fn($sp) => [
                'id' => $sp->id, 'scientific_name' => $sp->scientific_name, 'local_name' => $sp->local_name,
            ])->values();
            $s->species_list_count = $list->count();
            $s->areas = ($areasBySite->get($s->id) ?? collect())->values();
            $stats = $statsBySite[$s->id] ?? ['plantation_count' => 0, 'survival_rate' => null];
            $s->plantation_count = $stats['plantation_count'];
            $s->survival_rate    = $stats['survival_rate'];
        }

        return response()->json($sites);
    }

    /** Admin only — create a new restoration site */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'             => 'required|string|max:255',
            'description'      => 'nullable|string',
            'status'           => 'required|in:active,inactive,in_progress',
            'barangay'         => 'nullable|string|max:255',
            'established_year' => 'nullable|integer|min:1900|max:2100',
            'area_hectares'    => 'nullable|numeric|min:0',
            'planted_hectares' => 'nullable|numeric|min:0',
            'assigned_to'      => 'nullable|exists:users,id',
            'species_ids'      => 'nullable|array',
            'species_ids.*'    => 'integer|exists:mangrove_species,id',
            'boundary_geojson' => 'nullable|string', // GeoJSON polygon string
            'latitude'         => 'nullable|numeric|between:-90,90',
            'longitude'        => 'nullable|numeric|between:-180,180',
        ]);

        $this->assertPlantedWithinArea($validated['planted_hectares'] ?? null, $validated['area_hectares'] ?? null);
        $this->assertAssigneeIsFieldWorker($validated['assigned_to'] ?? null);

        $site = RestorationSite::create([
            'created_by'       => $request->user()->id,
            'assigned_to'      => $validated['assigned_to'] ?? null,
            'name'             => $validated['name'],
            'description'      => $validated['description'] ?? null,
            'status'           => $validated['status'],
            'barangay'         => $validated['barangay'] ?? null,
            'established_year' => $validated['established_year'] ?? null,
            'area_hectares'    => $validated['area_hectares'] ?? null,
            'planted_hectares' => $validated['planted_hectares'] ?? null,
            'latitude'         => $validated['latitude'] ?? null,
            'longitude'        => $validated['longitude'] ?? null,
        ]);

        // Store boundary via PostGIS if provided
        if (!empty($validated['boundary_geojson']) && DB::getDriverName() !== 'sqlite') {
            try { DB::statement(
                "UPDATE restoration_sites
                 SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)
                 WHERE id = ?",
                [$validated['boundary_geojson'], $site->id]
            ); } catch (\Exception $e) {}
        }

        if (array_key_exists('species_ids', $validated)) {
            $site->speciesList()->sync($validated['species_ids'] ?? []);
        }

        ActivityLog::record('site.created', $site, [], $site->toArray());

        return response()->json($site->load('speciesList:id,scientific_name,local_name'), 201);
    }

    /** Authenticated — site detail with plantation count and survival rate */
    public function show(RestorationSite $restorationSite): JsonResponse
    {
        $restorationSite->load([
            'assignedWorker:id,name',
            'speciesList:id,scientific_name,local_name,family,ml_supported',
        ]);

        if (!$this->hasPostGIS()) {
            // No PostGIS: use the portable text column (set by the draw tool).
            $siteData = array_merge($restorationSite->toArray(), [
                'boundary_geojson' => $restorationSite->boundary_geojson,
            ]);
        } else {
            $siteData = DB::selectOne(
                "SELECT id, name, description, area_hectares, planted_hectares, barangay, status,
                        established_year, latitude, longitude, created_by, assigned_to, created_at, updated_at,
                        boundary_type, ST_AsGeoJSON(boundary) AS boundary_geojson
                 FROM restoration_sites WHERE id = ?",
                [$restorationSite->id]
            );
            $siteData->assigned_worker = $restorationSite->assignedWorker
                ? ['id' => $restorationSite->assignedWorker->id, 'name' => $restorationSite->assignedWorker->name]
                : null;
        }

        $plantationCount = $restorationSite->plantationRecords()->count();
        $survival        = $this->analytics->survivalRate($restorationSite->id);
        $species         = $this->analytics->speciesDistribution($restorationSite->id);

        // Curated biodiversity inventory (what grows here), distinct from the
        // plantation-derived $species above (what was planted and tracked).
        $siteSpecies = $restorationSite->speciesList->map(fn($sp) => [
            'id'              => $sp->id,
            'scientific_name' => $sp->scientific_name,
            'local_name'     => $sp->local_name,
            'family'          => $sp->family,
            'ml_supported'    => (bool) $sp->ml_supported,
        ])->values();

        return response()->json([
            'site'              => $siteData,
            'plantation_count'  => $plantationCount,
            'survival'          => $survival,
            'species'           => $species,       // from plantation_records
            'site_species'      => $siteSpecies,   // curated inventory
            'site_species_count'=> $siteSpecies->count(),
            'areas'             => $restorationSite->areas()
                ->orderBy('type')->orderByDesc('id')
                ->get(['id', 'restoration_site_id', 'type', 'geojson', 'area_hectares', 'note']),
        ]);
    }

    /** Admin only — update site fields */
    public function update(Request $request, RestorationSite $restorationSite): JsonResponse
    {
        $validated = $request->validate([
            'name'             => 'sometimes|string|max:255',
            'description'      => 'nullable|string',
            'status'           => 'sometimes|in:active,inactive,in_progress',
            'barangay'         => 'nullable|string|max:255',
            'established_year' => 'nullable|integer|min:1900|max:2100',
            'area_hectares'    => 'nullable|numeric|min:0',
            'planted_hectares' => 'nullable|numeric|min:0',
            'assigned_to'      => 'nullable|exists:users,id',
            'species_ids'      => 'nullable|array',
            'species_ids.*'    => 'integer|exists:mangrove_species,id',
            'boundary_geojson' => 'nullable|string',
            'boundary_type'    => 'nullable|in:mangrove,planted',
            'latitude'         => 'nullable|numeric|between:-90,90',
            'longitude'        => 'nullable|numeric|between:-180,180',
        ]);

        // Validate planted <= area using the incoming value when provided,
        // otherwise fall back to the stored area.
        $effectiveArea = array_key_exists('area_hectares', $validated)
            ? $validated['area_hectares']
            : $restorationSite->area_hectares;
        $this->assertPlantedWithinArea($validated['planted_hectares'] ?? null, $effectiveArea);
        $this->assertAssigneeIsFieldWorker($validated['assigned_to'] ?? null);

        $old = $restorationSite->toArray();
        // Everything except species_ids maps directly to columns. boundary_geojson
        // is now a real text column (portable across drivers), so it's written
        // here too — a null value clears a previously-drawn area.
        $restorationSite->update(array_filter(
            $validated,
            fn($k) => $k !== 'species_ids',
            ARRAY_FILTER_USE_KEY
        ));

        if (array_key_exists('species_ids', $validated)) {
            $restorationSite->speciesList()->sync($validated['species_ids'] ?? []);
        }

        // Mirror the geometry into the PostGIS column in production so spatial
        // queries keep working; the text column remains the portable source.
        if (array_key_exists('boundary_geojson', $validated) && DB::getDriverName() !== 'sqlite') {
            try {
                if ($validated['boundary_geojson']) {
                    DB::statement(
                        "UPDATE restoration_sites
                         SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)
                         WHERE id = ?",
                        [$validated['boundary_geojson'], $restorationSite->id]
                    );
                } else {
                    DB::statement("UPDATE restoration_sites SET boundary = NULL WHERE id = ?", [$restorationSite->id]);
                }
            } catch (\Exception $e) {}
        }

        ActivityLog::record('site.updated', $restorationSite, $old, $validated);

        return response()->json($restorationSite->fresh()->load('speciesList:id,scientific_name,local_name'));
    }
}

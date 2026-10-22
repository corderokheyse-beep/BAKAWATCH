<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestorationSite;
use App\Models\SiteArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Manages the multiple drawn areas of a restoration site. A site can hold both
 * a green "mangrove" extent and one or more red "planted" patches at once.
 */
class SiteAreaController extends Controller
{
    /** Public — list all drawn areas for a site. */
    public function index(RestorationSite $restorationSite): JsonResponse
    {
        $areas = $restorationSite->areas()
            ->orderBy('type')->orderByDesc('id')
            ->get(['id', 'restoration_site_id', 'type', 'geojson', 'area_hectares', 'note', 'created_at']);

        return response()->json($areas);
    }

    /** menro/admin/staff — add a drawn area. */
    public function store(Request $request, RestorationSite $restorationSite): JsonResponse
    {
        $validated = $request->validate([
            'type'          => 'required|in:' . implode(',', SiteArea::TYPES),
            'geojson'       => 'required|string',
            'area_hectares' => 'nullable|numeric|min:0',
            'note'          => 'nullable|string|max:255',
        ]);

        $area = $restorationSite->areas()->create([
            'created_by'    => auth()->id(),
            'type'          => $validated['type'],
            'geojson'       => $validated['geojson'],
            'area_hectares' => $validated['area_hectares'] ?? null,
            'note'          => $validated['note'] ?? null,
        ]);

        $this->syncSiteTotals($restorationSite);

        return response()->json(['message' => 'Area added.', 'area' => $area], 201);
    }

    /** menro/admin/staff — update a drawn area (e.g. edited vertices). */
    public function update(Request $request, RestorationSite $restorationSite, SiteArea $area): JsonResponse
    {
        abort_unless($area->restoration_site_id === $restorationSite->id, 404);

        $validated = $request->validate([
            'type'          => 'sometimes|in:' . implode(',', SiteArea::TYPES),
            'geojson'       => 'sometimes|string',
            'area_hectares' => 'nullable|numeric|min:0',
            'note'          => 'nullable|string|max:255',
        ]);

        $area->update($validated);
        $this->syncSiteTotals($restorationSite);

        return response()->json(['message' => 'Area updated.', 'area' => $area->fresh()]);
    }

    /** menro/admin/staff — delete a drawn area. */
    public function destroy(RestorationSite $restorationSite, SiteArea $area): JsonResponse
    {
        abort_unless($area->restoration_site_id === $restorationSite->id, 404);
        $area->delete();
        $this->syncSiteTotals($restorationSite);

        return response()->json(['message' => 'Area removed.']);
    }

    /**
     * Keep the site's headline figures in step with its drawn areas:
     *   total planted  = sum of 'planted' areas' hectares
     *   total mangrove = largest 'mangrove' area's hectares (the site extent)
     * Planted never exceeds the total area, so grow the total if needed.
     */
    private function syncSiteTotals(RestorationSite $site): void
    {
        $areas = $site->areas()->get();
        $planted  = round($areas->where('type', 'planted')->sum('area_hectares'), 4);
        $mangrove = round((float) $areas->where('type', 'mangrove')->max('area_hectares'), 4);

        $total = max($mangrove, $planted, (float) $site->area_hectares);
        $site->update([
            'planted_hectares' => $planted > 0 ? $planted : $site->planted_hectares,
            'area_hectares'    => $total > 0 ? $total : $site->area_hectares,
        ]);
    }
}

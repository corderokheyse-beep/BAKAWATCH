<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MangroveSpecies;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MangroveSpeciesController extends Controller
{
    /** Public: active species list for form dropdowns and autocomplete. */
    public function index(Request $request): JsonResponse
    {
        $query = MangroveSpecies::query()->orderBy('scientific_name');

        // Admin/staff/menro may request the full list including inactive ones.
        $role = $request->user()?->role;
        if (! in_array($role, ['admin', 'staff', 'menro'], true)) {
            $query->where('is_active', true);
        } elseif ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    /**
     * Public: configurable reference data (species + lifecycle statuses) so the
     * frontend never has to hardcode these lists.
     */
    public function reference(): JsonResponse
    {
        return response()->json([
            'species'            => MangroveSpecies::active()->orderBy('scientific_name')->get(),
            'lifecycle_statuses' => config('monitoring.lifecycle_statuses', []),
        ]);
    }

    /** admin/staff/menro: create a species. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scientific_name' => 'required|string|max:255|unique:mangrove_species,scientific_name',
            'local_name'      => 'nullable|string|max:255',
            'family'          => 'nullable|string|max:255',
            'description'     => 'nullable|string',
            'ml_supported'    => 'nullable|boolean',
            'is_active'       => 'nullable|boolean',
        ]);

        $species = MangroveSpecies::create($validated);
        ActivityLog::record('species.created', $species, [], $species->toArray());

        return response()->json($species, 201);
    }

    /** admin/staff/menro: update a species. */
    public function update(Request $request, MangroveSpecies $mangroveSpecies): JsonResponse
    {
        $validated = $request->validate([
            'scientific_name' => 'sometimes|string|max:255|unique:mangrove_species,scientific_name,' . $mangroveSpecies->id,
            'local_name'      => 'nullable|string|max:255',
            'family'          => 'nullable|string|max:255',
            'description'     => 'nullable|string',
            'ml_supported'    => 'nullable|boolean',
            'is_active'       => 'nullable|boolean',
        ]);

        $before = $mangroveSpecies->toArray();
        $mangroveSpecies->update($validated);
        ActivityLog::record('species.updated', $mangroveSpecies, $before, $mangroveSpecies->toArray());

        return response()->json($mangroveSpecies);
    }

    /**
     * admin/staff/menro: soft-remove a species by deactivating it. We never
     * hard-delete because historical records reference the species by name.
     */
    public function destroy(MangroveSpecies $mangroveSpecies): JsonResponse
    {
        $mangroveSpecies->update(['is_active' => false]);
        ActivityLog::record('species.deactivated', $mangroveSpecies, [], []);

        return response()->json(['message' => 'Species deactivated.']);
    }
}

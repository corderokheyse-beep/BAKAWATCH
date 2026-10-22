<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    /** Public/authenticated: active announcements visible to the current user's role */
    public function index(Request $request): JsonResponse
    {
        $role = auth()->check() ? auth()->user()->role : 'public';

        $announcements = Announcement::active()
            ->with('author:id,name')
            ->orderByDesc('created_at')
            ->get()
            ->filter(function (Announcement $a) use ($role) {
                // If target_roles is empty/null it applies to everyone
                if (empty($a->target_roles)) return true;
                $roles = array_map('trim', explode(',', $a->target_roles));
                return in_array($role, $roles) || in_array('all', $roles);
            })
            ->values();

        return response()->json($announcements);
    }

    /** Admin/staff: list all announcements including inactive */
    public function adminIndex(): JsonResponse
    {
        return response()->json(
            Announcement::with('author:id,name')->orderByDesc('created_at')->get()
        );
    }

    /** Admin/staff: create announcement */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'        => 'required|string|max:255',
            'content'      => 'required|string',
            'type'         => 'required|in:info,warning,success,urgent',
            'is_active'    => 'boolean',
            'expires_at'   => 'nullable|date|after:now',
            'target_roles' => 'nullable|string|max:255',
        ]);

        $announcement = Announcement::create(array_merge($validated, [
            'author_id' => auth()->id(),
        ]));

        return response()->json([
            'message'      => 'Announcement created.',
            'announcement' => $announcement->load('author:id,name'),
        ], 201);
    }

    /** Admin/staff: update announcement */
    public function update(Request $request, Announcement $announcement): JsonResponse
    {
        $validated = $request->validate([
            'title'        => 'sometimes|string|max:255',
            'content'      => 'sometimes|string',
            'type'         => 'sometimes|in:info,warning,success,urgent',
            'is_active'    => 'boolean',
            'expires_at'   => 'nullable|date',
            'target_roles' => 'nullable|string|max:255',
        ]);

        $announcement->update($validated);

        return response()->json([
            'message'      => 'Announcement updated.',
            'announcement' => $announcement->fresh('author:id,name'),
        ]);
    }

    /** Admin/staff: delete announcement */
    public function destroy(Announcement $announcement): JsonResponse
    {
        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted.']);
    }
}

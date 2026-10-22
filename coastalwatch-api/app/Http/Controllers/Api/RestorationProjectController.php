<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\ProjectUpdate;
use App\Models\ProjectVolunteer;
use App\Models\RestorationProject;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestorationProjectController extends Controller
{
    public function __construct(private CloudinaryService $cloudinary) {}

    public function index(Request $request): JsonResponse
    {
        $projects = RestorationProject::with(['creator:id,name', 'volunteers'])
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->search, fn($q) => $q->where('name', 'like', "%{$request->search}%"))
            ->withCount('volunteers')
            ->latest()
            ->paginate(15);

        return response()->json($projects);
    }

    public function mapData(): JsonResponse
    {
        $projects = RestorationProject::select([
            'id', 'name', 'latitude', 'longitude', 'status',
            'progress_percent', 'trees_planted', 'trees_target',
        ])->get();

        return response()->json($projects);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'           => 'required|string|max:255',
            'description'    => 'required|string|max:5000',
            'latitude'       => 'required|numeric|between:-90,90',
            'longitude'      => 'required|numeric|between:-180,180',
            'location_name'  => 'required|string|max:255',
            'area_hectares'  => 'nullable|numeric|min:0',
            'trees_target'   => 'required|integer|min:1',
            'start_date'     => 'nullable|date',
            'end_date'       => 'nullable|date|after:start_date',
            'image'          => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($request->hasFile('image')) {
            $result = $this->cloudinary->upload($request->file('image'), 'projects');
            $validated['image_url'] = $result['secure_url'];
        }

        $project = RestorationProject::create(array_merge($validated, [
            'created_by' => auth()->id(),
        ]));

        ActivityLog::record('project.created', $project);

        return response()->json([
            'message' => 'Project created.',
            'project' => $project->load('creator:id,name'),
        ], 201);
    }

    public function show(RestorationProject $restorationProject): JsonResponse
    {
        return response()->json(
            $restorationProject->load(['creator:id,name', 'volunteerUsers:id,name,email', 'updates.author:id,name'])
        );
    }

    public function update(Request $request, RestorationProject $restorationProject): JsonResponse
    {
        $validated = $request->validate([
            'name'            => 'sometimes|string|max:255',
            'description'     => 'sometimes|string|max:5000',
            'status'          => 'sometimes|in:planned,active,completed,suspended',
            'progress_percent'=> 'sometimes|integer|between:0,100',
            'trees_planted'   => 'sometimes|integer|min:0',
            'trees_target'    => 'sometimes|integer|min:1',
            'start_date'      => 'nullable|date',
            'end_date'        => 'nullable|date',
            'image'           => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($request->hasFile('image')) {
            $result = $this->cloudinary->upload($request->file('image'), 'projects');
            $validated['image_url'] = $result['secure_url'];
        }

        $restorationProject->update($validated);
        ActivityLog::record('project.updated', $restorationProject);

        return response()->json(['message' => 'Project updated.', 'project' => $restorationProject]);
    }

    public function addUpdate(Request $request, RestorationProject $restorationProject): JsonResponse
    {
        $validated = $request->validate([
            'title'                 => 'required|string|max:255',
            'content'               => 'required|string|max:5000',
            'trees_planted_update'  => 'required|integer|min:0',
            'image'                 => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($request->hasFile('image')) {
            $result = $this->cloudinary->upload($request->file('image'), 'project-updates');
            $validated['image_url'] = $result['secure_url'];
        }

        $update = $restorationProject->updates()->create(array_merge($validated, [
            'user_id' => auth()->id(),
        ]));

        // Update total trees planted
        $restorationProject->increment('trees_planted', $validated['trees_planted_update']);

        // Auto-update progress
        if ($restorationProject->trees_target > 0) {
            $progress = min(100, round(($restorationProject->trees_planted / $restorationProject->trees_target) * 100));
            $restorationProject->update(['progress_percent' => $progress]);
        }

        return response()->json(['message' => 'Update posted.', 'update' => $update->load('author:id,name')], 201);
    }

    public function joinVolunteer(Request $request, RestorationProject $restorationProject): JsonResponse
    {
        $existing = ProjectVolunteer::where('project_id', $restorationProject->id)
            ->where('user_id', auth()->id())
            ->first();

        if ($existing) {
            return response()->json(['message' => 'Already a volunteer.'], 409);
        }

        ProjectVolunteer::create([
            'project_id'  => $restorationProject->id,
            'user_id'     => auth()->id(),
            'role'        => 'volunteer',
            'joined_date' => now()->toDateString(),
        ]);

        ActivityLog::record('project.volunteer_joined', $restorationProject);

        return response()->json(['message' => 'Joined as volunteer.'], 201);
    }

    public function leaveVolunteer(RestorationProject $restorationProject): JsonResponse
    {
        ProjectVolunteer::where('project_id', $restorationProject->id)
            ->where('user_id', auth()->id())
            ->delete();

        return response()->json(['message' => 'Left the project.']);
    }
}

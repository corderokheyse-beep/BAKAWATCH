<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SitePhoto;
use App\Models\RestorationSite;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SitePhotoController extends Controller
{
    public function __construct(private CloudinaryService $cloudinary) {}

    /** field_worker / menro — upload a site photo */
    public function store(Request $request, RestorationSite $restorationSite): JsonResponse
    {
        $validated = $request->validate([
            'photo'      => 'required|file|mimes:jpeg,png,webp|max:10240',
            'photo_type' => 'required|in:before,after',
        ]);

        try {
            $result = $this->cloudinary->upload($request->file('photo'), 'site-photos');
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Site photo upload skipped: ' . $e->getMessage());
            $result = ['secure_url' => null, 'public_id' => null];
        }

        $photo = SitePhoto::create([
            'restoration_site_id'  => $restorationSite->id,
            'uploaded_by'          => $request->user()->id,
            'cloudinary_url'       => $result['secure_url'] ?? '',
            'cloudinary_public_id' => $result['public_id']  ?? '',
            'photo_type'           => $validated['photo_type'],
        ]);

        return response()->json($photo, 201);
    }

    /** menro / admin — list photos for a site, filterable by photo_type */
    public function index(Request $request, RestorationSite $restorationSite): JsonResponse
    {
        $photos = SitePhoto::where('restoration_site_id', $restorationSite->id)
            ->when($request->photo_type, fn($q) => $q->where('photo_type', $request->photo_type))
            ->with('uploader:id,name')
            ->latest()
            ->get();

        return response()->json($photos);
    }
}

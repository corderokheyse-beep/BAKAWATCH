<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ArticleController extends Controller
{
    public function __construct(private CloudinaryService $cloudinary) {}

    /** Public: list published articles with optional category filter */
    public function index(Request $request): JsonResponse
    {
        $articles = Article::published()
            ->with('author:id,name')
            ->when($request->category, fn($q) => $q->where('category', $request->category))
            ->when($request->search, fn($q) => $q->where(function ($q) use ($request) {
                $q->where('title', 'like', "%{$request->search}%")
                  ->orWhere('excerpt', 'like', "%{$request->search}%");
            }))
            ->orderByDesc('published_at')
            ->paginate($request->per_page ?? 12);

        return response()->json($articles);
    }

    /** Public: single article by slug, increment view count */
    public function show(string $slug): JsonResponse
    {
        $article = Article::published()->where('slug', $slug)
            ->with('author:id,name')
            ->firstOrFail();

        $article->increment('views');

        return response()->json($article);
    }

    /** Admin/staff: list ALL articles (draft + published) */
    public function adminIndex(): JsonResponse
    {
        $articles = Article::with('author:id,name')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($articles);
    }

    /** Admin/staff: create article */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'        => 'required|string|max:255',
            'excerpt'      => 'nullable|string|max:500',
            'content'      => 'required|string',
            'category'     => 'required|in:tips,news,guide,research',
            'is_published' => 'boolean',
            'cover_image'  => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $imageData = [];
        if ($request->hasFile('cover_image')) {
            $result = $this->cloudinary->upload($request->file('cover_image'), 'articles');
            $imageData = [
                'cover_image_url'       => $result['secure_url'],
                'cover_image_public_id' => $result['public_id'],
            ];
        }

        $article = Article::create(array_merge($validated, $imageData, [
            'author_id'    => auth()->id(),
            'slug'         => Article::generateSlug($validated['title']),
            'published_at' => ($validated['is_published'] ?? false) ? now() : null,
        ]));

        return response()->json(['message' => 'Article created.', 'article' => $article->load('author:id,name')], 201);
    }

    /** Admin/staff: update article */
    public function update(Request $request, Article $article): JsonResponse
    {
        $validated = $request->validate([
            'title'        => 'sometimes|string|max:255',
            'excerpt'      => 'nullable|string|max:500',
            'content'      => 'sometimes|string',
            'category'     => 'sometimes|in:tips,news,guide,research',
            'is_published' => 'boolean',
            'cover_image'  => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($request->hasFile('cover_image')) {
            if ($article->cover_image_public_id) {
                $this->cloudinary->delete($article->cover_image_public_id);
            }
            $result = $this->cloudinary->upload($request->file('cover_image'), 'articles');
            $validated['cover_image_url']       = $result['secure_url'];
            $validated['cover_image_public_id'] = $result['public_id'];
        }

        // Set published_at when first publishing
        if (isset($validated['is_published']) && $validated['is_published'] && ! $article->published_at) {
            $validated['published_at'] = now();
        }

        $article->update($validated);

        return response()->json(['message' => 'Article updated.', 'article' => $article->fresh('author:id,name')]);
    }

    /** Admin/staff: delete article */
    public function destroy(Article $article): JsonResponse
    {
        if ($article->cover_image_public_id) {
            $this->cloudinary->delete($article->cover_image_public_id);
        }
        $article->delete();

        return response()->json(['message' => 'Article deleted.']);
    }
}

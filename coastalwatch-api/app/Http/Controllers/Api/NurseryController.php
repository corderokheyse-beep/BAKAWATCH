<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Nursery;
use Illuminate\Http\JsonResponse;

class NurseryController extends Controller
{
    /** Public: active nurseries for the inventory source dropdown. */
    public function index(): JsonResponse
    {
        return response()->json(
            Nursery::active()->orderBy('name')->get(['id', 'name', 'location'])
        );
    }
}

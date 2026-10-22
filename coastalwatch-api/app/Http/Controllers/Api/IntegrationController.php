<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\IntegrationSyncLog;
use App\Services\IntegrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function __construct(private IntegrationService $integrations) {}

    /** admin — connector configuration status + CSV import availability. */
    public function status(): JsonResponse
    {
        return response()->json([
            'connectors' => $this->integrations->connectorStatus(),
            'csv_import' => [
                'enabled'     => (bool) config('integrations.csv_import.enabled', true),
                'max_rows'    => (int) config('integrations.csv_import.max_rows', 5000),
                'max_file_kb' => (int) config('integrations.csv_import.max_file_kb', 5120),
            ],
            'notice' => 'No official government API is bundled. External connectors stay pending until an authorized endpoint and credentials are configured.',
        ]);
    }

    /** admin — recent synchronisation / import log entries. */
    public function logs(): JsonResponse
    {
        return response()->json(
            IntegrationSyncLog::with('triggeredBy:id,name')
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
        );
    }

    /** admin — attempt to sync a connector (honest pending unless configured). */
    public function sync(Request $request, string $connector): JsonResponse
    {
        $result = $this->integrations->syncConnector($connector, $request->user()->id);
        ActivityLog::record('integration.sync', null, [], ['connector' => $connector, 'result' => $result['status']]);
        return response()->json($result);
    }

    /** admin — import plantation records from an authorized CSV file. */
    public function importCsv(Request $request): JsonResponse
    {
        $maxKb = (int) config('integrations.csv_import.max_file_kb', 5120);
        $request->validate([
            'file' => "required|file|mimes:csv,txt|max:{$maxKb}",
        ]);

        $file   = $request->file('file');
        $result = $this->integrations->importPlantationCsv(
            $file->getRealPath(),
            $file->getClientOriginalName(),
            $request->user()->id
        );

        ActivityLog::record('integration.csv_import', null, [], [
            'source' => $file->getClientOriginalName(),
            'status' => $result['status'] ?? 'unknown',
        ]);

        $code = ($result['status'] ?? '') === 'failed' ? 422 : 200;
        return response()->json($result, $code);
    }
}

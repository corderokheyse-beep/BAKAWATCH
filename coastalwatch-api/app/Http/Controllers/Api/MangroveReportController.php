<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GeneratedReport;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class MangroveReportController extends Controller
{
    public function __construct(private ReportService $reportService) {}

    /** menro / admin — generate a report and store the audit record */
    public function generate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'report_type'  => 'required|in:monthly,lgu,denr,nursery,threat_monitoring',
            'site_id'      => 'nullable|integer|exists:restoration_sites,id',
            'date_from'    => 'nullable|date',
            'date_to'      => 'nullable|date|after_or_equal:date_from',
            'year_month'   => 'nullable|string|regex:/^\d{4}-\d{2}$/',
            'species_name' => 'nullable|string|max:150',
        ]);

        $reportType  = $validated['report_type'];
        $siteId      = isset($validated['site_id']) ? (int) $validated['site_id'] : null;
        $yearMonth   = $validated['year_month'] ?? now()->format('Y-m');
        $dateFrom    = $validated['date_from']  ?? now()->startOfMonth()->toDateString();
        $dateTo      = $validated['date_to']    ?? now()->toDateString();
        $speciesName = $validated['species_name'] ?? null;

        // Nursery & threat-monitoring reports can filter by month too: expand
        // year_month to a range when explicit dates were not supplied.
        if (in_array($reportType, ['nursery', 'threat_monitoring'], true)
            && empty($validated['date_from']) && empty($validated['date_to'])) {
            $dateFrom = "{$yearMonth}-01";
            $dateTo   = date('Y-m-t', strtotime($dateFrom));
        }

        try {
            $data = match ($reportType) {
                'monthly' => $this->reportService->generateMonthly($siteId ?? 0, $yearMonth),
                'lgu'     => $this->reportService->generateLgu($dateFrom, $dateTo),
                'denr'    => $this->reportService->generateDenr($siteId ?? 0, $dateFrom, $dateTo),
                'nursery' => $this->reportService->generateNursery(
                    $siteId ?? 0,
                    $validated['date_from'] ?? ($reportType === 'nursery' && !empty($validated['year_month']) ? $dateFrom : null),
                    $validated['date_to']   ?? ($reportType === 'nursery' && !empty($validated['year_month']) ? $dateTo : null),
                    $speciesName
                ),
                'threat_monitoring' => $this->reportService->generateThreatMonitoring($dateFrom, $dateTo, $siteId ?? 0),
            };
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Report generation failed: ' . $e->getMessage(),
            ], 500);
        }

        // Store audit record
        $generated = GeneratedReport::create([
            'generated_by'        => $request->user()->id,
            'restoration_site_id' => $siteId,
            'report_type'         => $reportType,
            'date_from'           => $validated['date_from'] ?? null,
            'date_to'             => $validated['date_to']   ?? null,
        ]);

        // Official documentation metadata (preparer + reference number).
        $user = $request->user();
        $data['prepared_by']      = $user->name;
        $data['prepared_by_role'] = $this->roleTitle($user->role);
        $data['generated_at']     = now()->toIso8601String();
        $data['report_ref']       = $this->reportRef($reportType, $generated->id);

        return response()->json([
            'report'    => $data,
            'generated' => $generated,
        ]);
    }

    /** Human-readable position title for a user role (for signature blocks). */
    private function roleTitle(string $role): string
    {
        return match ($role) {
            'menro'       => 'MENRO Officer',
            'admin'       => 'System Administrator',
            'staff'       => 'MENRO Staff',
            'denr'        => 'DENR Representative',
            'evaluator'   => 'Technical Evaluator',
            default       => ucfirst($role),
        };
    }

    /** Deterministic reference number, e.g. BW-NURSERY-2026-000014. */
    private function reportRef(string $type, int $id): string
    {
        return sprintf('BW-%s-%s-%06d', strtoupper($type), now()->format('Y'), $id);
    }

    /** menro / admin — stream a generated report as CSV download */
    public function export(GeneratedReport $generatedReport): Response
    {
        $reportType = $generatedReport->report_type;

        $data = match ($reportType) {
            'monthly' => $this->reportService->generateMonthly(
                (int) $generatedReport->restoration_site_id,
                $generatedReport->date_from?->format('Y-m') ?? now()->format('Y-m')
            ),
            'lgu' => $this->reportService->generateLgu(
                $generatedReport->date_from?->toDateString() ?? now()->startOfMonth()->toDateString(),
                $generatedReport->date_to?->toDateString()   ?? now()->toDateString()
            ),
            'denr' => $this->reportService->generateDenr(
                (int) $generatedReport->restoration_site_id,
                $generatedReport->date_from?->toDateString() ?? now()->startOfMonth()->toDateString(),
                $generatedReport->date_to?->toDateString()   ?? now()->toDateString()
            ),
            'nursery' => $this->reportService->generateNursery(
                (int) $generatedReport->restoration_site_id,
                $generatedReport->date_from?->toDateString(),
                $generatedReport->date_to?->toDateString(),
                null
            ),
            'threat_monitoring' => $this->reportService->generateThreatMonitoring(
                $generatedReport->date_from?->toDateString() ?? now()->startOfMonth()->toDateString(),
                $generatedReport->date_to?->toDateString()   ?? now()->toDateString(),
                (int) $generatedReport->restoration_site_id
            ),
            default => [],
        };

        $csv      = $this->reportService->exportToCsv($data, $reportType);
        $filename = "report-{$reportType}-{$generatedReport->id}.csv";

        return response($csv, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /** menro / admin — list auth user's generated reports */
    public function index(Request $request): JsonResponse
    {
        $reports = GeneratedReport::where('generated_by', $request->user()->id)
            ->with('site:id,name')
            ->latest()
            ->get();

        return response()->json($reports);
    }
}

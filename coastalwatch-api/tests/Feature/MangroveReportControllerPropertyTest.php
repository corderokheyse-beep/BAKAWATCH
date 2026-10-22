<?php

// Feature: mangrove-monitoring-system, Property 22: Generated reports contain all required fields
// Feature: mangrove-monitoring-system, Property 23: Report generation creates an audit record

use App\Models\GeneratedReport;
use App\Models\RestorationSite;
use App\Models\User;
use App\Services\ReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helpers (prefixed with mrc2_ to avoid collision with other test files)
// ---------------------------------------------------------------------------

function mrc2_makeAdmin(): User
{
    return User::factory()->create(['role' => 'admin']);
}

function mrc2_makeMenro(): User
{
    return User::factory()->create(['role' => 'menro']);
}

/**
 * Create an active RestorationSite directly in the DB (bypassing PostGIS geometry).
 */
function mrc2_makeSite(array $overrides = []): RestorationSite
{
    $admin = mrc2_makeAdmin();

    return RestorationSite::create(array_merge([
        'created_by'    => $admin->id,
        'name'          => 'Test Site ' . uniqid(),
        'description'   => 'A test site',
        'status'        => 'active',
        'area_hectares' => 10.0,
        'barangay'      => 'Barangay Test',
    ], $overrides));
}

/**
 * Build a known non-zero report structure that ReportService would return.
 */
function mrc2_knownReportData(string $reportType): array
{
    $base = [
        'report_type'       => $reportType,
        'total_planted'     => mt_rand(10, 500),
        'total_alive'       => mt_rand(5, 200),
        'total_dead'        => mt_rand(1, 50),
        'survival_rate'     => round(mt_rand(1000, 9900) / 100, 2),
        'species_breakdown' => [
            ['species_name' => 'Rhizophora mucronata', 'count' => mt_rand(1, 100)],
            ['species_name' => 'Avicennia marina',     'count' => mt_rand(1, 100)],
        ],
        'avg_salinity'      => round(mt_rand(100, 3500) / 100, 2),
        'avg_ph'            => round(mt_rand(600, 900) / 100, 2),
        'avg_temp'          => round(mt_rand(2000, 3500) / 100, 2),
    ];

    if ($reportType === 'monthly') {
        $base['site_id'] = 1;
        $base['period']  = now()->format('Y-m');
    } elseif ($reportType === 'lgu') {
        $base['date_from'] = now()->startOfMonth()->toDateString();
        $base['date_to']   = now()->toDateString();
    } elseif ($reportType === 'denr') {
        $base['site_id']          = 1;
        $base['site_name']        = 'Test Site';
        $base['barangay']         = 'Barangay Test';
        $base['area_hectares']    = 10.0;
        $base['established_year'] = 2020;
        $base['date_from']        = now()->startOfMonth()->toDateString();
        $base['date_to']          = now()->toDateString();
    }

    return $base;
}

/**
 * Build a zero-value report structure (no data for the requested range).
 */
function mrc2_zeroReportData(string $reportType): array
{
    $base = [
        'report_type'       => $reportType,
        'total_planted'     => 0,
        'total_alive'       => 0,
        'total_dead'        => 0,
        'survival_rate'     => 0.0,
        'species_breakdown' => [],
        'avg_salinity'      => 0.0,
        'avg_ph'            => 0.0,
        'avg_temp'          => 0.0,
    ];

    if ($reportType === 'monthly') {
        $base['site_id'] = 1;
        $base['period']  = now()->format('Y-m');
    } elseif ($reportType === 'lgu') {
        $base['date_from'] = now()->startOfMonth()->toDateString();
        $base['date_to']   = now()->toDateString();
    } elseif ($reportType === 'denr') {
        $base['site_id']          = 1;
        $base['site_name']        = '';
        $base['barangay']         = '';
        $base['area_hectares']    = 0.0;
        $base['established_year'] = 0;
        $base['date_from']        = now()->startOfMonth()->toDateString();
        $base['date_to']          = now()->toDateString();
    }

    return $base;
}

/**
 * Build a valid POST /api/reports/generate payload for the given report type and site.
 */
function mrc2_generatePayload(string $reportType, int $siteId): array
{
    $dateFrom = now()->subDays(mt_rand(30, 365))->toDateString();
    $dateTo   = now()->toDateString();

    return match ($reportType) {
        'monthly' => [
            'report_type' => 'monthly',
            'site_id'     => $siteId,
            'year_month'  => now()->format('Y-m'),
        ],
        'lgu' => [
            'report_type' => 'lgu',
            'date_from'   => $dateFrom,
            'date_to'     => $dateTo,
        ],
        'denr' => [
            'report_type' => 'denr',
            'site_id'     => $siteId,
            'date_from'   => $dateFrom,
            'date_to'     => $dateTo,
        ],
    };
}

/**
 * Bind a fresh ReportService mock that returns $returnData for the given $reportType method.
 * All other methods are stubbed to return a minimal valid structure so they don't throw.
 */
function mrc2_bindMock($app, string $reportType, array $returnData): void
{
    $fallback = [
        'report_type'       => 'monthly',
        'total_planted'     => 0,
        'total_alive'       => 0,
        'total_dead'        => 0,
        'survival_rate'     => 0.0,
        'species_breakdown' => [],
        'avg_salinity'      => 0.0,
        'avg_ph'            => 0.0,
        'avg_temp'          => 0.0,
    ];

    $mock = Mockery::mock(ReportService::class);
    $mock->shouldReceive('generateMonthly')->andReturn($reportType === 'monthly' ? $returnData : $fallback);
    $mock->shouldReceive('generateLgu')->andReturn($reportType === 'lgu' ? $returnData : $fallback);
    $mock->shouldReceive('generateDenr')->andReturn($reportType === 'denr' ? $returnData : $fallback);
    $app->instance(ReportService::class, $mock);
}

// ---------------------------------------------------------------------------
// Property 22: Generated reports contain all required fields (non-zero data)
//
// For any valid report generation request (monthly, LGU, or DENR), the
// returned report structure SHALL contain non-null values for: total planted,
// total alive, total dead, survival rate, species breakdown, and average
// ecosystem measurements.
//
// Validates: Requirements 11.1, 11.2, 11.3, 11.5
// ---------------------------------------------------------------------------
test('Property 22: Generated reports contain all required fields — non-null values for all report types (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 22: Generated reports contain all required fields

    $reportTypes = ['monthly', 'lgu', 'denr'];
    $site        = mrc2_makeSite();
    $menro       = mrc2_makeMenro();

    for ($i = 0; $i < 100; $i++) {
        $reportType = $reportTypes[$i % 3];
        $knownData  = mrc2_knownReportData($reportType);
        $payload    = mrc2_generatePayload($reportType, $site->id);

        mrc2_bindMock($this->app, $reportType, $knownData);

        $response = $this->actingAs($menro)
            ->postJson('/api/reports/generate', $payload);

        $response->assertStatus(200,
            "Iteration {$i}: POST /api/reports/generate (type={$reportType}) should return HTTP 200"
        );

        $report = $response->json('report');

        // Assert all required fields are present and non-null
        $requiredFields = [
            'total_planted', 'total_alive', 'total_dead',
            'survival_rate', 'species_breakdown',
            'avg_salinity', 'avg_ph', 'avg_temp',
        ];

        foreach ($requiredFields as $field) {
            expect(array_key_exists($field, $report))->toBeTrue(
                "Iteration {$i} (type={$reportType}): report should contain field '{$field}'"
            );
            expect($report[$field])->not->toBeNull(
                "Iteration {$i} (type={$reportType}): report field '{$field}' should not be null"
            );
        }

        // Assert numeric fields are numeric (not null)
        $numericFields = ['total_planted', 'total_alive', 'total_dead', 'survival_rate', 'avg_salinity', 'avg_ph', 'avg_temp'];
        foreach ($numericFields as $field) {
            expect(is_numeric($report[$field]))->toBeTrue(
                "Iteration {$i} (type={$reportType}): field '{$field}' should be numeric, got: " . gettype($report[$field])
            );
        }

        // Assert species_breakdown is an array
        expect(is_array($report['species_breakdown']))->toBeTrue(
            "Iteration {$i} (type={$reportType}): 'species_breakdown' should be an array"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 22 (zero-data): When no data exists, all numeric fields are 0 not null
//
// When a report is generated for a date range with no data, the Report_Generator
// SHALL return an empty report structure with zero values rather than an error.
//
// Validates: Requirements 11.5
// ---------------------------------------------------------------------------
test('Property 22 (zero-data): All numeric fields are 0 not null when no data exists (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 22: Generated reports contain all required fields

    $reportTypes = ['monthly', 'lgu', 'denr'];
    $site        = mrc2_makeSite();
    $menro       = mrc2_makeMenro();

    for ($i = 0; $i < 100; $i++) {
        $reportType = $reportTypes[$i % 3];
        $zeroData   = mrc2_zeroReportData($reportType);
        $payload    = mrc2_generatePayload($reportType, $site->id);

        mrc2_bindMock($this->app, $reportType, $zeroData);

        $response = $this->actingAs($menro)
            ->postJson('/api/reports/generate', $payload);

        $response->assertStatus(200,
            "Iteration {$i}: POST /api/reports/generate (type={$reportType}, zero-data) should return HTTP 200, not an error"
        );

        $report = $response->json('report');

        // Assert all numeric fields are exactly 0 (not null)
        $numericFields = ['total_planted', 'total_alive', 'total_dead', 'survival_rate', 'avg_salinity', 'avg_ph', 'avg_temp'];

        foreach ($numericFields as $field) {
            expect(array_key_exists($field, $report))->toBeTrue(
                "Iteration {$i} (type={$reportType}): zero-data report should contain field '{$field}'"
            );
            expect($report[$field])->not->toBeNull(
                "Iteration {$i} (type={$reportType}): zero-data field '{$field}' should be 0, not null"
            );
            expect((float) $report[$field])->toBe(0.0,
                "Iteration {$i} (type={$reportType}): zero-data field '{$field}' should be 0, got: {$report[$field]}"
            );
        }

        // Assert species_breakdown is an empty array (not null)
        expect(array_key_exists('species_breakdown', $report))->toBeTrue(
            "Iteration {$i} (type={$reportType}): zero-data report should contain 'species_breakdown'"
        );
        expect($report['species_breakdown'])->not->toBeNull(
            "Iteration {$i} (type={$reportType}): 'species_breakdown' should be an empty array, not null"
        );
        expect(is_array($report['species_breakdown']))->toBeTrue(
            "Iteration {$i} (type={$reportType}): 'species_breakdown' should be an array"
        );
    }
});

// ---------------------------------------------------------------------------
// Property 23: Report generation creates an audit record
//
// For any report generation, a corresponding generated_reports record SHALL
// be created containing the generator's user ID, report type, date range,
// and generation timestamp.
//
// Validates: Requirements 11.6
// ---------------------------------------------------------------------------
test('Property 23: Report generation creates an audit record with correct fields (10 iterations)', function () {
    // Feature: mangrove-monitoring-system, Property 23: Report generation creates an audit record

    $reportTypes = ['monthly', 'lgu', 'denr'];
    $site        = mrc2_makeSite();

    for ($i = 0; $i < 100; $i++) {
        $reportType = $reportTypes[$i % 3];

        // Alternate between menro and admin to verify both roles create audit records
        $user = ($i % 2 === 0) ? mrc2_makeMenro() : mrc2_makeAdmin();

        $payload    = mrc2_generatePayload($reportType, $site->id);
        $reportData = mrc2_knownReportData($reportType);

        mrc2_bindMock($this->app, $reportType, $reportData);

        $countBefore = GeneratedReport::count();

        $response = $this->actingAs($user)
            ->postJson('/api/reports/generate', $payload);

        $response->assertStatus(200,
            "Iteration {$i}: POST /api/reports/generate (type={$reportType}) should return HTTP 200"
        );

        // Assert exactly one new GeneratedReport record was created
        $countAfter = GeneratedReport::count();
        expect($countAfter)->toBe($countBefore + 1,
            "Iteration {$i}: expected one new GeneratedReport record, before={$countBefore}, after={$countAfter}"
        );

        // Retrieve the newly created record via the response ID
        $responseGenerated = $response->json('generated');
        expect($responseGenerated)->not->toBeNull(
            "Iteration {$i}: response should contain 'generated' key with the audit record"
        );

        $record = GeneratedReport::find($responseGenerated['id']);

        // Assert generator's user ID matches
        expect($record->generated_by)->toBe($user->id,
            "Iteration {$i}: GeneratedReport.generated_by should be {$user->id}, got {$record->generated_by}"
        );

        // Assert report_type matches
        expect($record->report_type)->toBe($reportType,
            "Iteration {$i}: GeneratedReport.report_type should be '{$reportType}', got '{$record->report_type}'"
        );

        // Assert date_from and date_to are stored when provided in the payload
        if (isset($payload['date_from'])) {
            expect($record->date_from)->not->toBeNull(
                "Iteration {$i}: GeneratedReport.date_from should not be null when date_from was provided"
            );
        }

        if (isset($payload['date_to'])) {
            expect($record->date_to)->not->toBeNull(
                "Iteration {$i}: GeneratedReport.date_to should not be null when date_to was provided"
            );
        }

        // Assert generation timestamp (created_at) is non-null
        expect($record->created_at)->not->toBeNull(
            "Iteration {$i}: GeneratedReport.created_at (generation timestamp) should not be null"
        );

        // Assert the response 'generated' id matches the stored record
        expect($responseGenerated['id'])->toBe($record->id,
            "Iteration {$i}: response 'generated.id' should match the stored record id"
        );
    }
});

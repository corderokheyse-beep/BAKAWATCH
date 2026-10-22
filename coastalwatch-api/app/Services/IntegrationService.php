<?php

namespace App\Services;

use App\Models\IntegrationSyncLog;
use App\Models\PlantationRecord;
use App\Models\RestorationSite;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Integration layer for MENRO / DENR / agency data exchange.
 *
 * Design principles (per project rules):
 *  - Never invent a government API URL, credential, or successful sync result.
 *  - Every external connector is disabled until a real, authorized endpoint and
 *    credentials are configured via environment variables.
 *  - An authorized CSV import is provided as the working alternative today.
 *  - Every attempt is logged (integration_sync_logs) with source attribution.
 */
class IntegrationService
{
    /** Report the configured connectors and their honest status. */
    public function connectorStatus(): array
    {
        $out = [];
        foreach (config('integrations.connectors', []) as $key => $cfg) {
            $configured = ! empty($cfg['base_url']) && ! empty($cfg['api_key']);
            $out[] = [
                'connector'   => $key,
                'label'       => $cfg['label'] ?? $key,
                'enabled'     => (bool) ($cfg['enabled'] ?? false),
                'configured'  => $configured,
                // Only 'ready' when explicitly enabled AND real credentials exist.
                'state'       => ($cfg['enabled'] ?? false) && $configured ? 'ready' : 'pending',
                'status_note' => $cfg['status_note'] ?? null,
            ];
        }
        return $out;
    }

    /**
     * Attempt to sync with an external connector.
     *
     * This intentionally does NOT contact any endpoint or fabricate a result.
     * If the connector is not both enabled and fully configured with real
     * credentials, it records a 'skipped' log and returns a clear pending state.
     * Real request logic is added here only once an authorized endpoint exists.
     */
    public function syncConnector(string $connector, ?int $userId = null): array
    {
        $cfg = config("integrations.connectors.$connector");

        if (! $cfg) {
            return ['status' => 'failed', 'message' => "Unknown connector: {$connector}."];
        }

        $configured = ! empty($cfg['base_url']) && ! empty($cfg['api_key']);

        if (! ($cfg['enabled'] ?? false) || ! $configured) {
            $this->log($connector, 'import', 'skipped', 0, 0, $cfg['base_url'] ?? null,
                'Connector not enabled or missing authorized endpoint/credentials.', $userId);

            return [
                'status'  => 'pending',
                'message' => $cfg['status_note']
                    ?? 'This integration is pending. No authorized endpoint or credentials are configured.',
            ];
        }

        // NOTE: Real, authorized request/parse/dedupe logic goes here once a
        // documented government endpoint and credentials are available. Until
        // then we do not simulate a successful synchronisation.
        $this->log($connector, 'import', 'skipped', 0, 0, $cfg['base_url'],
            'Live sync not yet implemented for this authorized connector.', $userId);

        return [
            'status'  => 'pending',
            'message' => 'Connector is configured but live synchronisation logic is not yet implemented.',
        ];
    }

    /**
     * Import plantation records from an authorized CSV file.
     *
     * Expected header columns (case-insensitive):
     *   restoration_site_id, species_name, date_planted, latitude, longitude,
     *   seedling_source (optional), client_key (optional)
     *
     * Rows with an existing client_key are skipped (dedupe). Invalid rows are
     * skipped and counted; the whole import is logged with source attribution.
     */
    public function importPlantationCsv(string $absolutePath, string $sourceName, ?int $userId = null): array
    {
        $maxRows = (int) config('integrations.csv_import.max_rows', 5000);

        $handle = @fopen($absolutePath, 'r');
        if ($handle === false) {
            return ['status' => 'failed', 'message' => 'Unable to open the uploaded file.'];
        }

        $header = fgetcsv($handle);
        if ($header === false) {
            fclose($handle);
            return ['status' => 'failed', 'message' => 'The file is empty.'];
        }
        $cols = array_map(fn($h) => strtolower(trim((string) $h)), $header);

        $required = ['restoration_site_id', 'species_name', 'date_planted', 'latitude', 'longitude'];
        foreach ($required as $r) {
            if (! in_array($r, $cols, true)) {
                fclose($handle);
                return ['status' => 'failed', 'message' => "Missing required column: {$r}."];
            }
        }

        $imported = 0;
        $skipped  = 0;
        $rowNum   = 0;
        $errors   = [];

        DB::beginTransaction();
        try {
            while (($row = fgetcsv($handle)) !== false) {
                $rowNum++;
                if ($rowNum > $maxRows) {
                    $errors[] = "Row limit ({$maxRows}) exceeded — remaining rows skipped.";
                    break;
                }

                $data = [];
                foreach ($cols as $i => $col) {
                    $data[$col] = isset($row[$i]) ? trim((string) $row[$i]) : null;
                }

                // Validate essentials
                $siteId = (int) ($data['restoration_site_id'] ?? 0);
                $lat    = is_numeric($data['latitude'] ?? null) ? (float) $data['latitude'] : null;
                $lng    = is_numeric($data['longitude'] ?? null) ? (float) $data['longitude'] : null;

                if (! $siteId || empty($data['species_name']) || empty($data['date_planted'])
                    || $lat === null || $lng === null
                    || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180
                    || ! RestorationSite::whereKey($siteId)->exists()) {
                    $skipped++;
                    continue;
                }

                // Dedupe on client_key when supplied.
                $clientKey = ! empty($data['client_key']) ? $data['client_key'] : null;
                if ($clientKey && PlantationRecord::where('client_key', $clientKey)->exists()) {
                    $skipped++;
                    continue;
                }

                PlantationRecord::create([
                    'restoration_site_id' => $siteId,
                    'submitted_by'        => $userId,
                    'species_name'        => $data['species_name'],
                    'date_planted'        => $data['date_planted'],
                    'seedling_source'     => $data['seedling_source'] ?? null,
                    'latitude'            => $lat,
                    'longitude'           => $lng,
                    'status'              => 'active',
                    'gps_source'          => 'manual',   // imported coordinates
                    'location_verified'   => false,      // imported → needs verification
                    'client_key'          => $clientKey ?: (string) Str::uuid(),
                    'source'              => 'csv_import',
                ]);
                $imported++;
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            fclose($handle);
            $this->log('csv_import', 'import', 'failed', 0, $skipped, $sourceName, $e->getMessage(), $userId);
            return ['status' => 'failed', 'message' => 'Import failed: ' . $e->getMessage()];
        }

        fclose($handle);

        $status = $imported > 0 ? ($skipped > 0 ? 'partial' : 'success') : 'skipped';
        $this->log('csv_import', 'import', $status, $imported, $skipped, $sourceName,
            implode(' ', $errors) ?: null, $userId);

        return [
            'status'           => $status,
            'records_imported' => $imported,
            'records_skipped'  => $skipped,
            'message'          => "Imported {$imported} record(s), skipped {$skipped}. Imported records are marked source=csv_import and require verification.",
        ];
    }

    private function log(string $connector, string $direction, string $status, int $imported, int $skipped, ?string $source, ?string $message, ?int $userId): void
    {
        IntegrationSyncLog::create([
            'connector'        => $connector,
            'direction'        => $direction,
            'status'           => $status,
            'records_imported' => $imported,
            'records_skipped'  => $skipped,
            'source'           => $source,
            'message'          => $message,
            'triggered_by'     => $userId,
        ]);
    }
}

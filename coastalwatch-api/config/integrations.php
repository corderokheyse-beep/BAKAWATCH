<?php

/*
|--------------------------------------------------------------------------
| Government / Agency Integration Configuration
|--------------------------------------------------------------------------
|
| Configuration for future or existing MENRO / DENR / agency data-sharing
| integrations.
|
| IMPORTANT: No official government API endpoints, credentials, or data-sharing
| permissions are bundled with this system. Every connector below is DISABLED
| and marked as a PENDING stub until a real, documented, authorized endpoint and
| credentials are provided by the agency and configured via environment
| variables. Nothing here fabricates a government URL or a successful sync.
|
| Credentials MUST be supplied via environment variables (server-side only) and
| are never exposed to the frontend.
|
*/

return [

    'connectors' => [

        'denr' => [
            'label'       => 'DENR data-sharing API',
            'enabled'     => (bool) env('DENR_API_ENABLED', false),
            'base_url'    => env('DENR_API_BASE_URL'),      // no default — must be provided
            'api_key'     => env('DENR_API_KEY'),           // server-side only
            'timeout'     => (int) env('DENR_API_TIMEOUT', 15),
            // Until a real endpoint + credentials are configured this stays 'pending'.
            'status_note' => 'Pending — no authorized DENR endpoint or credentials configured.',
        ],

        'menro' => [
            'label'       => 'MENRO LGU data-sharing API',
            'enabled'     => (bool) env('MENRO_API_ENABLED', false),
            'base_url'    => env('MENRO_API_BASE_URL'),
            'api_key'     => env('MENRO_API_KEY'),
            'timeout'     => (int) env('MENRO_API_TIMEOUT', 15),
            'status_note' => 'Pending — no authorized MENRO endpoint or credentials configured.',
        ],

    ],

    // Authorized manual data exchange available today (no external API needed).
    'csv_import' => [
        'enabled'      => true,
        'max_rows'     => (int) env('CSV_IMPORT_MAX_ROWS', 5000),
        'max_file_kb'  => (int) env('CSV_IMPORT_MAX_FILE_KB', 5120),
    ],

];

<?php

/*
|--------------------------------------------------------------------------
| Mangrove Monitoring Methodology
|--------------------------------------------------------------------------
|
| Configurable environmental-monitoring rules for BANTAY BAKAWAN.
|
| IMPORTANT: These values are a CONFIGURABLE DEFAULT and are NOT an official
| MENRO or DENR methodology. They must be validated and confirmed by the
| Municipal Environment and Natural Resources Office and/or DENR before any
| computed survival rate is treated as official. The `version` string is
| stamped onto every survival-rate result so that historical figures remain
| traceable to the methodology in force when they were computed.
|
| Override any of these via environment variables (see keys below) without
| editing code.
|
*/

return [

    'survival' => [
        // Methodology version stamped on every survival-rate calculation.
        // Bump this whenever the rules below change so results stay traceable.
        'methodology_version' => env('SURVIVAL_METHODOLOGY_VERSION', 'configurable-default-v1'),

        // Human-readable formula shown alongside every result.
        'formula' => 'Survival Rate (%) = (living monitored seedlings / eligible seedlings originally planted) x 100',

        // Denominator basis:
        //   'planted_records' = one plantation_record == one eligible seedling (per-record tracking)
        //   'batch_quantity'  = sum of originally planted quantities from seedling batches
        // Default is per-record because the current schema tracks individual
        // plantation_records. Switch to batch_quantity once batch counts are the
        // source of truth confirmed by MENRO/DENR.
        'denominator_basis' => env('SURVIVAL_DENOMINATOR_BASIS', 'planted_records'),

        // Whether replacement seedlings count toward the denominator.
        // Official methodology pending confirmation — default excludes them so
        // survival reflects the ORIGINAL cohort.
        'include_replacements_in_denominator' => (bool) env('SURVIVAL_INCLUDE_REPLACEMENTS', false),

        // How to treat plantation records that have NO monitoring observation
        // in the period. Options:
        //   'exclude'         = not counted as alive or dead (reduces coverage %)
        //   'count_as_dead'   = treated as a confirmed death (NOT recommended
        //                       unless the approved protocol says so)
        // Default 'exclude' avoids treating missing observations as deaths.
        'unmonitored_treatment' => env('SURVIVAL_UNMONITORED_TREATMENT', 'exclude'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Inventory lifecycle statuses
    |--------------------------------------------------------------------------
    |
    | Configurable lifecycle categories for mangrove inventory records. These
    | must be validated against the monitoring protocol used by MENRO / DENR.
    | Maturity is NOT inferred from age automatically — a status is only set
    | from an approved classification or a field observation.
    |
    | 'value' is stored; 'label' is shown; 'is_alive' marks statuses that count
    | toward living totals in survival/inventory figures.
    |
    */
    'lifecycle_statuses' => [
        ['value' => 'seedling',            'label' => 'Seedling',              'is_alive' => true],
        ['value' => 'established_young',   'label' => 'Established young',     'is_alive' => true],
        ['value' => 'growing',             'label' => 'Growing mangrove',     'is_alive' => true],
        ['value' => 'mature',              'label' => 'Mature mangrove',      'is_alive' => true],
        ['value' => 'damaged',             'label' => 'Damaged / restoring',  'is_alive' => true],
        ['value' => 'dead',                'label' => 'Dead',                 'is_alive' => false],
        ['value' => 'missing',             'label' => 'Missing',              'is_alive' => false],
    ],

];

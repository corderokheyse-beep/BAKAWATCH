/**
 * Shared application constants.
 */

/**
 * Allowed seedling-source options for new plantation records.
 *
 * Defined once and reused by the plantation form and anywhere else that needs
 * the canonical list. Server-side validation mirrors these values in
 * PlantationRecordController.
 *
 * NOTE: Legacy records may contain free-text values (e.g.
 * "DENR-PENRO Oriental Mindoro Nursery", "LGU GLORIA", "DENR", "NURSERY").
 * Those are preserved and displayed as-is — detail/table views render the raw
 * stored string. Only NEW entries are constrained to this list.
 */
export const SEEDLING_SOURCES = ['Provincial', 'PENRO', 'Nursery'] as const

export type SeedlingSource = (typeof SEEDLING_SOURCES)[number]

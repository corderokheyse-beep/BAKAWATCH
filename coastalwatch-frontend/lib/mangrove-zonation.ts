// ─────────────────────────────────────────────────────────────────────────────
// Mangrove zonation reference (Gloria, Oriental Mindoro).
//
// Maps each mangrove species (by scientific name) to its tidal zonation /
// environment, per MENRO's Zonation Summary Table. Used to show a "Zonation"
// column in the Inventory records and in the exported MENRO Provincial report.
// This is a stable botanical reference, so it lives in the frontend rather than
// requiring a DB column.
// ─────────────────────────────────────────────────────────────────────────────

export interface ZonationEntry {
  zone: string          // Detailed tidal zonation / environment (table label)
  simple: SimpleZone    // Simplified zone used by the Add Inventory form
  habitat?: string      // Key habitat trait (optional, for tooltips/reports)
}

// Simplified zonation vocabulary used in the Add Inventory Entry form.
export type SimpleZone =
  | 'Seaward'
  | 'Seaward to Middle Zone'
  | 'Middle Intertidal Zone'
  | 'Middle to Landward Zone'
  | 'Riverine'
  | 'Brackish Estuary'
  | 'Landward'

export const SIMPLE_ZONES: SimpleZone[] = [
  'Seaward',
  'Seaward to Middle Zone',
  'Middle Intertidal Zone',
  'Middle to Landward Zone',
  'Riverine',
  'Brackish Estuary',
  'Landward',
]

// Short, plain-language description shown under the auto-filled Zonation field
// so the user understands the kind of zone it is.
export const ZONE_DESCRIPTIONS: Record<SimpleZone, string> = {
  'Seaward':                 'Outer coastal fringe — exposed to direct waves and full sea salinity; pioneer species thrive here.',
  'Seaward to Middle Zone':  'Transition from the open shore inward — sandy, coralline, or rocky seaward exposures.',
  'Middle Intertidal Zone':  'Regularly tide-flushed muddy flats — the core mangrove belt with deep, soft substrates.',
  'Middle to Landward Zone': 'Inner intertidal toward land — well-drained soils, submerged only on higher tides.',
  'Riverine':                'Along river estuaries and inner banks — lower salinity with freshwater influence.',
  'Brackish Estuary':        'Tidal river edges and upper estuarine channels — mixed fresh and salt water.',
  'Landward':                'Upper intertidal / landward fringe — high or hypersaline soils, flooded only on spring tides.',
}

// Keyed by lowercased scientific name for case-insensitive lookup.
const ZONATION: Record<string, ZonationEntry> = {
  'avicennia marina':      { zone: 'Seaward / Outer Zone',        simple: 'Seaward',                 habitat: 'Highly pioneer species; exposed to direct wave action and high salinity.' },
  'sonneratia alba':       { zone: 'Seaward / Outer Zone',        simple: 'Seaward',                 habitat: 'Pioneer species; tolerates deep mud, full sea-salinity, and high wave energy.' },
  'rhizophora stylosa':    { zone: 'Seaward to Middle Zone',      simple: 'Seaward to Middle Zone',  habitat: 'Common in sandy, coralline, or rocky seaward exposures.' },
  'rhizophora apiculata':  { zone: 'Middle Intertidal Zone',      simple: 'Middle Intertidal Zone',  habitat: 'Prefers deep, soft, organic-rich muddy soils with regular tidal flushing.' },
  'rhizophora mucronata':  { zone: 'Middle Intertidal Zone',      simple: 'Middle Intertidal Zone',  habitat: 'Prefers deep mud along banks and sheltered intertidal areas.' },
  'bruguiera gymnorhiza':  { zone: 'Middle to Landward Zone',     simple: 'Middle to Landward Zone', habitat: 'Well-drained muddy soil; submerged during medium-to-high spring tides.' },
  'bruguiera cylindrica':  { zone: 'Middle Intertidal Zone',      simple: 'Middle Intertidal Zone',  habitat: 'Forms dense stands on stiff clay/muddy substrates.' },
  'bruguiera sexangula':   { zone: 'Middle to Landward Zone',     simple: 'Middle to Landward Zone', habitat: 'Tolerates lower salinity; extends toward inland brackish boundaries.' },
  'avicennia officinalis': { zone: 'Middle to Landward / Riverine', simple: 'Riverine',              habitat: 'Prefers lower salinity along river estuaries and inner banks.' },
  'sonneratia caseolaris': { zone: 'Riverine / Brackish Estuary', simple: 'Brackish Estuary',        habitat: 'Low-salinity pioneer along riverbanks and upper estuarine channels.' },
  'nypa fruticans':        { zone: 'Brackish Estuary / Riverbanks', simple: 'Brackish Estuary',      habitat: 'Shallow brackish waters along tidal river edges with high freshwater inflow.' },
  'ceriops tagal':         { zone: 'Landward / High Intertidal Zone', simple: 'Landward',             habitat: 'High soil salinity; flooded only during high spring tides.' },
  'lumnitzera racemosa':   { zone: 'Landward / High Intertidal Zone', simple: 'Landward',             habitat: 'Firm, dry, or hypersaline upper intertidal zones with rare tidal inundation.' },
  'xylocarpus granatum':   { zone: 'Landward / Inner Fringe',     simple: 'Landward',                habitat: 'Firm mud or sandy substrates in upper intertidal margins.' },
  'heritiera littoralis':  { zone: 'Landward / Coastal Transition Zone', simple: 'Landward',          habitat: 'Upper limit of high tides; dry landward edge receiving freshwater runoff.' },
}

/** Resolve the tidal zonation for a species by its scientific name. */
export function getZonation(scientificName?: string | null): ZonationEntry | null {
  if (!scientificName) return null
  return ZONATION[scientificName.trim().toLowerCase()] ?? null
}

/** Short (detailed) zone label (or an em dash) for table cells. */
export function zonationLabel(scientificName?: string | null): string {
  return getZonation(scientificName)?.zone ?? '—'
}

/** Simplified zone for a species (the 7-value vocabulary), or null. */
export function simpleZoneFor(scientificName?: string | null): SimpleZone | null {
  return getZonation(scientificName)?.simple ?? null
}

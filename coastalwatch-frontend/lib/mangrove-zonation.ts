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
// Includes all 36 Philippine mangrove species from the "Field Guide to Philippine Mangroves"
// (Dr. J. H. Primavera / SEAFDEC / ZSL-Philippines / PTFCF).
const ZONATION: Record<string, ZonationEntry> = {
  // ── Acanthaceae ────────────────────────────────────────────────────────────
  'acanthus ebracteatus':        { zone: 'Landward / Riverine Margins',         simple: 'Landward',                 habitat: 'Mid-to-high intertidal and brackish tidal creek banks.' },
  'acanthus ilicifolius':        { zone: 'Landward / Riverine Margins',         simple: 'Landward',                 habitat: 'Common along brackish waterways and disturbed upper mangrove borders.' },
  'acanthus volubilis':          { zone: 'Landward / Riverine Margins',         simple: 'Landward',                 habitat: 'Scrambles over other shrubs along upper tidal and riverbank borders.' },

  // ── Pteridaceae ────────────────────────────────────────────────────────────
  'acrostichum aureum':          { zone: 'Landward / Disturbed High Intertidal', simple: 'Landward',                habitat: 'Upper intertidal, bunds, and clear-felled or degraded mangrove areas.' },
  'acrostichum speciosum':       { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Shaded interior mangrove understory and moist middle-to-back zones.' },

  // ── Myrsinaceae / Primulaceae ──────────────────────────────────────────────
  'aegiceras corniculatum':      { zone: 'Riverine / Brackish Estuary',         simple: 'Riverine',                 habitat: 'Muddy banks of tidal rivers and estuarine channels with freshwater mixing.' },
  'aegiceras floridum':          { zone: 'Seaward to Middle Zone',              simple: 'Seaward to Middle Zone',   habitat: 'Prefers rocky, sandy, or coralline limestone substrates facing open water.' },

  // ── Avicenniaceae / Acanthaceae ────────────────────────────────────────────
  'avicennia alba':              { zone: 'Seaward / Outer Pioneer Zone',        simple: 'Seaward',                 habitat: 'Primary pioneer on soft newly formed mudflats facing open bays.' },
  'avicennia marina':            { zone: 'Seaward / Outer Zone',                simple: 'Seaward',                 habitat: 'Highly pioneer species; exposed to direct wave action and high salinity.' },
  'avicennia officinalis':       { zone: 'Middle to Landward / Riverine',        simple: 'Riverine',                 habitat: 'Prefers lower salinity along river estuaries and inner banks.' },
  'avicennia rumphiana':         { zone: 'Landward / High Intertidal Zone',      simple: 'Landward',                 habitat: 'Upper intertidal zone on firm sandy-mud or rocky substrates.' },

  // ── Tiliaceae / Malvaceae ──────────────────────────────────────────────────
  'brownlowia tersa':            { zone: 'Riverine / Brackish Estuary',         simple: 'Riverine',                 habitat: 'Inner banks of tidal rivers with moderate to high freshwater influence.' },

  // ── Rhizophoraceae ─────────────────────────────────────────────────────────
  'bruguiera cylindrica':        { zone: 'Middle Intertidal Zone',              simple: 'Middle Intertidal Zone',   habitat: 'Forms dense stands on stiff clay/muddy substrates.' },
  'bruguiera gymnorrhiza':       { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Well-drained muddy soil; submerged during medium-to-high spring tides.' },
  'bruguiera gymnorhiza':        { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Well-drained muddy soil; submerged during medium-to-high spring tides.' },
  'bruguiera parviflora':        { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Interior mangrove forest on firm clay or mud behind pioneer belt.' },
  'bruguiera sexangula':         { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Tolerates lower salinity; extends toward inland brackish boundaries.' },
  'ceriops decandra':            { zone: 'Landward / High Intertidal Zone',     simple: 'Landward',                 habitat: 'Upper intertidal flats flooded only by high spring tides; high salinity.' },
  'ceriops tagal':               { zone: 'Landward / High Intertidal Zone',     simple: 'Landward',                 habitat: 'High soil salinity; flooded only during high spring tides.' },
  'kandelia candel':             { zone: 'Middle Intertidal Zone',              simple: 'Middle Intertidal Zone',   habitat: 'Estuarine rivers and sheltered bays with regular tidal flushing.' },
  'rhizophora apiculata':        { zone: 'Middle Intertidal Zone',              simple: 'Middle Intertidal Zone',   habitat: 'Prefers deep, soft, organic-rich muddy soils with regular tidal flushing.' },
  'rhizophora mucronata':        { zone: 'Middle Intertidal Zone',              simple: 'Middle Intertidal Zone',   habitat: 'Prefers deep mud along banks and sheltered intertidal areas.' },
  'rhizophora stylosa':          { zone: 'Seaward to Middle Zone',              simple: 'Seaward to Middle Zone',   habitat: 'Common in sandy, coralline, or rocky seaward exposures.' },

  // ── Bombacaceae / Malvaceae ────────────────────────────────────────────────
  'camptostemon philippinensis': { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Interior mangrove forest and riverine margins on firm muddy substrate.' },

  // ── Euphorbiaceae ──────────────────────────────────────────────────────────
  'excoecaria agallocha':        { zone: 'Landward / High Spring Tide Fringe',  simple: 'Landward',                 habitat: 'High spring tide mark and terrestrial border with rare seawater flooding.' },

  // ── Sterculiaceae / Malvaceae ──────────────────────────────────────────────
  'heritiera littoralis':        { zone: 'Landward / Coastal Transition Zone',  simple: 'Landward',                 habitat: 'Upper limit of high tides; dry landward edge receiving freshwater runoff.' },

  // ── Combretaceae ───────────────────────────────────────────────────────────
  'lumnitzera littorea':         { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Firm sandy-muddy substrate along inland edges and brackish streams.' },
  'lumnitzera racemosa':         { zone: 'Landward / High Intertidal Zone',     simple: 'Landward',                 habitat: 'Firm, dry, or hypersaline upper intertidal zones with rare tidal inundation.' },

  // ── Arecaceae ──────────────────────────────────────────────────────────────
  'nypa fruticans':              { zone: 'Brackish Estuary / Riverbanks',        simple: 'Brackish Estuary',         habitat: 'Shallow brackish waters along tidal river edges with high freshwater inflow.' },

  // ── Myrtaceae ──────────────────────────────────────────────────────────────
  'osbornia octodonta':          { zone: 'Seaward to Middle Zone',              simple: 'Seaward to Middle Zone',   habitat: 'Exposed rocky, coralline, or coarse sandy substrates on open foreshores.' },

  // ── Lythraceae ─────────────────────────────────────────────────────────────
  'pemphis acidula':             { zone: 'Seaward / Rocky Foreshore',           simple: 'Seaward',                  habitat: 'Exposed coral rock, limestone outcrops, and high-energy seaward reef flats.' },

  // ── Rubiaceae ──────────────────────────────────────────────────────────────
  'scyphiphora hydrophyllacea':  { zone: 'Middle to Landward Zone',             simple: 'Middle to Landward Zone',  habitat: 'Sandy-muddy substrates along tidal waterways and middle-to-back flats.' },

  // ── Sonneratiaceae / Lythraceae ────────────────────────────────────────────
  'sonneratia alba':             { zone: 'Seaward / Outer Zone',                simple: 'Seaward',                 habitat: 'Pioneer species; tolerates deep mud, full sea-salinity, and high wave energy.' },
  'sonneratia caseolaris':       { zone: 'Riverine / Brackish Estuary',         simple: 'Brackish Estuary',         habitat: 'Low-salinity pioneer along riverbanks and upper estuarine channels.' },
  'sonneratia ovata':            { zone: 'Landward / Riverine',                 simple: 'Landward',                 habitat: 'Upper riverine banks and landward margins with freshwater seepage.' },

  // ── Meliaceae ──────────────────────────────────────────────────────────────
  'xylocarpus granatum':         { zone: 'Landward / Inner Fringe',             simple: 'Landward',                 habitat: 'Firm mud or sandy substrates in upper intertidal margins.' },
  'xylocarpus moluccensis':      { zone: 'Landward / Rocky-Sandy Littoral',     simple: 'Landward',                 habitat: 'Well-drained rocky or sandy substrates in upper littoral and beach borders.' },
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

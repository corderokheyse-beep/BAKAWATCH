<?php

namespace Database\Seeders;

use App\Models\MangroveSpecies;
use Illuminate\Database\Seeder;

class MangroveSpeciesSeeder extends Seeder
{
    /**
     * Seeds the mangrove species reference table.
     *
     * The 6 ml_supported species mirror the ml-service classifier's class
     * labels and metadata (see COASTAL WATCH/ml-service/main.py SPECIES_INFO).
     * The remaining entries are common Philippine mangroves recognised in the
     * field but NOT yet part of the trained model (ml_supported = false).
     */
    public function run(): void
    {
        $species = [
            // ── ML-supported (trained classes) ──────────────────────────────
            ['Avicennia marina',       'Api-api',        'Acanthaceae',    'Grey mangrove with small oval leaves and pencil-like pneumatophores. Common in sandy and muddy shores.', true],
            ['Bruguiera gymnorrhiza',  'Busain',         'Rhizophoraceae', 'Large-leafed orange mangrove with knee-like roots. Found in the middle and landward zones.', true],
            ['Ceriops tagal',          'Malatangal',     'Rhizophoraceae', 'Spurred mangrove with small leathery leaves. Tolerates high salinity; common in upper intertidal zones.', true],
            ['Rhizophora apiculata',   'Bakawan bato',   'Rhizophoraceae', 'True mangrove with distinctive stilt roots. Dominant species in Philippine mangrove forests.', true],
            ['Rhizophora mucronata',   'Bakawan lalaki', 'Rhizophoraceae', 'Loop-root mangrove with larger leaves than R. apiculata. Grows in the seaward fringe.', true],
            ['Sonneratia alba',        'Pagatpat',       'Lythraceae',     'Mangrove apple with white flowers and round fruit. Pioneer species on newly deposited sediments.', true],

            // ── Recognised in the field, not yet ML-supported ───────────────
            ['Avicennia officinalis',  'Api-api',        'Acanthaceae',    'Indian mangrove with yellow flowers. Found in the landward intertidal zone.', false],
            ['Xylocarpus granatum',    'Tabigi',         'Meliaceae',      'Cannonball mangrove with large round fruit and buttress roots.', false],
            ['Lumnitzera racemosa',    'Kulasi',         'Combretaceae',   'White-flowered mangrove of the landward margin.', false],
            ['Nypa fruticans',         'Nipa / Sasa',    'Arecaceae',      'Mangrove palm growing along tidal rivers and estuaries.', false],
            ['Rhizophora stylosa',     'Bakawan babae',  'Rhizophoraceae', 'Stilt-rooted mangrove tolerant of exposed, high-energy shores.', false],
            ['Bruguiera cylindrica',   'Pototan lalaki', 'Rhizophoraceae', 'Small-leafed orange mangrove of the mid-intertidal zone.', false],
            ['Bruguiera sexangula',    'Pototan',        'Rhizophoraceae', 'Upriver orange mangrove with knee roots; tolerates lower salinity.', false],
            ['Ceriops decandra',       'Tangal',         'Rhizophoraceae', 'Spurred mangrove of the landward zone with yellowish bark.', false],
            ['Sonneratia caseolaris',  'Pedada',         'Lythraceae',     'Mangrove apple of brackish riverbanks with red-tipped flowers.', false],
            ['Aegiceras corniculatum', 'Saging-saging',  'Primulaceae',    'River mangrove with clustered white flowers and horn-shaped fruit.', false],
            ['Excoecaria agallocha',   'Buta-buta',      'Euphorbiaceae',  'Blind-your-eye mangrove with milky irritant sap; landward margin.', false],
            ['Heritiera littoralis',   'Dungon-late',    'Malvaceae',      'Looking-glass mangrove with buttress roots and silvery leaf undersides.', false],
        ];

        foreach ($species as [$sci, $local, $family, $desc, $ml]) {
            MangroveSpecies::updateOrCreate(
                ['scientific_name' => $sci],
                ['local_name' => $local, 'family' => $family, 'description' => $desc, 'ml_supported' => $ml, 'is_active' => true]
            );
        }
    }
}

<?php

namespace Database\Seeders;

use App\Models\MangroveSpecies;
use App\Models\RestorationSite;
use Illuminate\Database\Seeder;

class SiteSpeciesSeeder extends Seeder
{
    /**
     * Links documented mangrove species to each restoration site (biodiversity
     * inventory). Matches sites by barangay so it is resilient to id changes.
     * Idempotent: syncs the pivot each run. Species are matched by scientific
     * name against the mangrove_species reference table.
     */
    public function run(): void
    {
        // Full documented species set for the Agsalin reserve and realistic
        // subsets for the other sites. Keyed by barangay.
        $byBarangay = [
            // Agsalin reserve — the most biodiverse site (full inventory).
            'Agsalin' => [
                'Avicennia marina', 'Avicennia officinalis', 'Bruguiera gymnorrhiza',
                'Bruguiera cylindrica', 'Bruguiera sexangula', 'Ceriops tagal',
                'Ceriops decandra', 'Rhizophora apiculata', 'Rhizophora mucronata',
                'Rhizophora stylosa', 'Sonneratia alba', 'Sonneratia caseolaris',
                'Xylocarpus granatum', 'Lumnitzera racemosa', 'Aegiceras corniculatum',
                'Excoecaria agallocha', 'Heritiera littoralis',
            ],
            'Maragooc' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Avicennia marina',
                'Sonneratia alba', 'Ceriops tagal', 'Bruguiera gymnorrhiza',
                'Nypa fruticans', 'Xylocarpus granatum',
            ],
            'Guimbonan' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Avicennia marina',
                'Avicennia officinalis', 'Sonneratia alba', 'Lumnitzera racemosa',
            ],
            'Sta. Theresa' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Rhizophora stylosa',
                'Sonneratia alba', 'Sonneratia caseolaris', 'Aegiceras corniculatum',
                'Nypa fruticans',
            ],
            'Balete' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Avicennia marina',
                'Ceriops tagal', 'Sonneratia alba',
            ],
            'San Antonio' => [
                'Rhizophora apiculata', 'Avicennia marina', 'Sonneratia alba',
                'Bruguiera gymnorrhiza', 'Ceriops tagal', 'Excoecaria agallocha',
            ],
            'Kawit' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Avicennia marina',
                'Sonneratia alba',
            ],
            'Tambong' => [
                'Rhizophora apiculata', 'Rhizophora mucronata', 'Avicennia marina',
                'Avicennia officinalis', 'Sonneratia alba', 'Ceriops tagal',
                'Bruguiera gymnorrhiza', 'Lumnitzera racemosa', 'Nypa fruticans',
            ],
        ];

        $speciesByName = MangroveSpecies::pluck('id', 'scientific_name');

        foreach ($byBarangay as $barangay => $names) {
            $site = RestorationSite::where('barangay', $barangay)->first();
            if (! $site) continue;

            $ids = collect($names)
                ->map(fn($n) => $speciesByName[$n] ?? null)
                ->filter()
                ->values()
                ->all();

            $site->speciesList()->sync($ids);
        }
    }
}

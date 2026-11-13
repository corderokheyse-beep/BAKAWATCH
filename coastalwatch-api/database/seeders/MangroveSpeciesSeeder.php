<?php

namespace Database\Seeders;

use App\Models\MangroveSpecies;
use Illuminate\Database\Seeder;

class MangroveSpeciesSeeder extends Seeder
{
    /**
     * Seeds the mangrove species reference table with all 36 Philippine mangrove
     * species documented in the authoritative "Field Guide to Philippine Mangroves"
     * by Dr. J. H. Primavera (ZSL-Philippines / PTFCF / SEAFDEC).
     *
     * The 13 ml_supported species correspond to the ml-service classifier's trained
     * class labels (see COASTAL WATCH/ml-service/class_labels.json and main.py).
     * The remaining 23 species are recognised in the field but not yet part of the
     * active ML classifier (ml_supported = false).
     */
    public function run(): void
    {
        $species = [
            // ── ML-Supported Classes (Trained in ML Service) ─────────────────
            [
                'Aegiceras corniculatum',
                'Saging-saging / Tinduk-tindukan',
                'Myrsinaceae',
                'River mangrove shrub with fragrant white flower clusters and curved horn-like cylindrical fruits.',
                true,
            ],
            [
                'Avicennia marina',
                'Bungalon / Apiapi / Miapi',
                'Avicenniaceae',
                'Grey mangrove with small oval leaves and pencil-like pneumatophores. Pioneer on exposed sandy and muddy shores.',
                true,
            ],
            [
                'Avicennia officinalis',
                'Bungalon / Apiapi / Miapi',
                'Avicenniaceae',
                'Indian mangrove with rounded/obovate leaf tips, yellow-orange flowers, and heart-shaped fruit. Found along river estuaries and mid-to-landward flats.',
                true,
            ],
            [
                'Bruguiera cylindrica',
                'Pototan / Busain / Pototan lalaki',
                'Rhizophoraceae',
                'Small-leafed orange mangrove with knee roots, greenish reflexed calyx lobes, and slender cylindrical straight propagules.',
                true,
            ],
            [
                'Bruguiera gymnorrhiza',
                'Pototan / Busain',
                'Rhizophoraceae',
                'Large-leafed orange mangrove with knee roots, solitary large red flowers, and heavy ribbed propagules. Middle and landward zones.',
                true,
            ],
            [
                'Ceriops tagal',
                'Tungog / Tangal',
                'Rhizophoraceae',
                'Spurred mangrove with yellow-green leaves, pendulous flowers, and warty ridged propagules with reflexed calyx collar. High salinity tolerant.',
                true,
            ],
            [
                'Lumnitzera racemosa',
                'Tabao / Culasi',
                'Combretaceae',
                'White teruntum mangrove with small white flowers in axillary clusters and fleshy obovate leaves. Found on dry, hypersaline upper flats.',
                true,
            ],
            [
                'Rhizophora apiculata',
                'Bakhaw lalaki',
                'Rhizophoraceae',
                'True mangrove with prominent stilt roots, pairs of sessile flowers beneath foliage, and smooth cylindrical hypocotyls.',
                true,
            ],
            [
                'Rhizophora mucronata',
                'Bakhaw babae',
                'Rhizophoraceae',
                'Loop-rooted mangrove with broad dark green leaves ending in a sharp spike (mucronate tip), 4–8 flowers per stalk, and long warty propagules.',
                true,
            ],
            [
                'Rhizophora stylosa',
                'Bakhaw bato',
                'Rhizophoraceae',
                'Stilt-rooted mangrove with long conspicuous styles (4–6 mm) and mucronate leaves. Pioneer on sandy, rocky, and coralline reef-flats.',
                true,
            ],
            [
                'Sonneratia alba',
                'Pagatpat',
                'Sonneratiaceae',
                'Mangrove apple with cone-shaped pneumatophores, leathery rounded leaves, white brush-like stamens, and star-shaped calyx base.',
                true,
            ],
            [
                'Sonneratia caseolaris',
                'Pedada',
                'Sonneratiaceae',
                'Mangrove apple of brackish riverbanks with tall pneumatophores, red petiole bases, bright crimson stamens, and flat spreading calyx lobes.',
                true,
            ],
            [
                'Xylocarpus granatum',
                'Tabigi',
                'Meliaceae',
                'Cannonball mangrove with prominent undulating ribbon-like plank buttress roots, smooth peeling bark, and large spherical fruit (10–25 cm).',
                true,
            ],

            // ── Recognised Field Species (Field Guide to Philippine Mangroves) ─
            [
                'Acanthus ebracteatus',
                'Lagiwliw / Ragoyroy',
                'Acanthaceae',
                'Sea holly shrub with spiny holly-like leaves and white flowers without bracteoles. Inhabits upper intertidal and brackish waterways.',
                false,
            ],
            [
                'Acanthus ilicifolius',
                'Lagiwliw / Ragoyroy',
                'Acanthaceae',
                'Spiny sea holly with light blue to violet flowers with bracteoles. Common along brackish channels and disturbed mangrove margins.',
                false,
            ],
            [
                'Acanthus volubilis',
                'Lagiwliw / Ragoyroy',
                'Acanthaceae',
                'Twining spineless sea holly with smooth-margined leaves and white flowers. Scrambles over other mangrove shrubs along tidal banks.',
                false,
            ],
            [
                'Acrostichum aureum',
                'Palaypay / Lagolo',
                'Pteridaceae',
                'Large coarse mangrove fern forming dense stands. Pinnae leaflets have blunt or rounded tips. Abundant in clear-felled and elevated landward sites.',
                false,
            ],
            [
                'Acrostichum speciosum',
                'Palaypay',
                'Pteridaceae',
                'Mangrove fern distinguishable by elongated to sharply pointed leaflet tips. Thrives in shaded forest interiors and middle-to-landward zones.',
                false,
            ],
            [
                'Aegiceras floridum',
                'Saging-saging / Tinduk-tindukan',
                'Myrsinaceae',
                'River mangrove tree with white flowers, distinguished from A. corniculatum by straight (not curved) horn-like fruits. Prefers sandy/limestone shores.',
                false,
            ],
            [
                'Avicennia alba',
                'Bungalon / Apiapi / Miapi',
                'Avicenniaceae',
                'Mangrove tree with lanceolate pointed leaves, chalky-white leaf undersides, pencil pneumatophores, and conical pointed fruit. Seaward pioneer.',
                false,
            ],
            [
                'Avicennia rumphiana',
                'Bungalon / Apiapi / Miapi',
                'Avicenniaceae',
                'Mangrove tree characterized by distinctly hairy, brownish leaf undersurfaces and downy fruit. Found on upper intertidal sandy-mud substrates.',
                false,
            ],
            [
                'Brownlowia tersa',
                'Maragomon',
                'Tiliaceae',
                'Dense mangrove shrub with lanceolate leaves having silvery-brown peltate scales beneath, pinkish flowers, and 2-lobed woody capsules.',
                false,
            ],
            [
                'Bruguiera parviflora',
                'Langarai',
                'Rhizophoraceae',
                'Slender tree with yellowish-green foliage, clusters of 3–7 small yellowish flowers, and smooth slender cylindrical propagules.',
                false,
            ],
            [
                'Bruguiera sexangula',
                'Pototan',
                'Rhizophoraceae',
                'Upriver orange mangrove with single large yellow to orange-red calyx with 10–12 lobes and ribbed hypocotyls. Tolerates freshwater influence.',
                false,
            ],
            [
                'Camptostemon philippinensis',
                'Gapas-gapas',
                'Bombacaceae',
                'Rare Philippine-endemic mangrove tree with small white flowers and capsule fruits containing cotton-like woolly seeds.',
                false,
            ],
            [
                'Ceriops decandra',
                'Baras-baras',
                'Rhizophoraceae',
                'Spurred mangrove shrub with erect flower clusters, white petals, and straight club-shaped propagules with erect calyx lobes.',
                false,
            ],
            [
                'Excoecaria agallocha',
                'Lipata / Buta-buta',
                'Euphorbiaceae',
                'Blind-your-eye mangrove containing caustic milky sap. Separate male catkins and female flower clusters; 3-lobed capsules.',
                false,
            ],
            [
                'Heritiera littoralis',
                'Dungon / Dungon-late',
                'Sterculiaceae',
                'Looking-glass mangrove with massive sinuous buttress roots, silvery-white leaf undersides, and large keeled boat-shaped woody fruits.',
                false,
            ],
            [
                'Kandelia candel',
                'Bakawan-bata',
                'Rhizophoraceae',
                'Rare localized mangrove recorded in Aurora (Baler and Casiguran Bay). White spider-like flowers with many stamens and slender propagules.',
                false,
            ],
            [
                'Lumnitzera littorea',
                'Tabao / Culasi',
                'Combretaceae',
                'Red-flowered teruntum mangrove with brilliant scarlet terminal flower clusters and knee roots. Mid-to-landward forest edges.',
                false,
            ],
            [
                'Nypa fruticans',
                'Nipa / Sasa',
                'Arecaceae',
                'Mangrove palm with extensive creeping rhizomes, massive erect pinnate fronds, and globular fibrous fruiting heads. Estuarine riverbanks.',
                false,
            ],
            [
                'Osbornia octodonta',
                'Tawalis / Bunot-bunot',
                'Myrtaceae',
                'Myrtle mangrove with aromatic obovate leaves, spongy fibrous bark, and small white flowers with 8 calyx teeth. Thrives on rocky/coralline shores.',
                false,
            ],
            [
                'Pemphis acidula',
                'Bantigi',
                'Lythraceae',
                'Sturdy wind-resistant coastal shrub or small tree with small fleshy leaves and solitary white flowers. Pioneer on limestone and reef rock.',
                false,
            ],
            [
                'Scyphiphora hydrophyllacea',
                'Nilad',
                'Rubiaceae',
                'Shrub or small tree with sticky terminal buds, white-to-pink tubular flowers, and fluted cylindrical ribbed fruits. Historical namesake of Maynila.',
                false,
            ],
            [
                'Sonneratia ovata',
                'Pedada',
                'Sonneratiaceae',
                'Mangrove apple with broadly ovate/egg-shaped leaves with heart-shaped bases, white stamens, and persistent calyx lobes hugging the fruit base.',
                false,
            ],
            [
                'Xylocarpus moluccensis',
                'Piag-ao',
                'Meliaceae',
                'Mangrove tree with rough fissured dark bark, peg-like or conical pneumatophores, deciduous leaves turning red before shedding, and 6–10 cm globose fruit.',
                false,
            ],
        ];

        foreach ($species as [$sci, $local, $family, $desc, $ml]) {
            MangroveSpecies::updateOrCreate(
                ['scientific_name' => $sci],
                ['local_name' => $local, 'family' => $family, 'description' => $desc, 'ml_supported' => $ml, 'is_active' => true]
            );
        }
    }
}


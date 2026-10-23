<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const SITES = [
        ['Agsalin Mangrove Reserve', 'Agsalin', 12.9280, 121.5020, 12.8838292, 121.4727700, 'POLYGON((121.4990 12.9260, 121.5060 12.9260, 121.5060 12.9310, 121.4990 12.9310, 121.4990 12.9260))'],
        ['Maragooc Coastal Mangrove Zone', 'Maragooc', 12.9380, 121.5050, 12.8965308, 121.4728645, 'POLYGON((121.5020 12.9360, 121.5090 12.9360, 121.5090 12.9410, 121.5020 12.9410, 121.5020 12.9360))'],
        ['Guimbonan Mangrove Belt', 'Guimbonan', 12.9480, 121.5080, 12.9051536, 121.4748765, 'POLYGON((121.5050 12.9460, 121.5120 12.9460, 121.5120 12.9510, 121.5050 12.9510, 121.5050 12.9460))'],
        ['Sta. Theresa Fish Sanctuary', 'Sta. Theresa', 12.9580, 121.5100, 12.9179488, 121.4821010, 'POLYGON((121.5060 12.9540, 121.5160 12.9540, 121.5160 12.9630, 121.5060 12.9630, 121.5060 12.9540))'],
        ['Balete Mangrove Restoration Site', 'Balete', 12.9680, 121.4900, 12.9349593, 121.4714367, 'POLYGON((121.4870 12.9660, 121.4930 12.9660, 121.4930 12.9700, 121.4870 12.9700, 121.4870 12.9660))'],
        ['San Antonio Coastal Mangrove Area', 'San Antonio', 12.9720, 121.5120, 12.9450137, 121.4926727, 'POLYGON((121.5090 12.9700, 121.5160 12.9700, 121.5160 12.9750, 121.5090 12.9750, 121.5090 12.9700))'],
        ['Kawit Shoreline Mangrove Project', 'Kawit', 12.9760, 121.4860, 12.9624753, 121.4811897, 'POLYGON((121.4830 12.9740, 121.4900 12.9740, 121.4900 12.9780, 121.4830 12.9780, 121.4830 12.9740))'],
        ['Tambong Mangrove Conservation Zone', 'Tambong', 12.9950, 121.5150, 12.9720401, 121.4888646, 'POLYGON((121.5120 12.9920, 121.5200 12.9920, 121.5200 12.9980, 121.5120 12.9980, 121.5120 12.9920))'],
    ];

    public function up(): void
    {
        foreach (self::SITES as [$name, $barangay, $oldLatitude, $oldLongitude, $latitude, $longitude, $polygon]) {
            $site = DB::table('restoration_sites')
                ->where('name', $name)
                ->where('barangay', $barangay)
                ->where('latitude', $oldLatitude)
                ->where('longitude', $oldLongitude);

            if (DB::getDriverName() === 'pgsql' && Schema::hasColumn('restoration_sites', 'boundary')) {
                DB::table('restoration_sites')
                    ->where('name', $name)
                    ->where('barangay', $barangay)
                    ->where('latitude', $oldLatitude)
                    ->where('longitude', $oldLongitude)
                    ->whereRaw('ST_Equals(boundary, ST_GeomFromText(?, 4326))', [$polygon])
                    ->update(['boundary' => null]);
            }

            $site->update([
                'latitude' => $latitude,
                'longitude' => $longitude,
            ]);

            DB::table('restoration_sites')
                ->where('name', $name)
                ->where('barangay', $barangay)
                ->where('latitude', $latitude)
                ->where('longitude', $longitude)
                ->where('description', "Mangrove restoration site in Barangay {$barangay}, Gloria, Oriental Mindoro.")
                ->update([
                    'description' => "Starter site marker at the approximate center of Barangay {$barangay}, Gloria, Oriental Mindoro. Replace with verified site GPS and boundary data before operational use.",
                ]);
        }
    }

    public function down(): void
    {
        // Generated rectangular boundaries are intentionally not recreated; they were not verified site data.
        foreach (self::SITES as [$name, $barangay, $oldLatitude, $oldLongitude, $latitude, $longitude]) {
            DB::table('restoration_sites')
                ->where('name', $name)
                ->where('barangay', $barangay)
                ->where('latitude', $latitude)
                ->where('longitude', $longitude)
                ->where('description', "Starter site marker at the approximate center of Barangay {$barangay}, Gloria, Oriental Mindoro. Replace with verified site GPS and boundary data before operational use.")
                ->update([
                    'latitude' => $oldLatitude,
                    'longitude' => $oldLongitude,
                    'description' => "Mangrove restoration site in Barangay {$barangay}, Gloria, Oriental Mindoro.",
                ]);
        }
    }
};

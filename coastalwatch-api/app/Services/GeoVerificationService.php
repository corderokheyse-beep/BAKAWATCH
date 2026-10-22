<?php

namespace App\Services;

use App\Models\RestorationSite;
use Illuminate\Support\Facades\DB;

class GeoVerificationService
{
    /**
     * Returns true if the given point is within 500 m of the site polygon.
     * Returns true (no verification) if the site has no boundary stored.
     */
    public function isWithinSite(float $lat, float $lon, RestorationSite $site): bool
    {
        // Fetch the site boundary as WKT — wrap in try/catch in case
        // the PostGIS boundary column doesn't exist yet on this installation
        try {
            $row = DB::selectOne(
                "SELECT ST_AsText(boundary) AS boundary_wkt FROM restoration_sites WHERE id = ?",
                [$site->id]
            );
        } catch (\Exception $e) {
            // Column doesn't exist or PostGIS unavailable — allow the record
            return true;
        }

        if (!$row || empty($row->boundary_wkt)) {
            // No boundary stored — cannot verify, allow the record
            return true;
        }

        $pointWkt   = "POINT({$lon} {$lat})";
        $polygonWkt = $row->boundary_wkt;

        try {
            $result = DB::selectOne(
                "SELECT ST_DWithin(
                    ST_GeomFromText(?, 4326)::geography,
                    ST_GeomFromText(?, 4326)::geography,
                    500
                ) AS within",
                [$pointWkt, $polygonWkt]
            );
        } catch (\Exception $e) {
            return true;
        }

        return (bool) ($result->within ?? true);
    }
}

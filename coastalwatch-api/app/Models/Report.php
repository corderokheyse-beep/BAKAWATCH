<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class Report extends Model
{
    use HasFactory, SoftDeletes;
    use \App\Models\Concerns\ResolvesLocalUploadUrls;

    /** Environmental-monitoring status workflow for threat cases. */
    public const STATUS_WORKFLOW = [
        'pending', 'under_review', 'resolved',
    ];

    protected $fillable = [
        'user_id', 'title', 'description', 'image_url', 'image_public_id',
        'photos',
        'latitude', 'longitude', 'location_name', 'status', 'category', 'report_type', 'threat_type',
        'severity', 'affected_radius_m',
        'admin_notes', 'reviewed_by', 'reviewed_at',
        'ml_condition', 'ml_species', 'ml_confidence', 'ml_analyzed',
        'ml_model_version', 'ml_all_predictions', 'human_verified_species',
        'verification_status', 'verified_by', 'verified_at', 'verification_notes',
    ];

    protected $casts = [
        'latitude'          => 'float',
        'longitude'         => 'float',
        'affected_radius_m' => 'integer',
        'reviewed_at'       => 'datetime',
        'ml_confidence'     => 'float',
        'ml_analyzed'       => 'boolean',
        'photos'            => 'array',
        'verified_at'       => 'datetime',
    ];

    protected static function booted(): void
    {
        static::saving(function (Report $report) {
            if ($report->latitude && $report->longitude) {
                try { DB::statement(
                    "UPDATE reports SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                    [$report->longitude, $report->latitude, $report->id]
                ); } catch (\Exception $e) {}
            }
        });

        static::created(function (Report $report) {
            try { DB::statement(
                "UPDATE reports SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326) WHERE id = ?",
                [$report->longitude, $report->latitude, $report->id]
            ); } catch (\Exception $e) {}
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function verifier()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    /** Follow-up monitoring updates (newest first). */
    public function updates()
    {
        return $this->hasMany(ReportUpdate::class)->latest('created_at');
    }

    public function eventAccomplishment()
    {
        return $this->hasOne(EventAccomplishmentReport::class, 'report_id');
    }

    /** Immutable status change log (chronological). */
    public function statusHistory()
    {
        return $this->hasMany(ReportStatusHistory::class)->orderBy('created_at');
    }

    /** The "after" photo = the most recent monitoring-update image, if any. */
    public function latestUpdatePhoto(): ?string
    {
        $latest = $this->updates()->first();
        return $latest?->image_url ?? ($latest?->photos[0]['url'] ?? null);
    }

    // Public visibility means MENRO has resolved the case.
    public function scopeApproved($query)
    {
        return $query->where('status', 'resolved');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeNearby($query, float $lat, float $lng, float $radiusKm = 10)
    {
        return $query->whereRaw(
            "ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)",
            [$lng, $lat, $radiusKm * 1000]
        );
    }
}

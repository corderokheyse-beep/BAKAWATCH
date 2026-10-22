# Implementation Plan: Mangrove Monitoring System

## Overview

Extend the BAKAWATCH platform with mangrove plantation recording, survival monitoring, ecosystem data collection, community event management, GIS site mapping, restoration analytics, and formal report generation. Implementation follows a strict dependency order: database → models → services → controllers/routes → frontend types/API → frontend pages/components → property tests → seeders.

## Tasks

- [x] 1. Database migrations — role enum extension and new tables
  - [x] 1.1 Extend users role enum to add `field_worker`, `volunteer`, `menro`
    - Create migration `2026_05_01_000001_extend_users_role_enum.php`
    - Use `DB::statement` to drop and re-add the CHECK constraint on `users.role` including the three new values, matching the pattern in existing migrations
    - _Requirements: 1.1_

  - [x] 1.2 Create `restoration_sites` table migration
    - Create migration `2026_05_01_000002_create_restoration_sites_table.php`
    - Use `Schema::create` for standard columns; use `DB::statement` for `boundary geometry(Polygon, 4326)` and the GIST index, matching the pattern in `create_reports_table.php`
    - Include `softDeletes()`
    - _Requirements: 2.1, 2.2_

  - [x] 1.3 Create `plantation_records` table migration
    - Create migration `2026_05_01_000003_create_plantation_records_table.php`
    - Use `DB::statement` for `location geometry(Point, 4326)` and its GIST index
    - Include `status` CHECK (`active`, `flagged`, `dead`), `geo_mismatch` boolean, `mortality_date` nullable date
    - _Requirements: 3.2, 4.1, 12.2_

  - [x] 1.4 Create `monitoring_records` table migration
    - Create migration `2026_05_01_000004_create_monitoring_records_table.php`
    - Use `DB::statement` for `location geometry(Point, 4326)` and its index
    - Include `survival_status` CHECK (`alive`, `dead`), `growth_stage` CHECK (`seedling`, `sapling`, `juvenile`, `mature`)
    - _Requirements: 5.1, 3.2_

  - [x] 1.5 Create `ecosystem_records` table migration
    - Create migration `2026_05_01_000005_create_ecosystem_records_table.php`
    - Use `DB::statement` for optional `location geometry(Point, 4326)`
    - Include `tidal_condition` CHECK (`low`, `mid`, `high`, `storm`)
    - _Requirements: 7.1_

  - [x] 1.6 Create `site_photos` table migration
    - Create migration `2026_05_01_000006_create_site_photos_table.php`
    - Include `photo_type` CHECK (`before`, `after`), `cloudinary_url`, `cloudinary_public_id`
    - _Requirements: 6.1, 6.2_

  - [x] 1.7 Create `planting_events` and `event_registrations` table migrations
    - Create migration `2026_05_01_000007_create_planting_events_table.php`
    - Create migration `2026_05_01_000008_create_event_registrations_table.php`
    - Include `status` CHECK (`open`, `closed`, `completed`, `cancelled`) on events; unique constraint on `(planting_event_id, user_id)` on registrations
    - _Requirements: 8.1, 8.2_

  - [x] 1.8 Create `generated_reports` table migration
    - Create migration `2026_05_01_000009_create_generated_reports_table.php`
    - Include nullable `restoration_site_id` FK, `date_from`, `date_to`, `file_path`, `report_type`
    - _Requirements: 11.6_

- [x] 2. Eloquent models for all new tables
  - [x] 2.1 Create `RestorationSite` model
    - `app/Models/RestorationSite.php` with `$fillable`, `$casts`, `SoftDeletes`
    - Relations: `hasMany` PlantationRecord, EcosystemRecord, SitePhoto, PlantingEvent; `belongsTo` User (`created_by`)
    - _Requirements: 2.1_

  - [x] 2.2 Create `PlantationRecord` model
    - `app/Models/PlantationRecord.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` RestorationSite, User (`submitted_by`); `hasMany` MonitoringRecord
    - _Requirements: 4.1_

  - [x] 2.3 Create `MonitoringRecord` model
    - `app/Models/MonitoringRecord.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` PlantationRecord, User (`submitted_by`)
    - _Requirements: 5.1_

  - [x] 2.4 Create `EcosystemRecord` model
    - `app/Models/EcosystemRecord.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` RestorationSite, User (`submitted_by`)
    - _Requirements: 7.1_

  - [x] 2.5 Create `SitePhoto` model
    - `app/Models/SitePhoto.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` RestorationSite, User (`uploaded_by`)
    - _Requirements: 6.1_

  - [x] 2.6 Create `PlantingEvent` model
    - `app/Models/PlantingEvent.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` RestorationSite, User (`created_by`); `hasMany` EventRegistration
    - _Requirements: 8.1_

  - [x] 2.7 Create `EventRegistration` model
    - `app/Models/EventRegistration.php` with `$fillable`
    - Relations: `belongsTo` PlantingEvent, User
    - _Requirements: 8.2_

  - [x] 2.8 Create `GeneratedReport` model
    - `app/Models/GeneratedReport.php` with `$fillable`, `$casts`
    - Relations: `belongsTo` User (`generated_by`), RestorationSite
    - _Requirements: 11.6_

- [x] 3. Backend services
  - [x] 3.1 Create `GeoVerificationService`
    - `app/Services/GeoVerificationService.php`
    - Implement `isWithinSite(float $lat, float $lon, RestorationSite $site): bool` using `DB::selectOne` with `ST_DWithin(...::geography, ..., 500)`
    - Return `false` (flag record) when the point is outside 500 m of the site polygon
    - _Requirements: 12.2_

  - [x] 3.2 Write property test for GeoVerificationService
    - **Property 25: Out-of-boundary records are flagged**
    - **Validates: Requirements 12.2**

  - [x] 3.3 Create `AnalyticsService`
    - `app/Services/AnalyticsService.php`
    - Implement `survivalRate(int $siteId): array` — SQL from design §Analytics Queries
    - Implement `speciesDistribution(int $siteId): array` — window-function SQL from design
    - Implement `monthlyGrowthTrend(int $siteId): array` — `DATE_TRUNC` SQL from design
    - Implement `ecosystemMonthlyAverages(int $siteId): array` — `DATE_TRUNC` SQL from design
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 7.5_

  - [x] 3.4 Write property tests for AnalyticsService
    - **Property 14: Analytics averages are arithmetically correct**
    - **Property 19: Total planted count is accurate**
    - **Property 20: Survival rate formula is correct**
    - **Property 21: Species distribution percentages sum to 100**
    - **Validates: Requirements 7.5, 10.1, 10.2, 10.3, 10.4**

  - [x] 3.5 Create `ReportService`
    - `app/Services/ReportService.php`
    - Implement `generateMonthly(int $siteId, string $month): array` — assembles data from AnalyticsService for a calendar month
    - Implement `generateLgu(string $dateFrom, string $dateTo): array` — aggregates across all sites
    - Implement `generateDenr(int $siteId, string $dateFrom, string $dateTo): array` — DENR template fields
    - Implement `exportToXlsx(array $reportData, string $reportType): string` — uses `maatwebsite/excel` to write `.xlsx`, returns file path
    - Return zero-value structure when no data exists for the requested range
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 3.6 Write property test for ReportService
    - **Property 22: Generated reports contain all required fields**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5**

- [x] 4. Checkpoint — run `php artisan test` to confirm all existing tests still pass after migrations and models

- [x] 5. Backend controllers and API routes
  - [x] 5.1 Create `RestorationSiteController`
    - `app/Http/Controllers/Api/RestorationSiteController.php`
    - `index` (public) — return all active sites with boundary GeoJSON for map rendering
    - `store` (admin) — validate polygon, store via `DB::statement` for geometry column, log to `activity_logs`
    - `update` (admin) — validate and update fields, log to `activity_logs`
    - `show` — return site with plantation pin counts and survival rate summary
    - Register routes in `routes/api.php`: `GET /api/sites` (public), `POST /api/sites`, `PUT /api/sites/{site}` (admin), `GET /api/sites/{site}` (auth)
    - _Requirements: 2.1, 2.3, 2.5, 12.4_

  - [x] 5.2 Write property tests for RestorationSiteController
    - **Property 3: Geometry storage round-trip**
    - **Property 4: Site field update correctness**
    - **Property 5: Suspended site rejects plantation records**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [x] 5.3 Create `PlantationRecordController`
    - `app/Http/Controllers/Api/PlantationRecordController.php`
    - `store` (field_worker, volunteer) — validate fields including future-date check (≤ 7 days), check site is not suspended, call `GeoVerificationService`, optionally upload photo via `CloudinaryService`, save record, log to `activity_logs`
    - `mine` (field_worker, volunteer) — return authenticated user's own records
    - `bySite` (menro, admin) — return all records for a site
    - Register routes: `POST /api/plantation-records`, `GET /api/plantation-records/mine`, `GET /api/sites/{site}/plantation-records`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 12.1, 12.2, 12.3, 12.4_

  - [x] 5.4 Write property tests for PlantationRecordController
    - **Property 6: GeoTag is required for field records**
    - **Property 7: Server timestamp is independent of client date**
    - **Property 24: Future dates beyond 7 days are rejected**
    - **Property 25: Out-of-boundary records are flagged** (integration layer)
    - **Property 26: All CUD operations are audit-logged**
    - **Validates: Requirements 3.1, 4.5, 12.1, 12.2, 12.4**

  - [x] 5.5 Create `MonitoringRecordController`
    - `app/Http/Controllers/Api/MonitoringRecordController.php`
    - `store` (field_worker) — validate fields, future-date check, set `mortality_date` on linked PlantationRecord when `survival_status = 'dead'`, log to `activity_logs`
    - `bySite` (menro, admin) — return all monitoring records for a site ordered by `monitoring_date` DESC
    - Register routes: `POST /api/monitoring-records`, `GET /api/sites/{site}/monitoring-records`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 12.1, 12.3, 12.4_

  - [x] 5.6 Write property tests for MonitoringRecordController
    - **Property 8: Dead monitoring record sets mortality date**
    - **Property 9: Multiple monitoring records are preserved**
    - **Property 10: Retrieved records are ordered by date descending**
    - **Validates: Requirements 5.2, 5.3, 5.6**

  - [x] 5.7 Create `EcosystemRecordController`
    - `app/Http/Controllers/Api/EcosystemRecordController.php`
    - `store` (field_worker) — validate pH (0–14), salinity (≥ 0), future-date check, log to `activity_logs`
    - `bySite` (menro, admin) — return records ordered by `measurement_date` DESC
    - Register routes: `POST /api/ecosystem-records`, `GET /api/sites/{site}/ecosystem-records`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 12.1, 12.3, 12.4_

  - [x] 5.8 Write property tests for EcosystemRecordController
    - **Property 10: Retrieved records are ordered by date descending** (ecosystem variant)
    - **Property 26: All CUD operations are audit-logged** (ecosystem variant)
    - **Validates: Requirements 7.4, 12.4**

  - [x] 5.9 Create `SitePhotoController`
    - `app/Http/Controllers/Api/SitePhotoController.php`
    - `store` (field_worker, menro) — validate MIME type (jpeg/png/webp), file size ≤ 10 MB before upload, upload via `CloudinaryService`, store all required fields
    - `index` (menro, admin) — return photos for a site, filterable by `photo_type` query param
    - Register routes: `POST /api/sites/{site}/photos`, `GET /api/sites/{site}/photos`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.10 Write property tests for SitePhotoController
    - **Property 11: Site photo upload stores all required fields**
    - **Property 12: Photo type filter returns only matching photos**
    - **Property 13: Invalid photo formats are rejected**
    - **Validates: Requirements 6.2, 6.3, 6.5**

  - [x] 5.11 Create `PlantingEventController`
    - `app/Http/Controllers/Api/PlantingEventController.php`
    - `index` (public) — `GET /api/events/open` returns only `status = 'open'` events with remaining capacity
    - `store` (menro, admin) — create event
    - `update` (menro, admin) — update event; when status changes to `cancelled`, dispatch notification to all registrants via existing `ReportStatusNotification` pattern
    - `register` (volunteer, field_worker) — check capacity, store `EventRegistration`, reject if at max
    - Register routes: `GET /api/events/open`, `POST /api/events`, `PUT /api/events/{event}`, `POST /api/events/{event}/register`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.12 Write property tests for PlantingEventController
    - **Property 15: Event registration is recorded**
    - **Property 16: Event capacity is enforced**
    - **Property 17: Public events endpoint returns only open events**
    - **Property 18: Cancellation triggers notifications for all registrants**
    - **Validates: Requirements 8.2, 8.3, 8.5, 8.6**

  - [x] 5.13 Create `AnalyticsController`
    - `app/Http/Controllers/Api/AnalyticsController.php`
    - `show` (menro, admin) — call all four `AnalyticsService` methods for the given site, return combined JSON
    - Register route: `GET /api/analytics/{site}`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 5.14 Create `ReportController` (new mangrove reporting, separate from existing `ReportController`)
    - `app/Http/Controllers/Api/MangroveReportController.php`
    - `generate` (menro, admin) — validate request, call `ReportService`, store `GeneratedReport` record, return report data JSON
    - `export` (menro, admin) — call `ReportService::exportToXlsx`, stream `.xlsx` file response
    - `index` (menro, admin) — list generated reports for the authenticated user
    - Register routes: `POST /api/reports/generate`, `GET /api/reports/generated`, `GET /api/reports/generated/{report}/export`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 5.15 Write property tests for MangroveReportController
    - **Property 22: Generated reports contain all required fields**
    - **Property 23: Report generation creates an audit record**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5, 11.6**

  - [x] 5.16 Create `BackupController`
    - `app/Http/Controllers/Api/BackupController.php`
    - `trigger` (admin only) — run `pg_dump` via `Process`, store file, log completion timestamp + file size + path to `activity_logs`; on failure log reason and return HTTP 500
    - Register route: `GET /api/admin/backup`
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 5.17 Write property test for BackupController
    - **Property 27: Successful backup logs required metadata**
    - **Validates: Requirements 13.2**

wesl;=.56-6- [ ] 6. Role-based access control — property tests
  - [x] 6.1 Write property test for role enforcement (Property 1)
    - **Property 1: Role enforcement is universal**
    - Generate random role/endpoint pairs; assert HTTP 403 for unauthorized roles
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [x] 6.2 Write property test for token invalidation on role change (Property 2)
    - **Property 2: Token invalidation on role change**
    - Update `AdminController::updateUser` to call `$user->tokens()->delete()` when role changes; write property test asserting previously issued tokens return 401
    - **Validates: Requirements 1.6**

- [x] 7. Checkpoint — run `php artisan test` to confirm all backend tests pass

- [ ] 8. Frontend — TypeScript types and API client additions
  - [x] 8.1 Add new TypeScript types to `lib/types.ts`
    - Add `RestorationSite`, `PlantationRecord`, `MonitoringRecord`, `EcosystemRecord`, `SitePhoto`, `PlantingEvent`, `EventRegistration`, `GeneratedReport` interfaces
    - Extend `Role` type to include `'field_worker' | 'volunteer' | 'menro'`
    - Add analytics response types: `SurvivalRateData`, `SpeciesDistributionItem`, `GrowthTrendPoint`, `EcosystemAveragePoint`
    - _Requirements: 1.1_

  - [x] 8.2 Add API helper functions to `lib/api.ts` (or a new `lib/mangrove-api.ts`)
    - Functions for: `fetchSites`, `createSite`, `updateSite`, `fetchSite`
    - `submitPlantationRecord`, `fetchMyPlantationRecords`, `fetchSitePlantationRecords`
    - `submitMonitoringRecord`, `fetchSiteMonitoringRecords`
    - `submitEcosystemRecord`, `fetchSiteEcosystemRecords`
    - `uploadSitePhoto`, `fetchSitePhotos`
    - `fetchOpenEvents`, `createEvent`, `updateEvent`, `registerForEvent`
    - `fetchSiteAnalytics`
    - `generateReport`, `fetchGeneratedReports`, `exportReport`
    - _Requirements: 4.1, 5.1, 7.1, 8.1, 10.1, 11.1_

- [ ] 9. Frontend — map and form components
  - [x] 9.1 Create `SitePolygonMap` component
    - `components/map/SitePolygonMap.tsx` — Leaflet map rendering site polygons using `L.polygon`
    - Color-code by status: `planned` = blue, `active` = green, `completed` = teal, `suspended` = red
    - On polygon click: show popup with site name, status, total planted count, survival rate
    - Accept `sites: RestorationSite[]` prop; follow the same `useRef`/`initRef` guard pattern as `MapView.tsx`
    - _Requirements: 9.1, 9.2_

  - [x] 9.2 Create `PlantationForm` component
    - `components/forms/PlantationForm.tsx` — react-hook-form + Zod schema
    - Fields: site selector, species name, date planted, seedling source, photo upload, GPS capture button
    - GPS capture: call `navigator.geolocation.getCurrentPosition`, pre-fill lat/lon fields; show manual input fallback when geolocation unavailable
    - Show Leaflet pin preview at captured coordinates before submit
    - _Requirements: 3.4, 3.5, 3.6, 4.1_

  - [x] 9.3 Create `MonitoringForm` component
    - `components/forms/MonitoringForm.tsx` — react-hook-form + Zod schema
    - Fields: plantation record selector, height (cm), diameter (cm), survival status, growth stage, disease observation, GPS capture, monitoring date
    - _Requirements: 5.1, 3.4, 3.5_

  - [x] 9.4 Create `EcosystemForm` component
    - `components/forms/EcosystemForm.tsx` — react-hook-form + Zod schema
    - Fields: site selector, soil salinity (ppt), water pH, water temperature (°C), tidal condition, GPS capture, measurement date
    - Client-side Zod validation: pH 0–14, salinity ≥ 0
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 10. Frontend — analytics chart components
  - [x] 10.1 Create `SurvivalChart` component
    - `components/charts/SurvivalChart.tsx` — Chart.js doughnut chart
    - Props: `survivalRate: number`, `totalPlanted: number`
    - Show alive vs dead segments; display percentage in center
    - _Requirements: 10.5_

  - [x] 10.2 Create `SpeciesChart` component
    - `components/charts/SpeciesChart.tsx` — Chart.js bar chart
    - Props: `species: SpeciesDistributionItem[]`
    - X-axis: species names; Y-axis: count; tooltip shows percentage
    - _Requirements: 10.7_

  - [x] 10.3 Create `GrowthTrendChart` component
    - `components/charts/GrowthTrendChart.tsx` — Chart.js line chart
    - Props: `trend: GrowthTrendPoint[]`
    - X-axis: month labels; Y-axis: average height in cm
    - _Requirements: 10.6_

- [ ] 11. Frontend — report exporter component
  - [x] 11.1 Create `ReportExporter` component
    - `components/reports/ReportExporter.tsx`
    - UI: report type selector (`monthly`, `lgu`, `denr`), site selector, date range pickers
    - On "Generate": call `generateReport` API, display summary table
    - On "Export Excel": call `exportReport` API, trigger browser file download of `.xlsx`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 12. Frontend — pages
  - [x] 12.1 Create `/sites` page
    - `app/sites/page.tsx` — fetch all active sites, render `SitePolygonMap` with filter controls (year, barangay)
    - _Requirements: 9.1, 9.3_

  - [x] 12.2 Create `/sites/[id]` page
    - `app/sites/[id]/page.tsx` — fetch site detail, plantation pins, photo gallery tabs (before/after)
    - Render `SitePolygonMap` zoomed to site, plantation record pins with species icons
    - _Requirements: 9.4_

  - [x] 12.3 Create `/plantation/new` page
    - `app/plantation/new/page.tsx` — render `PlantationForm`, handle submit via `submitPlantationRecord`, redirect on success
    - Guard: only `field_worker` and `volunteer` roles
    - _Requirements: 4.1, 3.4_

  - [x] 12.4 Create `/monitoring/new` page
    - `app/monitoring/new/page.tsx` — render `MonitoringForm`, handle submit via `submitMonitoringRecord`
    - Guard: only `field_worker` role
    - _Requirements: 5.1_

  - [x] 12.5 Create `/ecosystem/new` page
    - `app/ecosystem/new/page.tsx` — render `EcosystemForm`, handle submit via `submitEcosystemRecord`
    - Guard: only `field_worker` role
    - _Requirements: 7.1_

  - [x] 12.6 Create `/events` page
    - `app/events/page.tsx` — fetch open events from `GET /api/events/open`, display event cards with remaining capacity, registration button for authenticated volunteers/field_workers
    - _Requirements: 8.5, 8.2_

  - [x] 12.7 Create `/analytics/[siteId]` page
    - `app/analytics/[siteId]/page.tsx` — fetch analytics from `GET /api/analytics/{site}`, render `SurvivalChart`, `SpeciesChart`, `GrowthTrendChart`, ecosystem averages table
    - Guard: `menro` and `admin` roles
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 12.8 Create `/reports` page (mangrove reports)
    - `app/reports/mangrove/page.tsx` — render `ReportExporter`, list previously generated reports with export links
    - Guard: `menro` and `admin` roles
    - _Requirements: 11.1, 11.4, 11.6_

- [x] 13. Checkpoint — verify frontend builds without TypeScript errors (`tsc --noEmit`)

- [x] 14. Seeder updates
  - [x] 14.1 Update `DatabaseSeeder` to seed new roles and sample data
    - Add sample users with roles `field_worker`, `volunteer`, `menro`
    - Add 2–3 sample `RestorationSite` records with valid polygon WKT
    - Add sample `PlantationRecord`, `MonitoringRecord`, `EcosystemRecord`, and `PlantingEvent` records linked to the seeded sites
    - _Requirements: 1.1_

- [x] 15. Final checkpoint — run full test suite (`php artisan test`) and confirm all tests pass

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use Pest PHP with randomized inputs (minimum 100 iterations each)
- All geometry columns use `DB::statement` raw SQL following the existing pattern in `create_reports_table.php`
- The existing `EnsureRole` middleware is reused unchanged; new roles are passed as string arguments
- `MangroveReportController` is named distinctly to avoid collision with the existing `ReportController`
- Checkpoints at tasks 4, 7, 13, and 15 ensure incremental validation

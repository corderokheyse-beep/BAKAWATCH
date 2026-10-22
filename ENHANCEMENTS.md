# BANTAY BAKAWAN — Enhancement Deliverables

This document records the enhancements made to the existing BANTAY BAKAWAN
(BAKAWATCH) mangrove monitoring system, organized by phase. The existing stack
was preserved: **Laravel API** (Sanctum, PostGIS with SQLite fallback),
**Next.js 16 / React 19** frontend, and a separate **FastAPI ML service**.

All backend changes are additive migrations/columns/tables — no existing data is
overwritten and no working feature was removed.

---

## How to run

**API** (`coastalwatch-api/`)
```
composer install
cp .env.example .env          # if .env does not exist
php artisan key:generate
# ensure these dirs exist (gitignored): storage/framework/{views,cache/data,sessions}, storage/backups
php artisan migrate --seed    # first-time setup
php artisan serve --host=127.0.0.1 --port=8000
```

**Frontend** (`coastalwatch-frontend/`)
```
npm install
# .env.local must contain:
#   NEXT_PUBLIC_API_URL=http://localhost:8000/api
npm run dev
```

**Tests** (API): `php artisan test` — runs against SQLite `:memory:` (safe; never
touches the dev database). Current status: **67 passed.**

---

## Deployment: starting with real data (no demo/mockup data)

The default `DatabaseSeeder` seeds a full **demo** dataset (sample reports,
sites, projects, events) for local development. For a real deployment you want a
clean database that contains only reference data and one admin — all other data
comes from real users through the app.

Use the **`ProductionSeeder`** instead of the demo seeder:

```
# 1. Set the admin credentials in the API .env
ADMIN_NAME="System Administrator"
ADMIN_EMAIL="admin@yourdomain.gov.ph"
ADMIN_PASSWORD="a-strong-password"
ADMIN_ORG="MENRO Gloria, Oriental Mindoro"

# 2. Build a clean schema and seed reference data only
php artisan migrate --force
php artisan db:seed --class="Database\Seeders\ProductionSeeder" --force
```

`ProductionSeeder` creates:
- the mangrove **species reference list** (needed for dropdowns + ML alignment), and
- a **single admin account** (from the env vars above; skipped with a warning if
  `ADMIN_PASSWORD` is unset).

It creates **no** reports, sites, projects, plantation/monitoring/ecosystem
records, or planting events.

### Resetting an already-seeded database to production data

> ⚠️ Destructive — this drops all tables and data. Only run on a database you
> intend to wipe (never on live data you want to keep). Back up first.

```
php artisan migrate:fresh --force
php artisan db:seed --class="Database\Seeders\ProductionSeeder" --force
```

The public landing page reads live aggregate figures from `GET /api/public/stats`
(real counts of sites, species, trees planted, protected area, survival rate).
On a freshly seeded production database these show real zeros/low numbers until
staff and field users enter actual data — no fabricated statistics are shown.

---

## New / changed environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `SURVIVAL_METHODOLOGY_VERSION` | api | `configurable-default-v1` | Stamped on every survival-rate result |
| `SURVIVAL_DENOMINATOR_BASIS` | api | `planted_records` | `planted_records` or `batch_quantity` |
| `SURVIVAL_INCLUDE_REPLACEMENTS` | api | `false` | Count replacements in the denominator |
| `SURVIVAL_UNMONITORED_TREATMENT` | api | `exclude` | `exclude` or `count_as_dead` |
| `ML_MODEL_VERSION` | api | `mobilenetv2-inat-v2.0.0` | Species classifier version stamp |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ORG` | api | — | Admin account created by `ProductionSeeder` (password required) |
| `DENR_API_ENABLED` / `DENR_API_BASE_URL` / `DENR_API_KEY` | api | disabled / — / — | DENR connector (pending, no default endpoint) |
| `MENRO_API_ENABLED` / `MENRO_API_BASE_URL` / `MENRO_API_KEY` | api | disabled / — / — | MENRO connector (pending) |
| `CSV_IMPORT_MAX_ROWS` / `CSV_IMPORT_MAX_FILE_KB` | api | `5000` / `5120` | CSV import limits |

> No government API URLs or credentials are bundled. External connectors stay
> `pending` until a real, authorized endpoint and credentials are configured.

---

## Phase deliverables

### Phase 2a — Survival-rate transparency
- **Files:** `config/monitoring.php` (new), `app/Services/AnalyticsService.php`, `lib/types.ts`, `app/analytics/[siteId]/page.tsx`.
- Survival rate now uses the **latest observation per record** and exposes
  numerator, denominator, monitored count, coverage %, replacement count,
  formula, methodology version, and `is_official: false`.
- Missing observations are **excluded**, not silently treated as deaths.
- Frontend shows a full methodology panel with a "configurable default — not
  official" disclaimer.

### Phase 2b — Geofence override + GPS metadata
- **Migration:** `2026_09_28_000001_add_geo_metadata_to_plantation_records`
  (`gps_source`, `gps_accuracy_m`, `geo_override`, `geo_override_reason`,
  `is_replacement`, `location_verified`).
- Out-of-boundary records are **never silently rejected** — they are accepted and
  flagged for review; an override reason is recorded when supplied.
- Manually entered coordinates are marked `location_verified = false`.
- **Note:** geofence flagging only fires under PostgreSQL+PostGIS; on SQLite the
  verification degrades gracefully (allows the record).

### Phase 2c — Species reference + lifecycle statuses
- **Migration:** `2026_09_28_000002_create_mangrove_species_table`. Model,
  seeder (6 ML-supported + 4 additional PH species), and
  `MangroveSpeciesController`.
- Configurable `lifecycle_statuses` added to `config/monitoring.php`.
- **Endpoints:** public `GET /species`, `GET /reference/monitoring`; admin/staff/menro
  `POST/PUT/DELETE /species` (delete = soft deactivate).
- Plantation form now loads species from the API with an AI-supported badge.

### Phase 3 — AI classification human verification
- **Migration:** `2026_09_28_000003_add_ml_verification_fields_to_reports`
  (`ml_model_version`, `ml_all_predictions`, `human_verified_species`,
  `verification_status`, `verified_by`, `verified_at`, `verification_notes`).
- **Endpoint:** `PATCH /reports/{report}/verify-species` (menro/staff/admin) —
  confirm / correct / reject. The **AI prediction is never overwritten**; the
  human-verified species is stored separately.
- Threat-report UI shows the AI guess distinctly with a "not a confirmed
  identification" warning, model version, and ranked alternatives.

### Phase 4 — Predictive analytics labeling
- **File:** `AnalyticsService::predictGrowth` now returns a `meta` block:
  model name/version, prediction date, forecast period, months of history used,
  inputs, 95% CI, RMSE, and an honest validation note.
- Frontend labels the forecast as a **prediction (not observed data)** with a
  provenance grid. No accuracy is fabricated.

### Phase 5 — PWA + offline field capture
- **Files:** `public/manifest.webmanifest`, `public/sw.js`,
  `lib/offline-queue.ts` (IndexedDB), `components/layout/OfflineManager.tsx`.
- **Migration:** `2026_09_28_000004_add_client_key_to_plantation_records`
  (unique `client_key`).
- Offline submissions are saved as local drafts and auto-synced on reconnect.
  A per-draft `client_key` makes the server import **idempotent** (retries never
  duplicate). Drafts are labeled "not yet verified".

### Phase 6 — Government integration (documented stub) + CSV import
- **Files:** `config/integrations.php`, `IntegrationService`,
  `IntegrationController`, `IntegrationSyncLog` model.
- **Migrations:** `..._000005_create_integration_sync_logs_table`,
  `..._000006_add_source_to_plantation_records` (`source` = local / csv_import / denr / menro).
- **Endpoints (admin):** `GET /admin/integrations/status`, `GET /admin/integrations/logs`,
  `POST /admin/integrations/{connector}/sync`, `POST /admin/integrations/import-csv`.
- Connectors honestly report **pending** and never fabricate a successful sync.
  CSV import validates rows, dedupes on `client_key`, marks imported records
  `source=csv_import` + `location_verified=false`, and logs the attempt with
  source attribution.

### Phase 8 — DENR + Evaluator roles, offline coverage for all field forms
- **Roles:** added `denr` (DENR / authorized agency evaluator) and `evaluator`
  (environmentalist / marine scientist / research evaluator).
  - **Migration:** `2026_09_28_000007_add_denr_evaluator_roles` (extends the role
    check constraint; rebuilds the SQLite role column so new values are accepted).
  - **Seeder:** `EvaluatorAccountsSeeder` — demo accounts
    `denr@denr.gov.ph / Denr@1234` and `evaluator@research.ph / Eval@1234`.
  - **Access (least-privilege):** both can read sites, site records, analytics,
    and generated reports. `evaluator` can additionally verify AI species
    classifications. Neither can submit field data or use admin functions
    (verified by tests + live checks).
  - **Frontend:** role labels, `homePath`, nav links, `isDenr`/`isEvaluator`
    flags, and read-only dashboards at `/denr/dashboard` and `/evaluator/dashboard`.
- **Offline coverage:** the offline draft queue is now wired into the
  **monitoring** and **ecosystem** forms as well as plantation.
  - **Migration:** `2026_09_28_000008_add_client_key_to_monitoring_ecosystem`
    (unique `client_key` on both tables). Both controllers are now idempotent on
    `client_key` (re-sync returns the existing record, no duplicate).

### Phase 7 — Security, tests, docs
- **Security fix:** `AdminController::updateUser` now revokes a user's access
  tokens on role change or deactivation (prevents stale-permission use).
- **Tests:** added `tests/Feature/EnhancementsPropertyTest.php` (8 tests) and
  fixed pre-existing test/route mismatches (`RoleEnforcementPropertyTest` matrix,
  `RoleChangeTokenInvalidationPropertyTest`). Full suite green.

---

## New API endpoints (summary)

| Method | Path | Access |
|---|---|---|
| GET | `/species` | public |
| GET | `/reference/monitoring` | public |
| POST/PUT/DELETE | `/species`, `/species/{id}` | admin/staff/menro |
| PATCH | `/reports/{report}/verify-species` | menro/staff/admin |
| GET | `/admin/integrations/status` | admin |
| GET | `/admin/integrations/logs` | admin |
| POST | `/admin/integrations/{connector}/sync` | admin |
| POST | `/admin/integrations/import-csv` | admin |

---

## AI Species Detection (ML service) — setup & operation

The species classifier is a separate **FastAPI service** (`ml-service/`) that the
Laravel API calls at `ML_SERVICE_URL` (default `http://127.0.0.1:8001`). It is
optional: if it is down or untrained, report submission still works and the
"Photo & Species Detection" panel shows "unavailable".

### One-time setup (Windows, Python 3.12)
```
cd "COASTAL WATCH/ml-service"
py -3.12 -m venv venv
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\python.exe -m pip install -r requirements.txt   # installs TensorFlow (~large)
```

### Train the model
The training dataset lives in `ml-service/dataset/` (one folder per species).
To (re)fetch research-grade Philippine images from iNaturalist first:
```
venv\Scripts\python.exe download_dataset.py    # MAX_PER_CLASS controls how many
```
Then train (produces `mangrove_model.h5` + `class_labels.json`):
```
venv\Scripts\python.exe train_model.py
```
Training is CPU-only on native Windows (no GPU support in TF ≥ 2.11) and takes
~15–30 min for the current dataset.

### Run the service
```
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
```
Health check: `GET http://127.0.0.1:8001/` — should report the model loaded.

### Current model — honest performance
- Architecture: **MobileNetV2** transfer learning, 6 Philippine mangrove species.
- Trained on ~1,860 iNaturalist research-grade photos (≈250–340/species).
- **Validation accuracy ≈ 54%** (prototype grade). The two *Rhizophora* species
  are frequently confused (visually similar); *Sonneratia / Avicennia / Ceriops*
  score highest (Sonneratia >85% on clear photos).
- Every prediction is treated as an **AI suggestion only** — the human
  verification workflow (`PATCH /reports/{id}/verify-species`) lets reviewers
  confirm / correct / reject it, and the AI guess is never stored as a confirmed
  identification. The `condition`/health field is always `Unknown` (no health-
  labelled data; reserved for a future model).

### Improving accuracy
- Increase `MAX_PER_CLASS` in `download_dataset.py` and re-download (iNaturalist
  has thousands of observations per species), then retrain.
- Add the **Mendeley Mangrove Leaves** dataset (CC BY 4.0) — a manual download
  documented in `ml-service/DATASETS.md`; leaf close-ups classify far better than
  mixed field photos. Unzip into `ml-service/dataset/<Species_Name>/` and retrain.
- More images per species is the single biggest lever; 300+ per species is the
  recommended minimum for reliable fine-tuning.

---

## Incomplete / dependent on external services

- **ML service (species):** trained MobileNetV2 model runs and returns real
  predictions (~54% validation accuracy — prototype grade; see setup above). The
  `condition`/health output is always `Unknown` (no health model). Predictions
  are AI suggestions pending human verification, never confirmed identifications.
- **Predictive growth:** a prototype linear-regression forecast. Not validated
  against held-out data; needs more monitoring history before production use.
- **Government APIs:** no authorized DENR/MENRO endpoint or credentials are
  available; connectors are interfaces only until provided.
- **Offline queue:** wired into the plantation, monitoring, and ecosystem forms.

## Assumptions requiring confirmation from MENRO / DENR / scientists

1. **Survival-rate methodology** (denominator basis, replacement handling,
   treatment of unmonitored records) is a configurable default and must be
   confirmed as official.
2. **Inventory lifecycle categories** must be validated against the official
   monitoring protocol.
3. **Species reference list** should be reviewed by a marine scientist; only 6
   species are ML-supported.
4. **AI predictions** (species and growth) require expert validation before any
   result is treated as authoritative.

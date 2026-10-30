export type Role = 'admin' | 'staff' | 'user' | 'public' | 'field_worker' | 'volunteer' | 'menro' | 'denr' | 'evaluator'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  phone?: string
  organization?: string
  is_active: boolean
  email_verified_at?: string
  created_at: string
}

export type ReportStatus = 'pending' | 'under_review' | 'resolved'
export type ReportCategory = 'damage' | 'restoration' | 'wildlife' | 'pollution' | 'other'
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ThreatType =
  | 'damaged_tree' | 'illegal_cutting' | 'disease_pest' | 'pollution'
  | 'coastal_erosion' | 'storm_damage' | 'other'

export interface ReportUpdate {
  id: number
  report_id: number
  updated_by: number
  type?: 'threat' | 'growth_monitoring'
  fields?: Record<string, string>
  photos?: { url: string; public_id?: string }[]
  observation: string
  latitude?: number | null
  longitude?: number | null
  action_taken?: string | null
  status: ReportStatus
  image_url?: string | null
  update_date: string
  created_at: string
  updater?: Pick<User, 'id' | 'name'>
}

export interface ReportStatusHistoryEntry {
  id: number
  report_id: number
  previous_status?: string | null
  new_status: string
  changed_by?: number | null
  note?: string | null
  created_at: string
  changer?: Pick<User, 'id' | 'name'>
}

export type MangroveCondition = 'Healthy' | 'Stressed' | 'Diseased' | 'Dead' | 'Unknown'

export interface Report {
  id: number
  user_id: number
  title: string
  description: string
  image_url?: string
  photos?: { url: string; public_id?: string }[] | null
  latitude: number | null
  longitude: number | null
  location_name?: string
  status: ReportStatus
  category: ReportCategory
  report_type?: 'threat' | 'event_accomplishment'
  event_accomplishment?: {
    id: number; event?: { name: string; scheduled_at: string }; site?: { name: string }
    species_name: string; seedlings_planted: number; volunteers_present: number
      photos: { url: string }[]; submitted_at: string; latitude?: number | null; longitude?: number | null
      remarks?: string | null; user?: Pick<User, 'id' | 'name' | 'role'>
  } | null
  updates?: ReportUpdate[]
  threat_type?: ThreatType | null
  severity?: ReportSeverity | null
  affected_radius_m?: number | null
  admin_notes?: string
  reviewed_by?: number
  reviewed_at?: string
  created_at: string
  user?: Pick<User, 'id' | 'name' | 'email' | 'role'>
  reviewer?: Pick<User, 'id' | 'name'>
  // ML analysis fields (AI prediction — never treated as confirmed)
  ml_condition?: MangroveCondition
  ml_species?: string
  ml_confidence?: number
  ml_analyzed?: boolean
  ml_model_version?: string
  ml_all_predictions?: string // JSON string of ranked predictions
  // Human verification of the AI classification (kept separate from the AI guess)
  human_verified_species?: string | null
  verification_status?: 'unverified' | 'confirmed' | 'corrected' | 'rejected'
  verified_by?: number | null
  verified_at?: string | null
  verification_notes?: string | null
  verifier?: Pick<User, 'id' | 'name'>
}

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'suspended'

export interface RestorationProject {
  id: number
  created_by: number
  name: string
  description: string
  latitude: number
  longitude: number
  location_name: string
  area_hectares?: number
  status: ProjectStatus
  progress_percent: number
  trees_planted: number
  trees_target: number
  start_date?: string
  end_date?: string
  image_url?: string
  volunteers_count?: number
  creator?: Pick<User, 'id' | 'name'>
  created_at: string
}

export interface ProjectUpdate {
  id: number
  project_id: number
  title: string
  content: string
  trees_planted_update: number
  image_url?: string
  created_at: string
  author?: Pick<User, 'id' | 'name'>
}

export interface Notification {
  id: string
  type: string
  data: {
    type: string
    report_id?: number
    request_id?: number
    event_id?: number
    registration_id?: number
    event_name?: string
    participant_name?: string
    registration_status?: string
    title?: string
    status?: string
    message: string
    admin_notes?: string
  }
  read_at?: string
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface DashboardStats {
  total_reports: number
  pending_reports: number
  approved_reports: number
  rejected_reports: number
  total_users: number
  active_projects: number
  total_projects: number
  total_trees_planted: number
  plantation_records?: number
  total_volunteers: number
  survival_rate?: number | null
  monitored_count?: number
}

// ─── Mangrove Monitoring System Types ────────────────────────────────────────

export type SiteStatus = 'active' | 'inactive' | 'in_progress'

export interface SiteSpecies {
  species_name: string
  count: number
  percentage: number
}

/** A curated species entry from the mangrove_species reference table. */
export interface SiteSpeciesRef {
  id: number
  scientific_name: string
  local_name?: string | null
  family?: string | null
  ml_supported?: boolean
}

export type SiteAreaType = 'mangrove' | 'planted'

export interface SiteArea {
  id: number
  restoration_site_id: number
  type: SiteAreaType
  geojson: any            // GeoJSON geometry string or object
  area_hectares?: number | null
  note?: string | null
  created_at?: string
}

export interface RestorationSite {
  id: number
  created_by: number
  assigned_to?: number | null
  name: string
  description?: string
  boundary_geojson?: any   // legacy single boundary (migrated into areas)
  boundary_type?: 'mangrove' | 'planted'
  /** All drawn areas for the site (green mangrove + red planted). */
  areas?: SiteArea[]
  area_hectares?: number
  planted_hectares?: number | null
  barangay?: string
  status: SiteStatus
  established_year?: number
  latitude?: number
  longitude?: number
  created_at: string
  creator?: Pick<User, 'id' | 'name'>
  assigned_worker?: Pick<User, 'id' | 'name'> | null
  plantation_count?: number
  survival_rate?: number
  species?: SiteSpecies[]            // derived from plantation records
  site_species?: SiteSpeciesRef[]    // curated biodiversity inventory
  species_list?: SiteSpeciesRef[]    // same inventory as returned by the list endpoint
  species_list_count?: number
}

export type PlantationStatus = 'active' | 'flagged' | 'dead'

export interface PlantationRecord {
  id: number
  restoration_site_id: number
  submitted_by: number
  species_name: string
  date_planted: string
  seedling_source?: string
  image_url?: string
  latitude: number
  longitude: number
  status: PlantationStatus
  geo_mismatch: boolean
  mortality_date?: string
  created_at: string
  site?: Pick<RestorationSite, 'id' | 'name'>
  submitter?: Pick<User, 'id' | 'name'>
}

export type SurvivalStatus = 'alive' | 'dead'
export type GrowthStage    = 'seedling' | 'sapling' | 'juvenile' | 'mature'

export interface MonitoringRecord {
  id: number
  plantation_record_id: number
  submitted_by: number
  monitoring_date: string
  height_cm: number
  diameter_cm: number
  survival_status: SurvivalStatus
  growth_stage: GrowthStage
  disease_observation?: string
  latitude: number
  longitude: number
  created_at: string
}

export type TidalCondition = 'low' | 'mid' | 'high' | 'storm'

export interface EcosystemRecord {
  id: number
  restoration_site_id: number
  submitted_by: number
  measurement_date: string
  soil_salinity_ppt: number
  water_ph: number
  water_temp_celsius: number
  tidal_condition: TidalCondition
  latitude?: number
  longitude?: number
  created_at: string
}

export type PhotoType = 'before' | 'after'

export interface SitePhoto {
  id: number
  restoration_site_id: number
  uploaded_by: number
  cloudinary_url: string
  cloudinary_public_id: string
  photo_type: PhotoType
  created_at: string
  uploader?: Pick<User, 'id' | 'name'>
}

export type EventStatus = 'open' | 'upcoming' | 'on-going' | 'closed' | 'completed' | 'cancelled'

export interface PlantingEvent {
  id: number
  restoration_site_id: number
  created_by: number
  name: string
  description?: string
  scheduled_at: string
  location_name?: string
  max_volunteers: number
  status: EventStatus
  is_from_request?: boolean
  event_request_id?: number
  created_at: string
  remaining_capacity?: number
  site?: Pick<RestorationSite, 'id' | 'name'>
  registrations_count?: number
  attendance_confirmations_count?: number
  attendance_confirmations?: { user: { id: number; name: string } }[]
  registrations?: {
    id: number; user_id?: number; full_name?: string; email?: string; phone?: string; address?: string;
    organization?: string; age?: number; gender?: string; group_size?: number;
    motivation?: string; admin_notes?: string; registration_status?: string; created_at?: string
  }[]
  can_report_accomplishment?: boolean
  report_submitted?: boolean
}

export interface EventRegistration {
  id: number
  planting_event_id: number
  user_id: number
  created_at: string
}

export type ReportType = 'monthly' | 'lgu' | 'denr' | 'nursery'

export interface GeneratedReport {
  id: number
  generated_by: number
  restoration_site_id?: number
  report_type: ReportType
  date_from?: string
  date_to?: string
  file_path?: string
  created_at: string
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface SurvivalRateData {
  total: number
  alive_count: number
  dead_count: number
  survival_rate: number | null
  // Transparency / methodology fields (added Phase 2a)
  numerator?: number
  denominator?: number
  monitored_count?: number
  unmonitored_count?: number
  replacement_count?: number
  coverage_percent?: number
  formula?: string
  denominator_basis?: string
  includes_replacements?: boolean
  unmonitored_treatment?: string
  methodology_version?: string
  is_official?: boolean
}

export interface SpeciesDistributionItem {
  species_name: string
  count: number
  percentage: number
}

export interface GrowthTrendPoint {
  month: string
  avg_height: number
}

export interface EcosystemAveragePoint {
  month: string
  avg_salinity: number
  avg_ph: number
  avg_temp: number
}

export interface SiteAnalytics {
  site?: RestorationSite
  survival_rate: SurvivalRateData
  species_distribution: SpeciesDistributionItem[]
  monthly_growth_trend: GrowthTrendPoint[]
  ecosystem_monthly_averages: EcosystemAveragePoint[]
  ecosystem_monthly_avgs?: EcosystemAveragePoint[]
  survival_by_species?: { species_name: string; total: number; alive_count: number; dead_count: number; survival_rate: number }[]
  growth_stage_distribution?: { stage: string; count: number }[]
  event_accomplishments?: any[]
}

// ─── Articles & Tips ──────────────────────────────────────────────────────────
export type ArticleCategory = 'tips' | 'news' | 'guide' | 'research'

export interface Article {
  id: number
  author_id: number
  title: string
  slug: string
  excerpt?: string
  content: string
  category: ArticleCategory
  cover_image_url?: string
  is_published: boolean
  published_at?: string
  views: number
  created_at: string
  updated_at?: string
  author?: Pick<User, 'id' | 'name'>
}

// ─── Announcements ────────────────────────────────────────────────────────────
export type AnnouncementType = 'info' | 'warning' | 'success' | 'urgent'

export interface Announcement {
  id: number
  author_id: number
  title: string
  content: string
  type: AnnouncementType
  is_active: boolean
  expires_at?: string
  target_roles?: string
  created_at: string
  author?: Pick<User, 'id' | 'name'>
}

// ─── Seedling Inventory ───────────────────────────────────────────────────────
export type SeedlingStage = 'propagule' | 'seedling' | 'sapling' | 'mature'

export interface Nursery {
  id: number
  name: string
  location?: string | null
}

export interface SeedlingInventory {
  id: number
  restoration_site_id?: number
  recorded_by: number
  species_name: string
  source_nursery?: string
  date_received: string
  beginning_stock?: number
  ending_stock?: number
  quantity_received: number
  quantity_planted: number
  quantity_damaged: number
  quantity_remaining: number
  /** Current stock balance from the movement ledger (falls back to remaining). */
  balance?: number
  /** Ledger-derived totals, provided by the list endpoint for immediate display. */
  ledger_planted?: number
  ledger_lost?: number
  ledger_stock_in?: number
  stage: SeedlingStage
  notes?: string
  image_url?: string
  created_at: string
  site?: Pick<RestorationSite, 'id' | 'name'>
  recorder?: Pick<User, 'id' | 'name'>
}

export interface SeedlingSummaryItem {
  species_name: string
  total_received: number
  total_planted: number
  total_damaged: number
  total_remaining: number
}

export interface SeedlingAvailability {
  species_name: string
  total_remaining: number
  eligible_remaining?: number
}

// ─── Inventory stock-movement ledger ──────────────────────────────────────────
export type InventoryMovementType = 'stock_in' | 'dispatch_out' | 'returned_in' | 'planted_out' | 'lost' | 'adjustment'

export interface InventoryMovement {
  id: number
  seedling_inventory_id: number
  recorded_by?: number | null
  type: InventoryMovementType
  /** Signed: positive adds to balance, negative removes. */
  quantity: number
  movement_date: string
  note?: string | null
  created_at: string
  recorder?: Pick<User, 'id' | 'name'>
}

export interface InventoryPeriodSummary {
  period: 'all' | 'daily' | 'weekly' | 'monthly'
  stock_in: number
  planted_out: number
  lost: number
  adjustment: number
  net_change: number
}

// ─── Mangrove Species Reference ───────────────────────────────────────────────
export interface MangroveSpecies {
  id: number
  scientific_name: string
  local_name?: string
  family?: string
  description?: string
  ml_supported: boolean
  is_active: boolean
  created_at?: string
}

export interface LifecycleStatus {
  value: string
  label: string
  is_alive: boolean
}

export interface MonitoringReference {
  species: MangroveSpecies[]
  lifecycle_statuses: LifecycleStatus[]
}

export interface PublicStats {
  restoration_sites: number
  species_monitored: number
  trees_planted: number
  protected_area_ha: number
  survival_rate: number | null
  active_projects: number
}

// ─── Predictive Analytics ─────────────────────────────────────────────────────
export interface GrowthPredictionPoint {
  month: string
  predicted_height: number
  lower_bound: number
  upper_bound: number
  is_predicted: boolean
}

export interface GrowthPredictionMeta {
  is_prediction: boolean
  model_name: string
  model_version?: string
  prediction_date: string
  forecast_months: number
  history_months: number
  history_range: { from?: string; to?: string }
  inputs: string[]
  confidence_interval: string
  rmse_cm?: number
  validation_note: string
}

export interface GrowthPrediction {
  slope_cm_per_month: number
  rmse: number
  predictions: GrowthPredictionPoint[]
  meta?: GrowthPredictionMeta
  error?: string
}

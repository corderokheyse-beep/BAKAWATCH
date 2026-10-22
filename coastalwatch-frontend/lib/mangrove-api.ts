import api from './api'
import type {
  RestorationSite, PlantationRecord, MonitoringRecord,
  EcosystemRecord, SitePhoto, PlantingEvent, GeneratedReport,
  SiteAnalytics, ReportType,
} from './types'

// Normalize a response body to an array. Laravel endpoints may return either a
// bare array or a wrapped `{ data: [...] }` collection; anything else (an error
// page, an object, null) becomes an empty array so callers can safely map/slice.
function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data
  }
  return []
}

// ─── Sites ────────────────────────────────────────────────────────────────────
// Lightweight in-memory cache for the sites list. It is read by several pages
// (map, sites, analytics, admin, the plantation form), so caching it for a few
// seconds makes navigating between those pages feel instant instead of
// re-fetching and re-spinning every time. Mutations invalidate it.
let _sitesCache: { data: RestorationSite[]; at: number } | null = null
const SITES_TTL = 30_000 // 30s

export function invalidateSitesCache() { _sitesCache = null }

export const fetchSites = (): Promise<RestorationSite[]> => {
  if (_sitesCache && Date.now() - _sitesCache.at < SITES_TTL) {
    return Promise.resolve(_sitesCache.data)
  }
  return api.get<RestorationSite[]>('/sites')
    .then(r => {
      const list = toArray<RestorationSite>(r.data)
      _sitesCache = { data: list, at: Date.now() }
      return list
    })
}

export const fetchSite = (id: number) =>
  api.get<{ site: RestorationSite; plantation_count: number; survival: any; species?: any[]; site_species?: any[]; areas?: any[] }>(`/sites/${id}`)
    .then(r => {
      const { site, plantation_count, survival, species, site_species, areas } = r.data
      return {
        ...site,
        plantation_count,
        survival_rate: survival?.survival_rate ?? null,
        species: species ?? [],
        site_species: site_species ?? [],
        // Drawn areas (green mangrove + red planted) live alongside `site` in
        // the response — carry them through so the map can render every area.
        areas: areas ?? [],
      } as RestorationSite
    })

export const createSite = (data: FormData) =>
  api.post<RestorationSite>('/sites', data).then(r => { invalidateSitesCache(); return r.data })

export const updateSite = (id: number, data: Partial<RestorationSite>) =>
  api.put<RestorationSite>(`/sites/${id}`, data).then(r => { invalidateSitesCache(); return r.data })

// ─── Plantation Records ───────────────────────────────────────────────────────
export const submitPlantationRecord = (data: FormData) =>
  api.post<PlantationRecord>('/plantation-records', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)

export const fetchMyPlantationRecords = () =>
  api.get<PlantationRecord[]>('/plantation-records/mine').then(r => toArray<PlantationRecord>(r.data))

export const fetchSitePlantationRecords = (siteId: number) =>
  api.get<PlantationRecord[]>(`/sites/${siteId}/plantation-records`).then(r => r.data)

// ─── Monitoring Records ───────────────────────────────────────────────────────
export const submitMonitoringRecord = (data: object) =>
  api.post<MonitoringRecord>('/monitoring-records', data).then(r => r.data)

export const fetchMyMonitoringRecords = () =>
  api.get<MonitoringRecord[]>('/monitoring-records/mine').then(r => toArray<MonitoringRecord>(r.data))

export const fetchSiteMonitoringRecords = (siteId: number) =>
  api.get<MonitoringRecord[]>(`/sites/${siteId}/monitoring-records`).then(r => toArray<MonitoringRecord>(r.data))

// ─── Ecosystem Records ────────────────────────────────────────────────────────
export const submitEcosystemRecord = (data: object) =>
  api.post<EcosystemRecord>('/ecosystem-records', data).then(r => r.data)

export const fetchSiteEcosystemRecords = (siteId: number) =>
  api.get<EcosystemRecord[]>(`/sites/${siteId}/ecosystem-records`).then(r => r.data)

// ─── Site Photos ──────────────────────────────────────────────────────────────
export const uploadSitePhoto = (siteId: number, data: FormData) =>
  api.post<SitePhoto>(`/sites/${siteId}/photos`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)

export const fetchSitePhotos = (siteId: number, photoType?: 'before' | 'after') =>
  api.get<SitePhoto[]>(`/sites/${siteId}/photos`, {
    params: photoType ? { photo_type: photoType } : {},
  }).then(r => r.data)

// ─── Planting Events ──────────────────────────────────────────────────────────
export const fetchOpenEvents = () =>
  api.get<PlantingEvent[]>('/events/open').then(r => toArray<PlantingEvent>(r.data))

export const fetchAllEvents = () =>
  api.get<PlantingEvent[]>('/events/all').then(r => toArray<PlantingEvent>(r.data))

// Plantation event requests (menro/admin/staff) — used by the MENRO dashboard
// to surface community-submitted planting requests alongside events.
export const fetchEventRequests = () =>
  api.get('/event-requests').then(r => toArray<any>(r.data))

export const fetchPastEvents = () =>
  api.get<PlantingEvent[]>('/events/past').then(r => toArray<PlantingEvent>(r.data))

export const fetchMyRegistrations = () =>
  api.get<{ planting_event_id: number; registration_status: string }[]>('/events/my-registrations').then(r => r.data)

export const fetchMyAttendance = () =>
  api.get<{ planting_event_id: number; confirmed_at: string }[]>('/events/my-attendance').then(r => r.data)

export const confirmEventAttendance = (eventId: number) => api.post(`/events/${eventId}/attendance`).then(r => r.data)
export const undoEventAttendance = (eventId: number) => api.delete(`/events/${eventId}/attendance`).then(r => r.data)

export const createEvent = (data: object) =>
  api.post<PlantingEvent>('/events', data).then(r => r.data)

export const updateEvent = (id: number, data: object) =>
  api.put<PlantingEvent>(`/events/${id}`, data).then(r => r.data)

export const registerForEvent = (eventId: number) =>
  api.post(`/events/${eventId}/register`).then(r => r.data)

// ─── Analytics ────────────────────────────────────────────────────────────────
export const fetchSiteAnalytics = (siteId: number) =>
  api.get<SiteAnalytics>(`/analytics/${siteId}`).then(r => r.data)

// ─── Reports ──────────────────────────────────────────────────────────────────
export const generateReport = (data: {
  report_type: ReportType
  site_id?: number
  date_from?: string
  date_to?: string
  period?: string
}) => api.post('/reports/generate', data).then(r => r.data)

export const fetchGeneratedReports = () =>
  api.get<GeneratedReport[]>('/reports/generated').then(r => r.data)

export const exportReport = async (reportId: number, filename = 'report.csv') => {
  const response = await api.get(`/reports/generated/${reportId}/export`, {
    responseType: 'blob',
  })
  const url  = URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href  = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// ─── Articles ─────────────────────────────────────────────────────────────────
import type { Article, Announcement, SeedlingInventory, SeedlingSummaryItem, GrowthPrediction } from './types'

export const fetchArticles = (params?: { category?: string; search?: string; per_page?: number }) =>
  api.get('/articles', { params }).then(r => r.data)

export const fetchArticle = (slug: string) =>
  api.get<Article>(`/articles/${slug}`).then(r => r.data)

export const fetchAdminArticles = () =>
  api.get<Article[]>('/admin/articles').then(r => r.data)

export const createArticle = (data: FormData) =>
  api.post<Article>('/articles', data).then(r => r.data)

export const updateArticle = (id: number, data: FormData) =>
  api.post<Article>(`/articles/${id}`, data).then(r => r.data)

export const deleteArticle = (id: number) =>
  api.delete(`/articles/${id}`).then(r => r.data)

// ─── Mangrove Species Reference ─────────────────────────────────────────────
import type { MangroveSpecies, MonitoringReference } from './types'

export const fetchSpecies = () =>
  api.get('/species').then(r => toArray<MangroveSpecies>(r.data))

export const fetchNurseries = () =>
  api.get('/nurseries').then(r => toArray<import('./types').Nursery>(r.data))

export const fetchMonitoringReference = () =>
  api.get<MonitoringReference>('/reference/monitoring').then(r => r.data)

// Public landing-page aggregate stats (real figures, no auth required)
import type { PublicStats } from './types'
export const fetchPublicStats = () =>
  api.get<PublicStats>('/public/stats').then(r => r.data)

export const createSpecies = (data: Partial<MangroveSpecies>) =>
  api.post<MangroveSpecies>('/species', data).then(r => r.data)

export const updateSpecies = (id: number, data: Partial<MangroveSpecies>) =>
  api.put<MangroveSpecies>(`/species/${id}`, data).then(r => r.data)

export const deleteSpecies = (id: number) =>
  api.delete(`/species/${id}`).then(r => r.data)

// ─── Announcements ────────────────────────────────────────────────────────────
export const fetchAnnouncements = () =>
  api.get<Announcement[]>('/announcements').then(r => toArray<Announcement>(r.data))

export const fetchAdminAnnouncements = () =>
  api.get<Announcement[]>('/admin/announcements').then(r => r.data)

export const createAnnouncement = (data: Partial<Announcement>) =>
  api.post<Announcement>('/announcements', data).then(r => r.data)

export const updateAnnouncement = (id: number, data: Partial<Announcement>) =>
  api.put<Announcement>(`/announcements/${id}`, data).then(r => r.data)

export const deleteAnnouncement = (id: number) =>
  api.delete(`/announcements/${id}`).then(r => r.data)

// ─── Seedling Inventory ───────────────────────────────────────────────────────
export const fetchSeedlings = (params?: { site_id?: number; species?: string }) =>
  api.get('/seedlings', { params }).then(r => r.data)

export const fetchSeedlingSummary = (siteId?: number) =>
  api.get<SeedlingSummaryItem[]>('/seedlings/summary', { params: siteId ? { site_id: siteId } : {} }).then(r => r.data)

export const createSeedlingEntry = (data: Partial<SeedlingInventory>) =>
  api.post<SeedlingInventory>('/seedlings', data).then(r => r.data)

export const updateSeedlingEntry = (id: number, data: Partial<SeedlingInventory>) =>
  api.put<SeedlingInventory>(`/seedlings/${id}`, data).then(r => r.data)

export const deleteSeedlingEntry = (id: number) =>
  api.delete(`/seedlings/${id}`).then(r => r.data)

// ─── Site drawn areas (green mangrove + red planted) ──────────────────────────
import type { SiteArea, SiteAreaType } from './types'

export const fetchSiteAreas = (siteId: number) =>
  api.get<SiteArea[]>(`/sites/${siteId}/areas`).then(r => r.data)

export const addSiteArea = (
  siteId: number,
  data: { type: SiteAreaType; geojson: string; area_hectares?: number | null; note?: string },
) => api.post<{ message: string; area: SiteArea }>(`/sites/${siteId}/areas`, data).then(r => r.data)

export const updateSiteArea = (
  siteId: number, areaId: number,
  data: { type?: SiteAreaType; geojson?: string; area_hectares?: number | null; note?: string },
) => api.put<{ message: string; area: SiteArea }>(`/sites/${siteId}/areas/${areaId}`, data).then(r => r.data)

export const deleteSiteArea = (siteId: number, areaId: number) =>
  api.delete<{ message: string }>(`/sites/${siteId}/areas/${areaId}`).then(r => r.data)

// ─── Inventory stock-movement ledger ──────────────────────────────────────────
import type { InventoryMovement, InventoryMovementType, InventoryPeriodSummary } from './types'

export const fetchInventoryMovements = (entryId: number) =>
  api.get<{ balance: number; movements: InventoryMovement[] }>(`/seedlings/${entryId}/movements`).then(r => r.data)

export const addInventoryMovement = (
  entryId: number,
  data: { type: InventoryMovementType; quantity: number; movement_date?: string; note?: string },
) => api.post<{ message: string; balance: number; movement: InventoryMovement }>(
  `/seedlings/${entryId}/movements`, data,
).then(r => r.data)

export const deleteInventoryMovement = (entryId: number, movementId: number) =>
  api.delete<{ message: string; balance: number }>(`/seedlings/${entryId}/movements/${movementId}`).then(r => r.data)

export const fetchInventoryPeriodSummary = (period: 'all' | 'daily' | 'weekly' | 'monthly', siteId?: number) =>
  api.get<InventoryPeriodSummary>('/seedlings/movements/summary', {
    params: { period, ...(siteId ? { site_id: siteId } : {}) },
  }).then(r => r.data)

// ─── Predictive Analytics ─────────────────────────────────────────────────────
export const fetchGrowthPrediction = (siteId: number, monthsAhead = 6) =>
  api.get<GrowthPrediction>(`/analytics/${siteId}/predict-growth`, { params: { months_ahead: monthsAhead } })
    .then(r => r.data)

// ─── FCM Token ────────────────────────────────────────────────────────────────
export const updateFcmToken = (token: string) =>
  api.post('/auth/fcm-token', { fcm_token: token }).then(r => r.data)

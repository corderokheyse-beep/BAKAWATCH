'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { fetchSiteAnalytics, fetchSite, fetchGrowthPrediction, fetchSpecies } from '@/lib/mangrove-api'
import { useAuth } from '@/lib/auth-context'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Badge from '@/components/ui/Badge'
import { cn, formatDate } from '@/lib/utils'
import type { SiteAnalytics, RestorationSite, GrowthPrediction, MangroveSpecies } from '@/lib/types'
import {
  ArrowLeft, MapPin, Leaf, TreePine, TrendingUp,
  CheckCircle, XCircle, BarChart2,
  Activity, Sprout, Brain,
} from 'lucide-react'

const SurvivalChart      = nextDynamic(() => import('@/components/charts/SurvivalChart'),       { ssr: false })
const SpeciesChart       = nextDynamic(() => import('@/components/charts/SpeciesChart'),         { ssr: false })
const GrowthTrendChart   = nextDynamic(() => import('@/components/charts/GrowthTrendChart'),     { ssr: false })
const PredictiveGrowthChart = nextDynamic(() => import('@/components/charts/PredictiveGrowthChart'), { ssr: false })
const MapView = nextDynamic(() => import('@/components/map/MapView'), { ssr: false })

// ─── Per-site accent ──────────────────────────────────────────────────────────
// Give every site a stable, unique accent colour derived from its id so each
// site's analytics page is visually distinct ("highlighted") while staying
// on-brand (green-forward hues).
function siteAccent(seed: number | string): { from: string; to: string; soft: string; ring: string } {
  const n = typeof seed === 'number' ? seed : Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0)
  // Spread hues around the green/teal/blue family (90°–210°) so colours stay
  // cohesive with the brand instead of clashing.
  const hue = 90 + (n * 47) % 120
  return {
    from: `hsl(${hue} 55% 38%)`,
    to:   `hsl(${(hue + 24) % 360} 60% 30%)`,
    soft: `hsl(${hue} 45% 95%)`,
    ring: `hsl(${hue} 55% 38%)`,
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color = 'text-primary-600', bg = 'bg-primary-50',
}: {
  label: string; value: string | number; sub?: string
  icon: any; color?: string; bg?: string
}) {
  return (
    <div className="stat-card stat-card-glow group transition-all duration-200 hover:-translate-y-0.5">
      <div className={cn('p-2.5 rounded-xl shrink-0 group-hover:scale-110 transition-transform duration-200', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const ALLOWED_ANALYTICS_ROLES = ['menro', 'staff', 'admin', 'denr', 'evaluator', 'field_worker', 'volunteer', 'user']

export default function SiteAnalyticsPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const router     = useRouter()
  const { user, loading: authLoading } = useAuth()
  const id = Number(siteId)

  const [analytics, setAnalytics]   = useState<SiteAnalytics | null>(null)
  const [site, setSite]             = useState<RestorationSite | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [prediction, setPrediction] = useState<GrowthPrediction | null>(null)
  const [predLoading, setPredLoading] = useState(false)
  // Scientific-name → local-name map from the species master data, for the
  // Species Breakdown "Local Name" column.
  const [localNames, setLocalNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (!ALLOWED_ANALYTICS_ROLES.includes(user.role)) return

    setLoading(true)
    setError(false)

    // Species master data for local names (keyed by lowercased scientific name).
    fetchSpecies()
      .then((list: MangroveSpecies[]) => {
        const map: Record<string, string> = {}
        for (const sp of list) {
          if (sp.scientific_name && sp.local_name) map[sp.scientific_name.toLowerCase()] = sp.local_name
        }
        setLocalNames(map)
      })
      .catch(() => {})

    Promise.allSettled([fetchSiteAnalytics(id), fetchSite(id)])
      .then(([analyticsRes, siteRes]) => {
        const a: any = analyticsRes.status === 'fulfilled' ? analyticsRes.value : null
        const s: any = siteRes.status === 'fulfilled' ? siteRes.value : null

        if (!a && !s) {
          setError(true)
          return
        }

        const resolvedSite: RestorationSite | null = (s?.site ?? s) ?? a?.site ?? null
        setSite(resolvedSite)

        if (a) {
          if (a.ecosystem_monthly_avgs && !a.ecosystem_monthly_averages) {
            a.ecosystem_monthly_averages = a.ecosystem_monthly_avgs
          }
          setAnalytics(a)
          // Fetch predictive analytics after we have the growth data
          if ((a?.monthly_growth_trend?.length ?? 0) >= 2) {
            setPredLoading(true)
            fetchGrowthPrediction(id, 6)
              .then(pred => { if (!pred.error) setPrediction(pred) })
              .catch(() => {})
              .finally(() => setPredLoading(false))
          }
        } else if (s) {
          // Graceful fallback if /api/analytics/{id} failed but /api/sites/{id} succeeded
          const fallbackTotal = Number(s.survival?.total ?? s.plantation_count ?? 0)
          const fallbackAlive = Number(s.survival?.alive_count ?? 0)
          const fallbackDead  = Number(s.survival?.dead_count ?? 0)
          const fallbackRate  = Number(s.survival?.survival_rate ?? s.survival_rate ?? 0)
          setAnalytics({
            site: resolvedSite as RestorationSite,
            survival_rate: s.survival ?? {
              total: fallbackTotal,
              alive_count: fallbackAlive,
              dead_count: fallbackDead,
              survival_rate: fallbackRate,
            },
            species_distribution: Array.isArray(s.species) ? s.species : [],
            monthly_growth_trend: [],
            ecosystem_monthly_averages: [],
            survival_by_species: [],
            growth_stage_distribution: [],
          })
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [user, authLoading, id, router, reloadTick])

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (authLoading || loading) return (
    <SidebarLayout title="Analytics">
      <div className="page-container flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    </SidebarLayout>
  )

  if (!user) return null

  if (!ALLOWED_ANALYTICS_ROLES.includes(user.role)) return (
    <SidebarLayout>
      <div className="page-container flex items-center justify-center py-24">
        <p className="text-gray-500">Access denied.</p>
      </div>
    </SidebarLayout>
  )

  if (error || !analytics) return (
    <SidebarLayout title="Analytics">
      <div className="page-container flex flex-col items-center justify-center py-24 gap-4 text-center">
        <BarChart2 className="w-10 h-10 text-gray-300" />
        <p className="text-base font-semibold text-gray-600">Analytics could not be loaded</p>
        <p className="text-sm text-gray-400">Unable to load analytics for this restoration site. Please try again or return to the sites list.</p>
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            className="btn-primary"
          >
            Retry
          </button>
          <Link href="/analytics" className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Back to sites
          </Link>
        </div>
      </div>
    </SidebarLayout>
  )

  const sr  = analytics.survival_rate
  const eco = analytics.ecosystem_monthly_averages ?? []
  const siteName = site?.name ?? `Site #${id}`
  const accent = siteAccent(site?.id ?? id ?? siteName)

  return (
    <SidebarLayout
      title={siteName}
      subtitle="Restoration Analytics"
    >
      <div className="page-container space-y-6">

        {/* ── Breadcrumb + header ──────────────────────────────────────────── */}
        <div>
          {user.role !== 'field_worker' && (
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-primary-600 transition-colors mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All sites
            </Link>
          )}

          {/* Per-site accented header — unique colour + initials per site */}
          <div
            className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            style={{ borderLeft: `4px solid ${accent.ring}` }}
          >
            {/* soft accent wash */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: `linear-gradient(90deg, ${accent.soft} 0%, transparent 55%)` }}
              aria-hidden="true"
            />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Unique site avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-sm ring-2 ring-white"
                style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                aria-hidden="true"
              >
                {initials(siteName)}
              </div>
              <div className="min-w-0">
                <h1 className="page-title truncate">{siteName}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  {site?.status && <Badge label={site.status} />}
                  {site?.barangay && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="w-3 h-3" /> Brgy. {site.barangay}
                    </span>
                  )}
                  {site?.area_hectares != null && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Leaf className="w-3 h-3" /> {site.area_hectares} ha
                    </span>
                  )}
                  {site?.established_year && (
                    <span className="text-xs text-gray-500">Est. {site.established_year}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {site?.latitude != null && site?.longitude != null && (
          <Section title="Assigned Site Map" subtitle={site.name}>
            <MapView
              height="280px"
              center={[site.latitude, site.longitude]}
              zoom={15}
              marker={{ lat: site.latitude, lng: site.longitude }}
              markerColor={site.status === 'active' ? '#16a34a' : site.status === 'in_progress' ? '#d97706' : '#6b7280'}
            />
          </Section>
        )}

        {/* ── KPI cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
          <KpiCard
            label="Survival Rate"
            value={sr.survival_rate == null ? '—' : `${sr.survival_rate}%`}
            sub={sr.total === 0 ? 'No planting records' : `${sr.alive_count} alive / ${sr.total} total`}
            icon={TrendingUp}
            color={sr.survival_rate == null ? 'text-gray-400' : 'text-green-600'}
            bg={sr.survival_rate == null ? 'bg-gray-50' : 'bg-green-50'}
          />
          <KpiCard
            label="Total Planted"
            value={sr.total.toLocaleString()}
            sub="plantation records"
            icon={TreePine}
            color="text-primary-600"
            bg="bg-primary-50"
          />
          <KpiCard
            label="Alive"
            value={sr.alive_count.toLocaleString()}
            sub={`${sr.total > 0 ? Math.round(sr.alive_count / sr.total * 100) : 0}% of total`}
            icon={CheckCircle}
            color="text-teal-600"
            bg="bg-teal-50"
          />
          <KpiCard
            label="Dead"
            value={sr.dead_count.toLocaleString()}
            sub={`${sr.total > 0 ? Math.round(sr.dead_count / sr.total * 100) : 0}% of total`}
            icon={XCircle}
            color="text-red-500"
            bg="bg-red-50"
          />
        </div>

        {/* ── Charts row — equal-height cards, charts fill a fixed area ─────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          <div className="card flex flex-col">
            <div className="mb-3">
              <h2 className="section-title">Survival Rate</h2>
              <p className="text-xs text-gray-400 mt-0.5">{sr.alive_count} alive · {sr.dead_count} dead · {sr.total} total</p>
            </div>
            <div className="flex-1 min-h-[260px]">
              {sr.total === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Activity className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No monitoring data yet</p>
                </div>
              ) : (
                <SurvivalChart data={sr} />
              )}
            </div>
          </div>

          <div className="card flex flex-col">
            <div className="mb-3">
              <h2 className="section-title">Species Distribution</h2>
              <p className="text-xs text-gray-400 mt-0.5">{analytics.species_distribution?.length ?? 0} species recorded</p>
            </div>
            <div className="flex-1 min-h-[260px]">
              {(analytics.species_distribution?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <TreePine className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No species data yet</p>
                </div>
              ) : (
                <SpeciesChart data={analytics.species_distribution} />
              )}
            </div>
          </div>

          <div className="card flex flex-col">
            <div className="mb-3">
              <h2 className="section-title">Growth Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5">Average height over time</p>
            </div>
            <div className="flex-1 min-h-[260px]">
              {(analytics.monthly_growth_trend?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <TrendingUp className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No growth data yet</p>
                </div>
              ) : (
                <GrowthTrendChart data={analytics.monthly_growth_trend} />
              )}
            </div>
          </div>
        </div>

        {/* ── Survival-rate methodology / transparency ──────────────────────── */}
        {sr.formula && (
          <Section
            title="How this survival rate is calculated"
            subtitle="Every figure is traceable to the monitoring methodology in force when it was computed"
          >
            <div className="space-y-4">
              {!sr.is_official && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  <span className="font-bold shrink-0">⚠ Configurable default</span>
                  <span>
                    This uses a configurable default methodology and is <strong>not yet confirmed</strong> as
                    an official MENRO/DENR figure. Methodology version:{' '}
                    <code className="font-mono">{sr.methodology_version}</code>
                  </span>
                </div>
              )}

              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Formula</p>
                <p className="text-sm text-gray-700 font-mono">{sr.formula}</p>
                <p className="text-sm text-gray-700 mt-2">
                  = ({sr.numerator ?? sr.alive_count} living ÷ {sr.denominator ?? sr.total} eligible) × 100 ={' '}
                  <span className="font-bold text-green-600">
                    {sr.survival_rate == null ? '—' : `${sr.survival_rate}%`}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Numerator (living)</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{sr.numerator ?? sr.alive_count}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Denominator (eligible)</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{sr.denominator ?? sr.total}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Monitoring coverage</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{sr.coverage_percent ?? 0}%</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{sr.monitored_count ?? 0} of {sr.denominator ?? sr.total} monitored</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Replacements</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{sr.replacement_count ?? 0}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {sr.includes_replacements ? 'included' : 'excluded'} from denominator
                  </p>
                </div>
              </div>

              {(sr.unmonitored_count ?? 0) > 0 && (
                <p className="text-xs text-gray-500">
                  {sr.unmonitored_count} record(s) have no observation in this period and are{' '}
                  <strong>{sr.unmonitored_treatment === 'count_as_dead' ? 'counted as dead' : 'excluded'}</strong>{' '}
                  (they are not silently treated as deaths). Interpret the survival rate together with the coverage figure above.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* ── Survival by species ───────────────────────────────────────────── */}
        {(analytics as any).survival_by_species?.length > 0 && (
          <Section title="Survival Rate by Species" subtitle="Most recent monitoring status per tree">
            <div className="space-y-2">
              {(analytics as any).survival_by_species.map((sp: any) => (
                <div key={sp.species_name} className="flex items-center gap-3">
                  <p className="text-xs italic text-gray-700 w-44 shrink-0 truncate">{sp.species_name}</p>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${sp.survival_rate}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-600 w-12 text-right">{sp.survival_rate}%</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{sp.alive_count}/{sp.total} alive</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Predictive Growth Forecast ────────────────────────────────────── */}
        {(predLoading || prediction) && (
          <Section
            title="Predictive Growth Forecast"
            subtitle="Prototype forecast (linear regression) — a prediction, not observed data. Confirm against future field monitoring.">
            {predLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
                <Brain className="w-5 h-5 animate-pulse" />
                <span className="text-sm">Generating prediction…</span>
              </div>
            ) : prediction ? (
              <>
                {/* Prediction disclaimer — keeps forecast distinct from observed data */}
                <div className="flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs text-purple-800 mb-4">
                  <Brain className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
                  <span>
                    <strong>Prediction — not observed data.</strong>{' '}
                    {prediction.meta?.validation_note ?? 'Prototype forecast; treat as indicative only.'}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Brain className="w-3.5 h-3.5 text-purple-500" />
                    Growth rate: <span className="font-bold text-purple-600">{prediction.slope_cm_per_month > 0 ? '+' : ''}{prediction.slope_cm_per_month} cm/month</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    RMSE: {prediction.rmse} cm · {prediction.meta?.confidence_interval ?? '95% CI'}
                  </div>
                </div>

                <PredictiveGrowthChart
                  historical={analytics.monthly_growth_trend}
                  predictions={prediction.predictions}
                />

                {/* Model / forecast provenance */}
                {prediction.meta && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="text-gray-400">Model</p>
                      <p className="font-medium text-gray-700">{prediction.meta.model_name}</p>
                      {prediction.meta.model_version && <p className="text-[11px] text-gray-400">{prediction.meta.model_version}</p>}
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="text-gray-400">Forecast period</p>
                      <p className="font-medium text-gray-700">{prediction.meta.forecast_months} months</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="text-gray-400">History used</p>
                      <p className="font-medium text-gray-700">{prediction.meta.history_months} months</p>
                      {prediction.meta.history_range?.from && (
                        <p className="text-[11px] text-gray-400">{prediction.meta.history_range.from} → {prediction.meta.history_range.to}</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="text-gray-400">Generated</p>
                      <p className="font-medium text-gray-700">{formatDate(prediction.meta.prediction_date)}</p>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </Section>
        )}

        {/* ── Growth Stage Distribution — fixed 4 cards in order ────────────── */}
        <Section title="Growth Stage Distribution" subtitle="Current maturity of tracked trees">
          {(() => {
            // Count per backend stage key (seedling/sapling/juvenile/mature),
            // dynamically from the site's monitoring data.
            const dist: { stage: string; count: number }[] = (analytics as any).growth_stage_distribution ?? []
            const countFor = (key: string) =>
              dist.filter(d => String(d.stage).toLowerCase() === key).reduce((n, d) => n + (d.count ?? 0), 0)

            // The four stages in the required display order. "Young Tree" maps to
            // the backend's 'juvenile' stage.
            const STAGES = [
              { key: 'seedling', label: 'Seedling',   icon: '🌱', cls: 'bg-green-50 text-green-700 border-green-200' },
              { key: 'sapling',  label: 'Sapling',    icon: '🌿', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
              { key: 'juvenile', label: 'Young Tree', icon: '🌳', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
              { key: 'mature',   label: 'Mature',     icon: '🌲', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
            ]
            return (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {STAGES.map(s => (
                  <div key={s.key} className={`rounded-xl border p-3 text-center ${s.cls}`}>
                    <p className="text-2xl mb-1">{s.icon}</p>
                    <p className="text-xl font-bold tabular-nums">{countFor(s.key).toLocaleString()}</p>
                    <p className="text-xs font-medium mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )
          })()}
        </Section>

        {/* ── Species breakdown table ───────────────────────────────────────── */}
        {(analytics.species_distribution?.length ?? 0) > 0 && (
          <Section title="Species Breakdown" subtitle="All recorded species at this site">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="table-header w-8">#</th>
                    <th className="table-header">Scientific Name</th>
                    <th className="table-header">Local Name</th>
                    <th className="table-header text-right">Tree Count</th>
                    <th className="table-header text-right">Species Composition</th>
                    <th className="table-header">Population Spread</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {analytics.species_distribution.map((sp, i) => {
                    const local = localNames[sp.species_name?.toLowerCase() ?? ''] ?? null
                    return (
                      <tr key={sp.species_name} className="hover:bg-gray-50/70 transition-colors">
                        <td className="table-cell text-xs text-gray-300 font-mono">{i + 1}</td>
                        <td className="table-cell">
                          <span className="italic text-gray-700 font-medium">{sp.species_name}</span>
                        </td>
                        <td className="table-cell text-gray-600">{local ?? <span className="text-gray-300">—</span>}</td>
                        <td className="table-cell text-right font-bold text-gray-800 tabular-nums">{sp.count.toLocaleString()}</td>
                        <td className="table-cell text-right text-gray-500 tabular-nums">{sp.percentage}%</td>
                        <td className="table-cell w-40">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-500"
                              style={{ width: `${sp.percentage}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {((analytics as any).event_accomplishments?.length ?? 0) > 0 && (
          <Section title="Event Accomplishments & Growth Monitoring" subtitle="Day 0 baselines submitted for this restoration site">
            <div className="space-y-4">
              {(analytics as any).event_accomplishments.map((item: any) => {
                const growthUpdates = (item.report?.updates ?? []).filter((update: any) => update.type === 'growth_monitoring')
                const baselinePhoto = typeof item.photos?.[0] === 'string' ? item.photos[0] : item.photos?.[0]?.url
                const latestUpdate = growthUpdates[0]
                const latestPhoto = latestUpdate?.photos?.[0]?.url ?? latestUpdate?.image_url
                return (
                  <article key={item.id} className="rounded-xl border border-gray-100 p-4 sm:p-5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>{item.event?.name}</strong>
                      <span className="text-xs text-gray-500">Day 0 · {formatDate(item.submitted_at)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{item.species_name} · {Number(item.seedlings_planted).toLocaleString()} seedlings · {item.volunteers_present} volunteers</p>
                    <p className="text-xs text-gray-400">Reported by {item.user?.name}</p>
                    {(baselinePhoto || latestPhoto) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      {[{ title: 'Day 0 baseline', url: baselinePhoto }, { title: 'Latest growth update', url: latestPhoto }].map(photo => <div key={photo.title} className="rounded-lg border border-gray-100 overflow-hidden">
                        {photo.url ? <img src={photo.url} alt={`${photo.title} for ${item.event?.name ?? 'planting event'}`} className="w-full aspect-video object-cover" /> : <div className="w-full aspect-video bg-gray-50 flex items-center justify-center text-xs text-gray-400">No update photo yet</div>}
                        <p className="px-3 py-2 text-xs font-semibold text-gray-600">{photo.title}</p>
                      </div>)}
                    </div>}
                    {growthUpdates.length > 0 && <div className="mt-4 overflow-x-auto">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Survival trend by monitoring interval</p>
                      <div className="flex flex-wrap gap-2">{growthUpdates.map((update: any) => <div key={update.id} className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-xs">
                        <span className="font-semibold text-green-800">{update.fields?.period ?? 'Growth update'}</span>
                        <span className="mx-1.5 text-green-300">·</span>
                        <span className="font-bold text-green-700">{update.fields?.survival_rate ?? '—'}{update.fields?.survival_rate != null ? '%' : ''}</span>
                        {update.fields?.health && <span className="ml-1.5 text-gray-500">{update.fields.health}</span>}
                      </div>)}</div>
                    </div>}
                  </article>
                )
              })}
            </div>
          </Section>
        )}

      </div>
    </SidebarLayout>
  )
}

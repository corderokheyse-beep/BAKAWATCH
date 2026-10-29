'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import { fetchArticles, fetchSpecies } from '@/lib/mangrove-api'
import type { Article, MangroveSpecies } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { BookOpen, Search, Tag, Eye, Plus, ArrowRight, Sprout, Leaf, MapPin, Waves, X, ChevronRight, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'tips', label: 'Tips & Practices' },
  { value: 'news', label: 'News' },
  { value: 'guide', label: 'Guides' },
  { value: 'research', label: 'Research' },
]

const CATEGORY_COLORS: Record<string, string> = {
  tips:     'bg-green-100 text-green-700',
  news:     'bg-blue-100 text-blue-700',
  guide:    'bg-amber-100 text-amber-700',
  research: 'bg-purple-100 text-purple-700',
}

const SPECIES_GUIDE: Record<string, { zone: string; root: string; benefits: string }> = {
  'avicennia marina': { zone: 'Seaward / outer fringe', root: 'Pencil-like pneumatophores', benefits: 'Stabilizes exposed shores and traps sediment.' },
  'avicennia officinalis': { zone: 'Middle to landward, often riverine', root: 'Pneumatophores', benefits: 'Provides habitat and shoreline protection.' },
  'sonneratia alba': { zone: 'Seaward / outer fringe', root: 'Pneumatophores', benefits: 'Pioneer species that traps new sediment.' },
  'sonneratia caseolaris': { zone: 'Riverine / brackish estuary', root: 'Pneumatophores', benefits: 'Supports estuary habitat and stabilizes river banks.' },
  'rhizophora apiculata': { zone: 'Middle intertidal', root: 'Stilt / prop roots', benefits: 'Reduces erosion and shelters juvenile fish.' },
  'rhizophora mucronata': { zone: 'Seaward to middle intertidal', root: 'Stilt / prop roots', benefits: 'Protects muddy banks and supports coastal wildlife.' },
  'rhizophora stylosa': { zone: 'Seaward to middle intertidal', root: 'Stilt / prop roots', benefits: 'Tolerates exposed coasts and helps bind shore sediment.' },
  'bruguiera gymnorrhiza': { zone: 'Middle to landward', root: 'Knee roots', benefits: 'Provides forest structure and coastal protection.' },
  'bruguiera cylindrica': { zone: 'Middle intertidal', root: 'Knee roots', benefits: 'Adds habitat diversity and stabilizes soft mud.' },
  'bruguiera sexangula': { zone: 'Middle to landward / upriver', root: 'Knee roots', benefits: 'Supports sheltered estuary forests.' },
  'ceriops tagal': { zone: 'Landward / high intertidal', root: 'Small buttress roots', benefits: 'Helps maintain upper intertidal forest cover.' },
  'ceriops decandra': { zone: 'Landward / high intertidal', root: 'Small buttress roots', benefits: 'Contributes to landward mangrove diversity.' },
  'lumnitzera racemosa': { zone: 'Landward / high intertidal', root: 'No prominent aerial roots; may form low buttresses', benefits: 'Provides cover along the landward fringe.' },
  'nypa fruticans': { zone: 'Riverine / brackish tidal banks', root: 'Underground rhizomes', benefits: 'Useful leaves and fruit; binds estuary banks.' },
  'xylocarpus granatum': { zone: 'Landward / inner fringe', root: 'Prominent plank buttresses', benefits: 'Large canopy habitat and soil stabilization.' },
  'aegiceras corniculatum': { zone: 'Middle to landward / estuary', root: 'Shallow spreading roots', benefits: 'Flowers support pollinators; helps bind estuary soil.' },
  'excoecaria agallocha': { zone: 'Landward / upper intertidal', root: 'Shallow spreading roots', benefits: 'Adds forest diversity. Its milky sap irritates skin and eyes.' },
  'heritiera littoralis': { zone: 'Landward / coastal transition', root: 'Buttress roots', benefits: 'Provides canopy and helps stabilize the forest edge.' },
}

function TipsGuides() {
  const [species, setSpecies] = useState<MangroveSpecies[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedGuide, setSelectedGuide] = useState<{ category: string; title: string; body: string } | null>(null)
  useEffect(() => { fetchSpecies().then(setSpecies).catch(() => {}) }, [])
  const entries = [
    { category: 'Monitoring and Care', title: 'Count survival', body: 'Mark a small plot or row. Count living seedlings and dead seedlings separately. Record the date and use the same plot each visit. Survival rate = living seedlings ÷ seedlings planted × 100.' },
    { category: 'Monitoring and Care', title: 'Measure height', body: 'Measure from the soil line to the highest living tip. Use centimeters, measure the same trees each visit, and record the date.' },
    { category: 'Monitoring and Care', title: 'Check pests, barnacles, and site condition', body: 'Look at leaves, stems, and roots for damage, barnacles, pests, or disease. Note wave damage, erosion, trash, and plastic. Photograph the same angle.' },
    { category: 'Monitoring and Care', title: 'Clean and replant carefully', body: 'Remove loose trash without pulling roots or disturbing wildlife. Report oil, dumping, cutting, or major erosion. Replant only with MENRO guidance and species suitable for that tidal zone.' },
    { category: 'Mangrove Basics', title: 'What mangroves do', body: 'Mangroves are salt-tolerant trees and shrubs living in tropical intertidal shores. Their roots slow waves, trap sediment, store carbon, and provide nursery habitat. Planting success depends on tides, soil, salinity, and matching species to the site.' },
    { category: 'App Guide', title: 'Planting Events', body: 'Open Planting Events, choose View Details to read the schedule and location, then Confirm Attendance so MENRO can plan. This does not reserve a volunteer registration spot.' },
    { category: 'App Guide', title: 'Report Accomplishment', body: 'After a planting event at your assigned site, open the event under Past Events. Submit the species, planted seedling count, volunteers present, and 1–5 photos. This becomes the Day 0 growth baseline.' },
    { category: 'App Guide', title: 'Report a threat', body: 'Choose Report Threat, describe what happened, select the location on the map, and attach a clear photo when safe. Submit it so MENRO can review and assign action.' },
    { category: 'App Guide', title: 'My Reports and Add Update', body: 'Open My Reports to see MENRO status and action taken. Open a report and choose Add Update after a follow-up visit. Add current condition, notes, photos, and recommended next step.' },
    { category: 'App Guide', title: 'Analytics and monitoring', body: 'Open Analytics to view only your assigned restoration site, its map, species, planting progress, and available Day 0 and growth monitoring records. Record later inspections through Add Update on the related report.' },
    { category: 'Zonation', title: 'Seaward / Outer Zone (Pambaybaying Bahagi)', body: 'Faces the open sea or bay. Daily flooding, strongest waves and wind, high salinity, and soft mud or sandy soil with coral bits. Avicennia marina and Sonneratia alba have pneumatophores (breathing roots).' },
    { category: 'Zonation', title: 'Middle Intertidal Zone (Gitnang Bahagi)', body: 'Between the seaward and landward zones. Regular tidal flushing, shelter from the strongest waves, and deep soft clay-silt or organic-rich mud. Mostly Rhizophora (Bakawan), with stilt or prop roots.' },
    { category: 'Zonation', title: 'Landward / High Intertidal Zone (Pangkati / Kadiwang Bahagi)', body: 'Nearest to land. Flooded mainly during spring tides; evaporation can make soil hypersaline and firmer or rockier. Ceriops tagal and Lumnitzera racemosa are examples; some landward trees have buttress roots.' },
    { category: 'Zonation', title: 'Riverine / Brackish Estuary Zone (Ilog at Baktas ng Tubig)', body: 'Along river mouths and banks where fresh and sea water mix. River flow is strong and mud is sediment-rich. Nypa fruticans (Nipa) and Sonneratia caseolaris (Pedada) are examples.' },
  ]
  const query = search.trim().toLowerCase()
  const filtered = entries.filter(e => (category === 'All' || category === e.category) && `${e.title} ${e.body}`.toLowerCase().includes(query))
  const speciesFiltered = species.filter(s => (category === 'All' || category === 'Species') && `${s.local_name} ${s.scientific_name} ${s.description ?? ''}`.toLowerCase().includes(query))
  const filters = ['All', 'Monitoring and Care', 'Mangrove Basics', 'Species', 'Zonation', 'App Guide']
  const total = filtered.length + speciesFiltered.length
  return <SidebarLayout title="Tips & Guides" subtitle="Practical mangrove care and BAKAWATCH field instructions"><div className="page-container space-y-6">
    <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-800 p-6 text-white shadow-lg sm:p-9 animate-slide-up">
      <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-64 w-64 rounded-full bg-lime-300/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-24 -z-10 opacity-10"><Sprout className="h-52 w-52" /></div>
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-green-100"><Leaf className="h-3.5 w-3.5" /> FIELD HANDBOOK</span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Grow your mangrove know-how</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-green-100/90 sm:text-base">Practical advice for monitoring seedlings, choosing the right species, and recording field work across Gloria.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-green-50 sm:text-sm">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2"><BookOpen className="h-4 w-4" /> {entries.length} field guides</span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2"><Sprout className="h-4 w-4" /> {species.length} species profiles</span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2"><MapPin className="h-4 w-4" /> Local field reference</span>
        </div>
      </div>
    </section>

    <section aria-label="Find a guide" className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">{filters.map(c => <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${category === c ? 'border-primary-600 bg-primary-600 text-white shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-700'}`}>{c}</button>)}</div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input aria-label="Search tips, species, or zones" className="input w-full rounded-2xl border-gray-200 bg-white py-3 pl-12 pr-12 shadow-sm transition focus:border-primary-400 focus:shadow-md" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tips, species, or zones..." />
        {search && <button aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>}
      </div>
      <div className="flex items-center justify-between px-1"><h2 className="text-sm font-semibold text-gray-800">{category === 'All' ? 'Explore the handbook' : category}</h2><span className="text-xs text-gray-500">{total} {total === 1 ? 'resource' : 'resources'}</span></div>
    </section>

    {(category === 'All' || category === 'Species') && speciesFiltered.length > 0 && <section className="space-y-3">
      <div className="flex items-center gap-2"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Sprout className="h-4 w-4" /></span><div><h2 className="font-bold text-gray-900">Mangrove species</h2><p className="text-xs text-gray-500">Match species to the local tidal zone before planting.</p></div></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{speciesFiltered.map((s, i) => { const guide = SPECIES_GUIDE[s.scientific_name.toLowerCase()]; return <article key={s.id} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg animate-slide-up">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-lime-400 opacity-70 transition-opacity group-hover:opacity-100" />
        <div className="flex items-start gap-3"><span className="mt-0.5 rounded-xl bg-emerald-50 p-2.5 text-emerald-700 transition-colors group-hover:bg-emerald-100"><Leaf className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="font-bold text-gray-900">{s.local_name || s.scientific_name}</h3><p className="text-sm italic text-gray-500">{s.scientific_name}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Species</span></div>
        <p className="mt-4 text-sm leading-relaxed text-gray-600">{s.description || 'A native mangrove species found in Philippine coastal forests.'}</p>
        <div className="mt-4 grid gap-2 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <div className="rounded-xl bg-gray-50 p-3"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"><Waves className="h-3.5 w-3.5 text-teal-600" /> Preferred zone</div><p className="mt-1 text-sm font-medium text-gray-800">{guide?.zone ?? 'Confirm the suitable tidal zone with MENRO.'}</p></div>
          <div className="rounded-xl bg-gray-50 p-3"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"><Sprout className="h-3.5 w-3.5 text-emerald-600" /> Root type</div><p className="mt-1 text-sm font-medium text-gray-800">{guide?.root ?? 'Observe locally before planting.'}</p></div>
        </div><p className="mt-3 text-sm leading-relaxed text-gray-600"><strong className="text-gray-800">Why it matters:</strong> {guide?.benefits ?? 'Supports coastal habitat and sediment stability.'}</p>
      </article> })}</div>
    </section>}

    {filtered.length > 0 && <section className="space-y-3">
      {(category === 'All' || category === 'Species') && <div className="flex items-center gap-2"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><ClipboardCheck className="h-4 w-4" /></span><div><h2 className="font-bold text-gray-900">Field tips & how-tos</h2><p className="text-xs text-gray-500">Short, practical steps for your next visit.</p></div></div>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{filtered.map((e, i) => <article key={`${e.title}-${i}`} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg animate-slide-up">
        <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800"><Tag className="h-3 w-3" />{e.category}</span><span className="rounded-lg bg-gray-50 p-2 text-gray-400 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-700"><BookOpen className="h-4 w-4" /></span></div>
        <h3 className="mt-4 text-base font-bold text-gray-900 transition-colors group-hover:text-emerald-800">{e.title}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{e.body}</p>
        <button type="button" onClick={() => setSelectedGuide(e)} className="mt-4 flex w-full items-center justify-between border-t border-gray-100 pt-3 text-left text-xs font-semibold text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" aria-label={`Open field reference: ${e.title}`}><span>Read field reference</span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></button>
      </article>)}</div>
    </section>}
    {total === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500"><Search className="h-5 w-5" /></span><h2 className="mt-4 font-semibold text-gray-900">No matching guides</h2><p className="mt-1 text-sm text-gray-500">Try another search term or choose a different topic.</p><button onClick={() => { setSearch(''); setCategory('All') }} className="mt-4 text-sm font-semibold text-emerald-700 hover:text-emerald-900">Clear filters</button></div>}
    {selectedGuide && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedGuide(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="guide-dialog-title" className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-in">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white px-6 py-5">
          <div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800"><Tag className="h-3 w-3" />{selectedGuide.category}</span><h2 id="guide-dialog-title" className="mt-3 text-xl font-bold text-gray-900">{selectedGuide.title}</h2></div>
          <button type="button" autoFocus aria-label="Close field reference" onClick={() => setSelectedGuide(null)} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-6"><div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><span className="mt-0.5 rounded-xl bg-white p-2 text-emerald-700 shadow-sm"><BookOpen className="h-5 w-5" /></span><p className="text-sm leading-relaxed text-gray-700">{selectedGuide.body}</p></div><p className="mt-5 text-xs leading-relaxed text-gray-500">Use this as a field reference. Follow site instructions from MENRO and avoid disturbing seedlings or wildlife while working.</p></div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-4"><button type="button" onClick={() => setSelectedGuide(null)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700">Done</button></div>
      </section>
    </div>}
  </div></SidebarLayout>
}

function ArticlesContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(searchParams.get('category') ?? '')

  const isStaff = user?.role === 'admin' || user?.role === 'staff' || user?.role === 'menro'

  useEffect(() => {
    if (user?.role === 'field_worker' || user?.role === 'volunteer' || user?.role === 'user') return
    setLoading(true)
    fetchArticles({ category: category || undefined, search: search || undefined })
      .then(data => setArticles(data.data ?? data))
      .catch(() => toast.error('Failed to load articles'))
      .finally(() => setLoading(false))
  }, [category, search, user?.role])

  if (user?.role === 'field_worker' || user?.role === 'volunteer' || user?.role === 'user') return <TipsGuides />

  return (
    <SidebarLayout title="Articles & Tips" subtitle="Mangrove knowledge and conservation guides">
      <div className="page-container space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  category === c.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400 hover:text-primary-600'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search articles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 w-52"
              />
            </div>
            {isStaff && (
              <Link href="/articles/manage" className="btn-primary text-sm gap-1.5">
                <Plus className="w-4 h-4" /> New Article
              </Link>
            )}
          </div>
        </div>

        {/* Articles grid */}
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No articles found</p>
            <p className="text-sm text-gray-400 mt-1">
              {isStaff ? 'Create your first article using the button above.' : 'Check back soon for new content.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((article: Article) => (
              <Link key={article.id} href={`/articles/${article.slug}`}
                className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Cover image */}
                <div className="relative h-40 bg-gradient-to-br from-primary-50 to-forest-50 overflow-hidden">
                  {article.cover_image_url ? (
                    <img src={article.cover_image_url} alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-10 h-10 text-primary-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${CATEGORY_COLORS[article.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {article.category}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-primary-700 transition-colors">
                    {article.title}
                  </h3>
                  {article.excerpt && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{article.excerpt}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{article.author?.name ?? 'MENRO Gloria'}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{article.views}</span>
                      <span>{formatDate(article.published_at ?? article.created_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}

export default function ArticlesPage() {
  return (
    <Suspense fallback={null}>
      <ArticlesContent />
    </Suspense>
  )
}

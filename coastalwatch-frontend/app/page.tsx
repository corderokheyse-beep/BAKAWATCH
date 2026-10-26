  'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  Map, ArrowRight, Shield, TreePine, ChevronRight, CalendarDays,
  MapPin, Users, Leaf, Phone, BarChart2, ClipboardList, Activity,
  Menu, X, ArrowUp, BookOpen,
} from 'lucide-react'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import { fetchOpenEvents, fetchSites, fetchAnnouncements, fetchPublicStats } from '@/lib/mangrove-api'
import type { PlantingEvent, RestorationSite, Announcement, PublicStats } from '@/lib/types'
import { formatDate } from '@/lib/utils'

const SitePolygonMap = dynamic(() => import('@/components/map/SitePolygonMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[480px] rounded-3xl bg-gradient-to-br from-teal-50 to-primary-50 flex items-center justify-center">
      <div className="text-center">
        <Map className="w-10 h-10 text-primary-300 mx-auto mb-2 animate-pulse" />
        <p className="text-sm text-gray-400">Loading map…</p>
      </div>
    </div>
  ),
})

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const NAV_LINKS = [
  { label: 'About',    id: 'about' },
  { label: 'Features', id: 'features' },
  { label: 'Tips & Guides', id: 'tips-guides' },
  { label: 'Events',   id: 'events' },
  { label: 'Map',      id: 'map' },
  { label: 'Contact',  id: 'contact' },
]

const TIPS_AND_GUIDES = [
  {
    icon: MapPin,
    label: 'Before you plant',
    title: 'Choose the right place',
    description: 'Mangroves thrive along sheltered shorelines where they already grow naturally.',
    detail: 'Check local conditions and ask MENRO Gloria for guidance before starting a planting activity.',
    color: 'bg-teal-100 text-teal-700',
  },
  {
    icon: TreePine,
    label: 'Planting guide',
    title: 'Use suitable native species',
    description: 'Select healthy, locally appropriate mangrove seedlings or propagules for the site.',
    detail: 'Match the species to the area and follow recommended spacing and planting methods.',
    color: 'bg-green-100 text-green-700',
  },
  {
    icon: Leaf,
    label: 'Ongoing care',
    title: 'Help young mangroves grow',
    description: 'Give new plantings room to establish and protect them from avoidable disturbance.',
    detail: 'Keep the area free of litter, check on seedling survival, and report damage to local staff.',
    color: 'bg-lime-100 text-lime-700',
  },
]

export default function HomePage() {
  const { user, homePath } = useAuth()
  const [events, setEvents]               = useState<PlantingEvent[]>([])
  const [sites, setSites]                 = useState<RestorationSite[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [stats, setStats]                 = useState<PublicStats | null>(null)
  const [mounted, setMounted]     = useState(false)
  const [mobileOpen, setMobile]   = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const [activeSection, setActiveSection] = useState<string>('hero')

  useEffect(() => {
    fetchOpenEvents().then(setEvents).catch(() => {})
    fetchSites().then(setSites).catch(() => {})
    fetchAnnouncements().then(setAnnouncements).catch(() => {})
    fetchPublicStats().then(setStats).catch(() => {})
    setMounted(true)

    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)

    // Track which section is in view
    const sectionIds = ['hero', 'about', 'features', 'tips-guides', 'events', 'map', 'contact']
    const observers: IntersectionObserver[] = []

    sectionIds.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id) },
        { rootMargin: '-40% 0px -55% 0px' }
      )
      obs.observe(el)
      observers.push(obs)
    })

    return () => {
      window.removeEventListener('scroll', onScroll)
      observers.forEach(o => o.disconnect())
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f7f0]">
      {/* ── Sticky Nav ──────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white shadow-md border-b border-gray-200'
          : 'bg-black/40 backdrop-blur-sm'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2.5">
            <BakawatchLogo size={48} />
            <div>
              <p className={`text-sm font-bold leading-none transition-colors ${scrolled ? 'text-gray-900' : 'text-white'}`}>BAKAWATCH</p>
              <p className={`text-[10px] leading-none mt-0.5 transition-colors ${scrolled ? 'text-gray-400' : 'text-white/80'}`}>MENRO Gloria · Oriental Mindoro</p>
            </div>
          </button>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ label, id }) => {
              const isActive = activeSection === id
              return (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  title={`Go to ${label}`}
                  className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? scrolled
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-white/30 text-white font-semibold'
                      : scrolled
                        ? 'text-gray-700 hover:text-primary-700 hover:bg-primary-50'
                        : 'text-white hover:text-white hover:bg-white/20 font-medium'
                  }`}
                >
                  {label}
                  {/* Active underline indicator */}
                  <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-200 ${
                    isActive ? 'w-4 bg-white/70' : 'w-0 group-hover:w-3 bg-current opacity-40'
                  }`} />
                </button>
              )
            })}
          </nav>

          {/* Sign in / Dashboard + mobile toggle */}
          <div className="flex items-center gap-2">
            {user ? (
              <Link href={homePath}
                className={`hidden md:inline-flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl transition-all ${
                  scrolled ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm' : 'bg-white/20 hover:bg-white/30 border border-white/40 text-white'
                }`}>
                Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link href="/login"
                className={`hidden md:inline-flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl transition-all ${
                  scrolled ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm' : 'bg-white/20 hover:bg-white/30 border border-white/40 text-white'
                }`}>
                Sign in <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <button className="md:hidden p-2 rounded-xl" onClick={() => setMobile(o => !o)}>
              {mobileOpen
                ? <X className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />
                : <Menu className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ label, id }) => (
              <button key={id} onClick={() => { scrollTo(id); setMobile(false) }}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeSection === id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700'
                }`}>
                {label}
              </button>
            ))}
            <Link href={user ? homePath : '/login'} onClick={() => setMobile(false)}
              className="block w-full text-center mt-2 bg-primary-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">
              {user ? 'Go to Dashboard' : 'Sign in'}
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section id="hero" className="relative min-h-screen flex flex-col overflow-hidden">
        <Image src="/images/mangroove.jpg" alt="Mangrove trees in Gloria, Oriental Mindoro"
          fill priority className="object-cover object-center" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/45 via-transparent to-forest-900/50" />
        <div className="absolute top-1/4 right-10 w-64 h-64 bg-primary-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-10 w-48 h-48 bg-forest-400/10 rounded-full blur-2xl" />

        <div className="relative flex-1 flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-0">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              <span className="text-xs font-semibold text-white/80 tracking-wide">Municipality of Gloria · Oriental Mindoro · Philippines</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6 drop-shadow-lg">
              BAKAWATCH<br /><span className="text-primary-300">Mangrove</span><br />System
            </h1>
            <p className="text-lg text-white/75 leading-relaxed mb-10 max-w-lg">
              The official digital platform of MENRO Gloria for recording, tracking, and monitoring mangrove restoration activities along the coastlines of Gloria, Oriental Mindoro.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={user ? homePath : '/login'}
                className="group inline-flex items-center justify-center gap-2 bg-white text-primary-800 font-bold px-7 py-3.5 rounded-xl hover:bg-primary-50 transition-all duration-200 shadow-xl hover:-translate-y-0.5 text-sm">
                {user ? 'Go to Dashboard' : 'Sign in to your account'} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <button onClick={() => scrollTo('map')}
                className="group inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-white/20 transition-all duration-200 hover:-translate-y-0.5 text-sm">
                <Map className="w-4 h-4" /> View Live Map
              </button>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative mt-auto border-t border-white/10 bg-black/30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { value: mounted && stats ? String(stats.restoration_sites) : '—',   label: 'Restoration Sites' },
                { value: mounted && stats ? String(stats.species_monitored) : '—',    label: 'Species Monitored' },
                { value: mounted && stats ? stats.trees_planted.toLocaleString() : '—', label: 'Trees Planted' },
                { value: mounted && stats ? `${stats.protected_area_ha} ha` : '—',    label: 'Protected Area' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold text-white tabular-nums drop-shadow">{s.value}</p>
                  <p className="text-xs text-white/55 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Restricted notice ───────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center gap-3">
          <Shield className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            This system is exclusively for authorized personnel of the Municipal Environment and Natural Resources Office (MENRO) of Gloria, Oriental Mindoro. Unauthorized access is prohibited.
          </p>
        </div>
      </section>

      {/* ── About ───────────────────────────────────────────────────────────── */}
      <section id="about" className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-[#f0f7f0] to-teal-50" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-forest-200/20 rounded-full blur-2xl" />

        <div className="relative max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
                <Leaf className="w-3.5 h-3.5" /> Gloria's Coastal Heritage
              </span>
              <h2 className="text-4xl font-extrabold text-gray-900 leading-tight mb-6">
                Protecting Gloria's<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-forest-600">Mangrove Coastline</span>
              </h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                BAKAWATCH is the official cross-platform mangrove monitoring system of MENRO Gloria, designed to record, track, and manage mangrove restoration activities across the coastlines of Gloria, Oriental Mindoro.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                The Mangrove Reserve in Barangay Agsalin features a <strong>12-hectare core zone</strong> and a <strong>4.8-hectare mangrove/beach forest reserve</strong> — serving as vital nurseries for juvenile fish, shrimp, and crabs while providing natural coastal defense against storm surges.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: mounted && stats ? `${stats.protected_area_ha} ha` : '—', label: 'Total Protected Area', color: 'from-primary-500 to-primary-600' },
                  { value: mounted && stats ? String(stats.restoration_sites) : '—',  label: 'Restoration Sites',    color: 'from-forest-500 to-forest-600' },
                  { value: mounted && stats ? stats.trees_planted.toLocaleString() : '—', label: 'Trees Planted',    color: 'from-teal-500 to-teal-600' },
                  { value: mounted && stats ? `${stats.species_monitored} Species` : '—', label: 'Mangrove Species', color: 'from-emerald-500 to-emerald-600' },
                ].map(({ value, label, color }) => (
                  <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                    <p className={`text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r ${color}`}>{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Image collage */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-3">
                  <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg group">
                    <Image src="/images/mangroove.jpg" alt="Mangrove restoration" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary-900/40 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs font-semibold text-white bg-primary-600/80 backdrop-blur-sm px-2 py-1 rounded-lg">Agsalin Reserve</span>
                    </div>
                  </div>
                  <div className="relative h-32 rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-primary-100 to-forest-100 flex items-center justify-center">
                    <div className="text-center">
                      <TreePine className="w-10 h-10 text-primary-600 mx-auto mb-1" />
                      <p className="text-xs font-semibold text-primary-700">{mounted && stats ? `${stats.species_monitored} Species` : 'Mangrove Species'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 mt-6">
                  <div className="relative h-32 rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-teal-100 to-primary-100 flex items-center justify-center">
                    <div className="text-center">
                      <Users className="w-10 h-10 text-teal-600 mx-auto mb-1" />
                      <p className="text-xs font-semibold text-teal-700">Community Driven</p>
                    </div>
                  </div>
                  <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg group">
                    <Image src="/images/pinamalayan_mangroove.jpg" alt="Mangrove forest" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-900/40 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs font-semibold text-white bg-forest-600/80 backdrop-blur-sm px-2 py-1 rounded-lg">Sta. Theresa MPA</span>
                    </div>
                  </div>
                </div>
              </div>
              {mounted && stats?.survival_rate != null && (
                <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-lg p-4 border border-primary-100">
                  <p className="text-2xl font-extrabold text-primary-600">{stats.survival_rate}%</p>
                  <p className="text-xs text-gray-500">Avg. Survival Rate</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 bg-white relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary-50/60 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              <BarChart2 className="w-3.5 h-3.5" /> System Capabilities
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">What BAKAWATCH Can Do</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              A complete digital toolkit for MENRO Gloria (BAKAWATCH) to manage, monitor, and protect mangrove ecosystems across Gloria, Oriental Mindoro.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: TreePine,
                title: 'Plantation Tracking',
                desc: 'Record every mangrove tree planted with GPS coordinates, species name, seedling source, and photo documentation.',
                color: 'bg-primary-100 text-primary-600',
              },
              {
                icon: Activity,
                title: 'Growth Monitoring',
                desc: 'Track tree height, diameter, survival status, and growth stage over time to measure restoration success.',
                color: 'bg-forest-100 text-forest-600',
              },
              {
                icon: Map,
                title: 'Live Map View',
                desc: 'Visualize all restoration sites, plantation records, and community reports on an interactive real-time map.',
                color: 'bg-blue-100 text-blue-600',
              },
              {
                icon: CalendarDays,
                title: 'Planting Events',
                desc: 'Organize and manage community mangrove planting events with volunteer registration and capacity tracking.',
                color: 'bg-amber-100 text-amber-600',
              },
              {
                icon: BarChart2,
                title: 'Analytics & Reports',
                desc: 'Generate survival rate reports, species breakdowns, and downloadable PDF/CSV reports for MENRO records.',
                color: 'bg-emerald-100 text-emerald-600',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Announcements Banner ────────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <section className="bg-white border-b border-gray-100 py-3 px-4">
          <div className="max-w-7xl mx-auto space-y-2">
            {announcements.slice(0, 2).map(a => {
              const styles: Record<string, string> = {
                info:    'bg-blue-50  border-blue-200  text-blue-800',
                warning: 'bg-amber-50 border-amber-200 text-amber-800',
                success: 'bg-green-50 border-green-200 text-green-800',
                urgent:  'bg-red-50   border-red-200   text-red-800',
              }
              return (
                <div key={a.id} className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border text-sm ${styles[a.type] ?? styles.info}`}>
                  <span className="font-bold">{a.title}:</span>
                  <span className="opacity-90">{a.content}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Tips & Guides ───────────────────────────────────────────────────── */}
      <section id="tips-guides" className="py-20 px-4 bg-white relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              <BookOpen className="w-3.5 h-3.5" /> Mangrove care
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Tips & Guides</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              Simple ways to support healthy mangroves and successful restoration in Gloria.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TIPS_AND_GUIDES.map(({ icon: Icon, label, title, description, detail, color }, index) => (
              <article key={title} className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-6">
                  <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
                    <Icon className="w-6 h-6" />
                  </span>
                  <span className="text-xs font-bold tracking-widest text-gray-300">0{index + 1}</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary-700 mb-2">{label}</p>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-sm leading-relaxed text-gray-600 mb-3">{description}</p>
                <p className="text-xs leading-relaxed text-gray-400">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Events ──────────────────────────────────────────────────────────── */}
      <section id="events" className="py-20 px-4 relative overflow-hidden">        <div className="absolute inset-0 bg-gradient-to-b from-[#f0f7f0] via-white to-[#e8f5e9]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-100/40 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              <CalendarDays className="w-3.5 h-3.5" /> Community Activities
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Upcoming Planting Events</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              Join MENRO Gloria's community mangrove planting activities. Every tree planted strengthens our coastline and supports local biodiversity.
            </p>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-14 bg-white/60 rounded-3xl border border-gray-100">
              <CalendarDays className="w-10 h-10 text-primary-200 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-600">No upcoming planting events right now</p>
              <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                MENRO Gloria posts community planting activities here as they are scheduled. Check back soon or sign in to request an event.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.slice(0, 6).map(ev => (
                <EventCard key={ev.id}
                  name={ev.name}
                  location={ev.location_name ?? ev.site?.name ?? 'Gloria, Oriental Mindoro'}
                  date={formatDate(ev.scheduled_at)}
                  spots={ev.remaining_capacity ?? 0}
                  max={ev.max_volunteers}
                  img="/images/mangroove.jpg"
                  tag={ev.status}
                />
              ))}
            </div>
          )}

          <div className="text-center mt-10">
            <Link href="/events"
              className="group inline-flex items-center gap-2 bg-gradient-to-r from-primary-600 to-forest-600 hover:from-primary-700 hover:to-forest-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-lg hover:-translate-y-0.5 text-sm">
              Register to Join <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <section id="map" className="py-20 px-4 bg-white relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              <Map className="w-3.5 h-3.5" /> Live Map
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Restoration Sites Map</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              Explore all active mangrove restoration sites across Gloria, Oriental Mindoro. Sign in to view detailed plantation records and ecosystem data.
            </p>
          </div>

          {/* Live map */}
          <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100">
            <SitePolygonMap
              sites={sites}
              height="480px"
              zoom={12}
              publicMode
            />
          </div>

          {/* Site count + sign-in nudge */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-2.5 h-2.5 rounded-full bg-primary-500 animate-pulse" />
              {sites.length > 0
                ? `${sites.length} restoration site${sites.length > 1 ? 's' : ''} across Gloria, Oriental Mindoro`
                : 'Loading restoration sites…'}
            </div>
            <Link href="/login"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-md">
              Sign in for full access <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-[#f0f7f0] to-teal-50" />
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              <Phone className="w-3.5 h-3.5" /> Get in Touch
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm leading-relaxed">
              For inquiries about mangrove restoration, planting events, or system access, reach out to our MENRO Gloria personnel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Bantay Bakawan */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
                <Leaf className="w-7 h-7 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Bantay Bakawan</h3>
              <p className="text-xs text-gray-400 mb-4">Mangrove Watch Personnel</p>
              <a href="tel:09983024938"
                className="inline-flex items-center gap-2 bg-primary-50 hover:bg-primary-100 text-primary-700 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors">
                <Phone className="w-4 h-4" /> 0998 302 4938
              </a>
            </div>

            {/* MENRO Head */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 text-center">
              <div className="w-14 h-14 rounded-2xl bg-forest-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-forest-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">MENRO Office</h3>
              <p className="text-xs text-gray-400 mb-4">Municipal Environment Officer</p>
              <a href="tel:09177707649"
                className="inline-flex items-center gap-2 bg-forest-50 hover:bg-forest-100 text-forest-700 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors">
                <Phone className="w-4 h-4" /> 0917 770 7649
              </a>
            </div>
          </div>

          {/* Office info */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-4 h-4 text-primary-500" />
              Municipal Environment and Natural Resources Office (MENRO), Gloria, Oriental Mindoro, Philippines
            </div>
          </div>
        </div>
      </section>

      {/* ── Back to Top ─────────────────────────────────────────────────────── */}
      {scrolled && (
        <button
          onClick={() => scrollTo('hero')}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:-translate-y-1 group"
        >
          <ArrowUp className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
        </button>
      )}

      {/* ── Floating section nav dots ────────────────────────────────────────── */}
      {scrolled && (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden lg:flex flex-col gap-2.5">
          {[{ id: 'hero', label: 'Top' }, ...NAV_LINKS].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              title={label}
              aria-label={`Go to ${label}`}
              className={`group relative w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                activeSection === id
                  ? 'bg-primary-600 scale-125'
                  : 'bg-gray-300 hover:bg-primary-400 hover:scale-110'
              }`}
            >
              {/* Tooltip */}
              <span className="absolute right-5 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none">
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-forest-800" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center mb-8">
            <BakawatchLogo size={64} />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight">
            Join the Mission to<br />
            <span className="text-primary-300">Restore Gloria's Mangroves</span>
          </h2>
          <p className="text-primary-200 text-base mb-10 max-w-xl mx-auto leading-relaxed">
            Sign in with your MENRO Gloria account to access the full monitoring system, record plantings, and help protect our coastal ecosystems.
          </p>
          <Link href={user ? homePath : '/login'}
            className="group inline-flex items-center gap-2 bg-white text-primary-800 font-bold px-10 py-4 rounded-xl hover:bg-primary-50 transition-all duration-200 shadow-2xl hover:-translate-y-0.5 text-sm">
            {user ? 'Go to Dashboard' : 'Sign in to BAKAWATCH'} <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BakawatchLogo size={28} />
            <p className="text-xs text-gray-500">© {new Date().getFullYear()} MENRO Gloria · Municipal Environment and Natural Resources Office</p>
          </div>
          <div className="flex items-center gap-4">
            {NAV_LINKS.map(({ label, id }) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600">Gloria, Oriental Mindoro, Philippines</p>
        </div>
      </footer>
    </div>
  )
}

/* ── Event Card ───────────────────────────────────────────────────────────── */
function EventCard({ name, location, date, spots, max, img, tag }: {
  name: string; location: string; date: string; spots: number; max: number; img: string; tag: string
}) {
  const pct   = max > 0 ? Math.round(((max - spots) / max) * 100) : 0
  const isFull = spots <= 0
  return (
    <div className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className="relative h-48 overflow-hidden">
        <Image src={img} alt={name} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${tag === 'open' || tag === 'Open' ? 'bg-primary-500 text-white' : 'bg-gray-500 text-white'}`}>{tag}</span>
        </div>
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-primary-600" />
            <span className="text-xs font-semibold text-gray-800">{date}</span>
          </div>
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">{name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
          <MapPin className="w-3.5 h-3.5 text-primary-500 shrink-0" />
          <span className="truncate">{location}</span>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              <span>{isFull ? 'Full' : `${spots} spots left`}</span>
            </div>
            <span className="text-xs font-semibold text-gray-600">{max - spots}/{max}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${isFull ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-gradient-to-r from-primary-500 to-forest-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Link href="/login" className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-forest-600 hover:from-primary-700 hover:to-forest-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all duration-150 shadow-sm">
          Sign in to Register <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { getNavLinks, roleLabel } from '@/lib/nav-links'
import NotificationBell from '@/components/layout/NotificationBell'
import AnnouncementBanner from '@/components/ui/AnnouncementBanner'
import BakawatchLogo from '@/components/ui/BakawatchLogo'
import {
  LogOut, Menu, TreePine, Shield, ChevronRight,
} from 'lucide-react'

interface SidebarLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

// Extracted so useSearchParams is inside a Suspense boundary (required by Next.js 16)
function NavLinks({ navLinks, onClose }: { navLinks: ReturnType<typeof getNavLinks>; onClose: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // A link "matches" the current URL if its base path is the current path or an
  // ancestor of it, and any query params it declares (e.g. ?tab=users) match.
  const matches = (href: string): boolean => {
    const [base, query] = href.split('?')
    if (pathname !== base && !pathname.startsWith(base + '/')) return false
    if (query) {
      const linkParams = new URLSearchParams(query)
      for (const [key, value] of linkParams.entries()) {
        if (searchParams.get(key) !== value) return false
      }
    } else if (searchParams.has('tab')) {
      // A plain link (no query) must not win when a tab-specific link exists.
      return false
    }
    return true
  }

  // Resolve a SINGLE active link to avoid double-highlighting when one route is
  // a prefix of another (e.g. /plantation vs /plantation/new, /admin vs
  // /admin/reports). The winner is the most specific match:
  //   1. an exact base-path match always wins (e.g. on /plantation/new, the
  //      "Plant" link whose base IS /plantation/new beats the "My Plantations"
  //      link whose base is only /plantation),
  //   2. otherwise the longest matching base path wins,
  //   3. ties break in favour of the link that declares query params.
  const activeHref = (() => {
    let winner: string | null = null
    let winnerScore = -1
    for (const { href } of navLinks) {
      if (!matches(href)) continue
      const [base, query] = href.split('?')
      const exact = pathname === base
      const score = (exact ? 100000 : 0) + base.length * 2 + (query ? 1 : 0)
      if (score > winnerScore) {
        winnerScore = score
        winner = href
      }
    }
    return winner
  })()

  return (
    <nav className="space-y-0.5">
      {navLinks.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref
        return (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              active
                ? 'bg-white text-[#1a4731] font-semibold shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
            {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[#1a4731]/50" />}
          </Link>
        )
      })}
    </nav>
  )
}

export default function SidebarLayout({ children, title, subtitle }: SidebarLayoutProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navLinks = getNavLinks(user?.role)

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <BakawatchLogo size={36} />
          <div>
            <p className="text-sm font-black text-white leading-tight tracking-wide">BAKAWATCH</p>
            <p className="text-[10px] text-white/60 leading-tight mt-0.5">Gloria, Oriental Mindoro</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2 mb-3">Navigation</p>
        <Suspense fallback={<div className="h-8" />}>
          <NavLinks navLinks={navLinks} onClose={() => setMobileOpen(false)} />
        </Suspense>
      </div>

      {/* User info */}
      <div className="px-3 py-4 border-t border-white/10">
        {user ? (
          <>
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-white/50 truncate">{roleLabel[user.role ?? ''] ?? user.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all duration-150"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all duration-150"
          >
            <Shield className="w-4 h-4" />
            <span>Sign in</span>
          </Link>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7f5]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 bg-[#1a4731] overflow-hidden" aria-label="Main navigation">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu" id="mobile-nav">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-64 bg-[#1a4731] h-full shadow-2xl animate-slide-up" aria-label="Mobile navigation">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <BakawatchLogo size={28} />
                <span className="text-white font-black text-sm tracking-wide">BAKAWATCH</span>
              </div>
              <button onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label="Close navigation menu">
                ✕
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 shadow-[0_1px_0_rgba(0,0,0,0.06)] px-6 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="w-5 h-5 text-gray-600" aria-hidden="true" />
            </button>
            {title && (
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">
                  {title}
                </h1>
                {subtitle && <p className="text-xs text-gray-400 leading-tight">{subtitle}</p>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700">
                  {roleLabel[user.role ?? ''] ?? user.role}
                </span>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-xs font-bold">
                  {user.name?.[0]?.toUpperCase() ?? '?'}
                </div>
              </>
            ) : (
              <Link href="/login" className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors">
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <AnnouncementBanner />
          {children}
        </main>
      </div>
    </div>
  )
}

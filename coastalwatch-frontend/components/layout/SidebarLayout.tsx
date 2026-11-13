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
import { LogOut, Menu, Shield, ChevronRight } from 'lucide-react'

interface SidebarLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

// ── Active-link resolver (shared by sidebar and bottom nav) ──────────────────
function useActiveHref(navLinks: ReturnType<typeof getNavLinks>): string | null {
  const pathname  = usePathname()
  const searchParams = useSearchParams()

  const matches = (href: string): boolean => {
    const [base, query] = href.split('?')
    if (pathname !== base && !pathname.startsWith(base + '/')) return false
    if (query) {
      const lp = new URLSearchParams(query)
      for (const [k, v] of lp.entries()) if (searchParams.get(k) !== v) return false
    } else if (searchParams.has('tab')) {
      return false
    }
    return true
  }

  let winner: string | null = null
  let winnerScore = -1
  for (const { href } of navLinks) {
    if (!matches(href)) continue
    const [base, query] = href.split('?')
    const score = (pathname === base ? 100000 : 0) + base.length * 2 + (query ? 1 : 0)
    if (score > winnerScore) { winnerScore = score; winner = href }
  }
  return winner
}

// ── Desktop / mobile-overlay sidebar nav links ───────────────────────────────
function NavLinks({
  navLinks,
  onClose,
}: {
  navLinks: ReturnType<typeof getNavLinks>
  onClose: () => void
}) {
  const activeHref = useActiveHref(navLinks)

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
                : 'text-white/80 hover:text-white hover:bg-white/10',
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

// ── Mobile fixed bottom navigation bar ───────────────────────────────────────
function MobileBottomNav({ navLinks }: { navLinks: ReturnType<typeof getNavLinks> }) {
  const activeHref = useActiveHref(navLinks)
  // Show at most 5 items so each tab is comfortably tappable
  const visible = navLinks.slice(0, 5)

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1a4731] border-t border-white/10 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      {visible.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref
        // Report Threat center FAB — raised green button
        if (href === '/reports/new') {
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center relative -mt-4"
              aria-label="Report Threat"
            >
              <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-900/40 border-4 border-[#1a4731]">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className={`text-[10px] font-semibold mt-0.5 ${active ? 'text-white' : 'text-white/50'}`}>
                {label}
              </span>
            </Link>
          )
        }

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 relative transition-all duration-150',
              active ? 'text-white' : 'text-white/50 hover:text-white/80',
            )}
          >
            {/* Top indicator pill when active */}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
            )}
            <div className={cn(
              'w-9 h-7 flex items-center justify-center rounded-xl transition-all duration-150',
              active ? 'bg-white/20' : '',
            )}>
              <Icon className={cn('w-5 h-5', active ? 'text-white' : 'text-white/50')} />
            </div>
            <span className={cn(
              'text-[10px] font-medium truncate max-w-[56px] text-center leading-none',
              active ? 'text-white font-semibold' : 'text-white/50',
            )}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// ── Sidebar content (shared between desktop & mobile overlay) ─────────────────
function SidebarContent({
  navLinks,
  user,
  onClose,
  onLogout,
}: {
  navLinks: ReturnType<typeof getNavLinks>
  user: ReturnType<typeof useAuth>['user']
  onClose: () => void
  onLogout: () => void
}) {
  return (
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

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2 mb-3">Navigation</p>
        <Suspense fallback={<div className="h-8" />}>
          <NavLinks navLinks={navLinks} onClose={onClose} />
        </Suspense>
      </div>

      {/* User / sign-out */}
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
              onClick={onLogout}
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
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function SidebarLayout({ children, title, subtitle }: SidebarLayoutProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navLinks = getNavLinks(user?.role)

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7f5]">

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-52 shrink-0 bg-[#1a4731] overflow-hidden"
        aria-label="Main navigation"
      >
        <SidebarContent
          navLinks={navLinks}
          user={user}
          onClose={() => {}}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile full-screen overlay sidebar (hamburger) ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          id="mobile-nav"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative flex flex-col w-64 bg-[#1a4731] h-full shadow-2xl"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <BakawatchLogo size={28} />
                <span className="text-white font-black text-sm tracking-wide">BAKAWATCH</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close navigation menu"
              >
                ✕
              </button>
            </div>
            <SidebarContent
              navLinks={navLinks}
              user={user}
              onClose={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 shadow-[0_1px_0_rgba(0,0,0,0.06)] px-6 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
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
                <h1 className="text-sm font-bold text-gray-900 leading-tight">{title}</h1>
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
              <Link
                href="/login"
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* Page content — pb-16 on mobile so content clears the bottom nav bar */}
        <main id="main-content" className="flex-1 overflow-y-auto pb-16 md:pb-0" tabIndex={-1}>
          <AnnouncementBanner />
          {children}
        </main>
      </div>

      {/* ── Mobile fixed bottom navigation bar ── */}
      <Suspense fallback={null}>
        <MobileBottomNav navLinks={navLinks} />
      </Suspense>

    </div>
  )
}

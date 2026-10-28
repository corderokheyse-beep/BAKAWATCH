'use client'

import BakawatchLogo from '@/components/ui/BakawatchLogo'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  Menu, X, LogOut, User, ChevronDown, Shield, TreePine, Settings,
} from 'lucide-react'
import NotificationBell from './NotificationBell'
import { getNavLinks, roleLabel } from '@/lib/nav-links'

export default function Navbar() {
  const { user, logout, isStaff } = useAuth()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navLinks = getNavLinks(user?.role)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isActive = (href: string) => {
    const base = href.split('?')[0]
    return pathname === base || pathname.startsWith(base + '/')
  }

  return (
    <nav className="bg-white/95 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 shadow-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-6">

          {/* Logo */}
          <Link href={user ? (
            user.role === 'admin'        ? '/admin' :
            user.role === 'staff'        ? '/staff/dashboard' :
            user.role === 'menro'        ? '/menro/dashboard' :
            user.role === 'field_worker' ? '/field/dashboard' :
            user.role === 'volunteer'    ? '/volunteer/dashboard' :
            user.role === 'denr'         ? '/denr/dashboard' :
            user.role === 'evaluator'    ? '/evaluator/dashboard' :
            '/dashboard'
          ) : '/'} className="flex items-center gap-2.5 shrink-0 group">
            <BakawatchLogo size={32} />
            <div className="hidden sm:block">
              <p className="text-sm font-black text-gray-900 leading-none tracking-wide">BAKAWATCH</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">MENRO Gloria</p>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive(href)
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            {user ? (
              <>
                <NotificationBell />
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className={cn(
                      'flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl transition-all duration-150',
                      userMenuOpen ? 'bg-gray-100' : 'hover:bg-gray-100'
                    )}
                  >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {user.name[0].toUpperCase()}
                    </div>
                    <div className="text-left hidden lg:block">
                      <p className="text-xs font-semibold text-gray-900 leading-none">{user.name.split(' ')[0]}</p>
                      <p className="text-[10px] text-gray-400 leading-none mt-0.5">{roleLabel[user.role] ?? user.role}</p>
                    </div>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform duration-150', userMenuOpen && 'rotate-180')} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-dropdown border border-gray-100 py-1.5 z-50 animate-scale-in">
                      <div className="px-4 py-2.5 border-b border-gray-100 mb-1">
                        <p className="text-xs font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-semibold bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                          {roleLabel[user.role] ?? user.role}
                        </span>
                      </div>
                      <Link href="/profile"
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setUserMenuOpen(false)}>
                        <User className="w-4 h-4 text-gray-400" /> My Profile
                      </Link>
                      {isStaff && (
                        <Link href="/admin"
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={() => setUserMenuOpen(false)}>
                          <Settings className="w-4 h-4 text-gray-400" /> Admin Panel
                        </Link>
                      )}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <LogOut className="w-4 h-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-ghost text-sm px-4">Sign in</Link>
                <Link href="/register" className="btn-primary text-sm px-4 py-2">Get started</Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden ml-auto p-2 rounded-xl hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white/98 backdrop-blur-md px-4 py-3 space-y-0.5 animate-slide-up">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive(href) ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'
              )}>
              <Icon className="w-4 h-4" />{label}
            </Link>
          ))}
          <div className="pt-2 mt-2 border-t border-gray-100">
            {user ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-forest-600 text-white flex items-center justify-center text-xs font-bold">
                    {user.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-400">{roleLabel[user.role] ?? user.role}</p>
                  </div>
                </div>
                <Link href="/profile" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                  <User className="w-4 h-4 text-gray-400" />Profile
                </Link>
                <button onClick={() => { logout(); setMobileOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="w-4 h-4" />Sign out
                </button>
              </div>
            ) : (
              <div className="flex gap-2 px-1">
                <Link href="/login" className="btn-secondary flex-1 text-center text-sm" onClick={() => setMobileOpen(false)}>Sign in</Link>
                <Link href="/register" className="btn-primary flex-1 text-center text-sm" onClick={() => setMobileOpen(false)}>Register</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

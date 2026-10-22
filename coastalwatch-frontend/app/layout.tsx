import type { Metadata } from 'next'
import './globals.css'
import { Suspense } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from 'react-hot-toast'
import ScrollReveal from '@/components/ui/ScrollReveal'
import OfflineManager from '@/components/layout/OfflineManager'
import PWAInstallPrompt from '@/components/layout/PWAInstallPrompt'
import ChunkErrorReloader from '@/components/layout/ChunkErrorReloader'
import RouteProgress from '@/components/layout/RouteProgress'

export const metadata: Metadata = {
  title: 'BAKAWATCH — Mangrove Monitoring & Restoration System',
  description: 'BAKAWATCH: A Cross-Platform Mangrove Monitoring and Restoration Management System for MENRO Gloria, Oriental Mindoro, Philippines.',
  icons: {
    icon: '/images/bakawatch-logo.png',
    apple: '/images/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'BAKAWATCH', statusBarStyle: 'default' },
}

export const viewport = {
  themeColor: '#16a34a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Skip to main content — hidden until focused, for keyboard/screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <ChunkErrorReloader />
        <Suspense fallback={null}><RouteProgress /></Suspense>
        <AuthProvider>
          {children}
          <OfflineManager />
          <PWAInstallPrompt />
          <ScrollReveal />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { borderRadius: '10px', fontSize: '14px' },
              success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}

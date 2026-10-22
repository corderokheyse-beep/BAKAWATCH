/**
 * Root navigation fallback. Next.js shows this INSTANTLY when a route
 * transition starts (before the target page's component or data is ready), so
 * clicking a link gives immediate feedback instead of a blank/frozen screen.
 *
 * It's a neutral content skeleton — intentionally lightweight so it appears
 * with zero delay. The real page (with its own SidebarLayout) replaces it as
 * soon as it's ready.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f5f7f5] p-6">
      <div className="max-w-7xl mx-auto animate-pulse">
        {/* Header */}
        <div className="h-7 w-56 rounded-lg bg-gray-200 mb-2" />
        <div className="h-4 w-80 rounded bg-gray-100 mb-6" />

        {/* Summary cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="h-7 w-16 rounded bg-gray-200 mb-2" />
              <div className="h-3 w-24 rounded bg-gray-100" />
            </div>
          ))}
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm h-80" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-24" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

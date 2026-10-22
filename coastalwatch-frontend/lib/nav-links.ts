import {
  LayoutDashboard, Map, CalendarDays, Users, Leaf, FileText,
  BarChart2, Activity, TreePine,
  AlertTriangle, Database, BookOpen, Sprout, Settings,
} from 'lucide-react'

export interface NavLink {
  href: string
  label: string
  icon: React.ElementType
}

export const roleLabel: Record<string, string> = {
  admin:        'Super Admin',
  staff:        'MENRO Admin',
  menro:        'MENRO Admin',
  field_worker: 'Bantay Bakawan',
  volunteer:    'Participant',
  denr:         'DENR Evaluator',
  evaluator:    'Research Evaluator',
  user:         'Community Member',
  public:       'Community Member',
}

export function getNavLinks(role?: string): NavLink[] {
  switch (role) {
    case 'admin':
      // Super Admin navigation — exactly five items, in this order.
      return [
        { href: '/admin',          label: 'Dashboard',          icon: LayoutDashboard },
        { href: '/admin/users',    label: 'User Management',    icon: Users },
        { href: '/admin/backup',   label: 'Backup & Recovery',  icon: Database },
        { href: '/admin/logs',     label: 'System Logs',        icon: Activity },
        { href: '/admin/settings', label: 'System Settings',    icon: Settings },
      ]

    case 'staff':
      return [
        { href: '/staff/dashboard',  label: 'Dashboard',      icon: LayoutDashboard },
        { href: '/map',              label: 'Map',        icon: Map },
        { href: '/plantation/new',   label: 'New Plantation',  icon: TreePine },
        { href: '/monitoring/new',   label: 'New Monitoring',  icon: Activity },
        { href: '/events',           label: 'Events',          icon: CalendarDays },
        { href: '/sites',            label: 'Sites',           icon: Leaf },
        { href: '/seedlings',        label: 'Inventory',  icon: Sprout },
        { href: '/reports/mangrove', label: 'Reports',         icon: FileText },
        { href: '/articles/manage',  label: 'Articles',        icon: BookOpen },
      ]

    case 'menro':
      return [
        { href: '/menro/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
        { href: '/map',              label: 'Map',         icon: Map },
        { href: '/sites',            label: 'Sites',            icon: Leaf },
        { href: '/events',           label: 'Events',           icon: CalendarDays },
        { href: '/seedlings',        label: 'Inventory',   icon: Sprout },
        { href: '/reports/mangrove', label: 'Reports',          icon: FileText },
        { href: '/analytics',        label: 'Analytics',        icon: BarChart2 },
        { href: '/articles/manage',  label: 'Articles',         icon: BookOpen },
      ]

    case 'field_worker':
      return [
        { href: '/field/dashboard', label: 'Dashboard',      icon: LayoutDashboard },
        { href: '/monitoring/new',  label: 'Monitor Growth', icon: Activity },
        { href: '/reports/new',     label: 'Report Threat',  icon: AlertTriangle },
        { href: '/events',          label: 'Events',         icon: CalendarDays },
        { href: '/reports',         label: 'My Reports',     icon: FileText },
        { href: '/analytics',       label: 'Analytics',      icon: BarChart2 },
        { href: '/articles',        label: 'Tips & Guides',  icon: BookOpen },
      ]

    case 'volunteer':
      return [
        { href: '/volunteer/dashboard', label: 'Dashboard',       icon: LayoutDashboard },
        { href: '/events',              label: 'Planting Events',  icon: CalendarDays },
        { href: '/volunteer/requests',  label: 'My Requests',      icon: FileText },
        { href: '/volunteer/joined-events', label: 'Joined Events', icon: CalendarDays },
        { href: '/analytics',           label: 'Analytics',        icon: BarChart2 },
        { href: '/articles',            label: 'Tips & Guides',    icon: BookOpen },
      ]

    case 'denr':
      // Read-only authorized review: map, sites, analytics, reports, articles.
      return [
        { href: '/denr/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
        { href: '/map',            label: 'Map',   icon: Map },
        { href: '/sites',          label: 'Sites',      icon: Leaf },
        { href: '/analytics',      label: 'Analytics',  icon: BarChart2 },
        { href: '/articles',       label: 'Knowledge',  icon: BookOpen },
      ]

    case 'evaluator':
      // Scientific review: analytics, sites, and species classification review.
      return [
        { href: '/evaluator/dashboard', label: 'Dashboard',    icon: LayoutDashboard },
        { href: '/map',                 label: 'Map',     icon: Map },
        { href: '/sites',               label: 'Sites',        icon: Leaf },
        { href: '/analytics',           label: 'Analytics',    icon: BarChart2 },
        { href: '/reports',             label: 'Observations', icon: FileText },
        { href: '/articles',            label: 'Knowledge',    icon: BookOpen },
      ]

    default:
      return [
        { href: '/map',             label: 'Live Map',      icon: Map },
        { href: '/sites',           label: 'Sites',         icon: Leaf },
        { href: '/events',          label: 'Events',        icon: CalendarDays },
        { href: '/events/request',  label: 'Request Event', icon: TreePine },
        { href: '/articles',        label: 'Tips & Guides', icon: BookOpen },
        { href: '/dashboard',       label: 'Dashboard',     icon: LayoutDashboard },
      ]
  }
}

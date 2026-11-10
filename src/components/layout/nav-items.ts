import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Languages,
  LayoutDashboard,
  Music,
  RefreshCcw,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { to: '/schedule', label: 'Cronograma', icon: CalendarDays },
  { to: '/lessons', label: 'Aulas', icon: BookOpen },
  { to: '/vocabulary', label: 'Vocabulário', icon: Languages },
  { to: '/reviews', label: 'Revisões', icon: RefreshCcw },
  { to: '/music', label: 'Música', icon: Music },
  { to: '/progress', label: 'Progresso', icon: BarChart3 },
]

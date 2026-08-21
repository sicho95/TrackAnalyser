import { Activity, BarChart3, Home, Settings, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export interface AppShellMessages {
  home: string
  sessions: string
  compare: string
  profiles: string
  settings: string
  aria: string
}

export function AppShell({ children, messages }: { children: ReactNode; messages: AppShellMessages }): ReactNode {
  const items = [
    { to: '/', label: messages.home, icon: Home },
    { to: '/sessions', label: messages.sessions, icon: Activity },
    { to: '/compare', label: messages.compare, icon: BarChart3 },
    { to: '/profiles', label: messages.profiles, icon: UsersRound },
    { to: '/settings', label: messages.settings, icon: Settings },
  ]
  return (
    <div className="app-shell">
      <main>{children}</main>
      <nav className="tab-bar" aria-label={messages.aria}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon aria-hidden="true" size={21} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }): ReactNode {
  return (
    <header className="screen-header">
      <div>{eyebrow === undefined ? null : <p>{eyebrow}</p>}<h1>{title}</h1></div>
      {action}
    </header>
  )
}

export function StatusPill({ state, children }: { state: 'good' | 'warning' | 'neutral' | 'danger'; children: ReactNode }): ReactNode {
  return <span className={`status-pill ${state}`}>{children}</span>
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }): ReactNode {
  return <section className="empty-state">{icon}<h2>{title}</h2><p>{description}</p>{action}</section>
}

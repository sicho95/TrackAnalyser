import { AppShell } from '@track-analyser/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppData } from './context'
import { ComparePage } from './pages/ComparePage'
import { HomePage } from './pages/HomePage'
import { ProfilesPage } from './pages/ProfilesPage'
import { RecordPage } from './pages/RecordPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import type { UpdateController } from './update'

function UpdateGuard(): ReactNode {
  const { activeSession, settings, updateSettings } = useAppData()
  const controller = useRef<UpdateController | undefined>(undefined)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const listener = (event: Event): void => {
      controller.current = (event as CustomEvent<UpdateController>).detail
      setReady(true)
      if (activeSession !== undefined) void updateSettings({ ...settings, pendingUpdate: true })
    }
    window.addEventListener('track-analyser:update-ready', listener)
    return () => window.removeEventListener('track-analyser:update-ready', listener)
  }, [activeSession, settings, updateSettings])
  useEffect(() => {
    if (activeSession === undefined && settings.pendingUpdate && controller.current !== undefined) {
      void updateSettings({ ...settings, pendingUpdate: false }).then(() => controller.current?.apply())
    }
  }, [activeSession, settings, updateSettings])
  if (!ready || activeSession !== undefined) return null
  return <button className="update-banner" type="button" onClick={() => void controller.current?.apply()}><RefreshCw size={18} />Nouvelle version prête · Mettre à jour</button>
}

export function App(): ReactNode {
  const { ready } = useAppData()
  if (!ready) return <div className="loading-screen"><div className="loading-mark" />Préparation du stockage local…</div>
  return <><UpdateGuard /><Routes><Route element={<AppShell><RoutesOutlet /></AppShell>} path="/*" /></Routes></>
}

function RoutesOutlet(): ReactNode {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/record/:id" element={<RecordPage />} />
    <Route path="/sessions" element={<SessionsPage />} />
    <Route path="/sessions/:id" element={<SessionDetailPage />} />
    <Route path="/compare" element={<ComparePage />} />
    <Route path="/profiles" element={<ProfilesPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

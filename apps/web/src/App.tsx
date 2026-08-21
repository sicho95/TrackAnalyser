import { AppShell } from '@track-analyser/ui'
import { RefreshCw } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppData } from './context'
import { messages } from './i18n'
import { canActivateUpdate } from './update-policy'
import type { UpdateController } from './update'

const HomePage = lazy(async () => ({ default: (await import('./pages/HomePage')).HomePage }))
const RecordPage = lazy(async () => ({ default: (await import('./pages/RecordPage')).RecordPage }))
const SessionsPage = lazy(async () => ({ default: (await import('./pages/SessionsPage')).SessionsPage }))
const SessionDetailPage = lazy(async () => ({ default: (await import('./pages/SessionDetailPage')).SessionDetailPage }))
const ComparePage = lazy(async () => ({ default: (await import('./pages/ComparePage')).ComparePage }))
const ProfilesPage = lazy(async () => ({ default: (await import('./pages/ProfilesPage')).ProfilesPage }))
const SettingsPage = lazy(async () => ({ default: (await import('./pages/SettingsPage')).SettingsPage }))

function UpdateGuard(): ReactNode {
  const { activeSession, settings, updateSettings } = useAppData()
  const controller = useRef<UpdateController | undefined>(undefined)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const listener = (event: Event): void => {
      controller.current = (event as CustomEvent<UpdateController>).detail
      setReady(true)
      if (!canActivateUpdate(activeSession?.id)) void updateSettings({ ...settings, pendingUpdate: true })
    }
    window.addEventListener('track-analyser:update-ready', listener)
    return () => window.removeEventListener('track-analyser:update-ready', listener)
  }, [activeSession, settings, updateSettings])
  useEffect(() => {
    if (canActivateUpdate(activeSession?.id) && settings.pendingUpdate && controller.current !== undefined) {
      void updateSettings({ ...settings, pendingUpdate: false }).then(() => controller.current?.apply())
    }
  }, [activeSession, settings, updateSettings])
  if (!ready || activeSession !== undefined) return null
  return <button className="update-banner" type="button" onClick={() => void controller.current?.apply()}><RefreshCw size={18} />{messages.shell.updateReady}</button>
}

export function App(): ReactNode {
  const { ready } = useAppData()
  if (!ready) return <div className="loading-screen"><div className="loading-mark" />{messages.shell.preparing}</div>
  return <><UpdateGuard /><Routes><Route element={<AppShell messages={messages.navigation}><RoutesOutlet /></AppShell>} path="/*" /></Routes></>
}

function RoutesOutlet(): ReactNode {
  return <Suspense fallback={<div className="loading-screen"><div className="loading-mark" />{messages.shell.loading}</div>}><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/record/:id" element={<RecordPage />} />
    <Route path="/sessions" element={<SessionsPage />} />
    <Route path="/sessions/:id" element={<SessionDetailPage />} />
    <Route path="/compare" element={<ComparePage />} />
    <Route path="/profiles" element={<ProfilesPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>
}

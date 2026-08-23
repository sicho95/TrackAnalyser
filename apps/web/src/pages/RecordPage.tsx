import type { MetricChannel } from '@track-analyser/domain'
import { Gauge, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { CircleStop, LocateFixed, SunMedium } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context'
import { messages } from '../i18n'
import { toDisplaySeries } from '../measurements'

const LIVE_CHANNELS: Readonly<Record<string, MetricChannel[]>> = {
  CAR: ['speed', 'longitudinalAcceleration', 'lateralAcceleration'],
  MOTORCYCLE: ['speed', 'roll', 'longitudinalAcceleration'],
  PARAGLIDING: ['altitude', 'verticalSpeed', 'speed'],
  TRAIL_RUNNING: ['speed', 'verticalSpeed', 'altitude'],
  RUNNING: ['speed', 'heartRate', 'cadence'],
  BOAT: ['speed', 'roll', 'pitch'],
}

const METRIC_LABELS: Partial<Record<MetricChannel, string>> = messages.metric

export function RecordPage(): ReactNode {
  const { id } = useParams()
  const { activeSession, liveSamples, acquisitionStatus, acquisitionErrors, wakeLockState, stopSession } = useAppData()
  const navigate = useNavigate()
  const [stopping, setStopping] = useState(false)
  const elapsed = activeSession === undefined ? 0 : Math.max(0, (Date.now() - Date.parse(activeSession.startTime)) / 1000)
  const channels = LIVE_CHANNELS[activeSession?.activityType ?? ''] ?? ['speed', 'acceleration', 'altitude']
  const grouped = useMemo(() => Map.groupBy(liveSamples, (sample) => sample.channel), [liveSamples])
  const motionObserved = liveSamples.some((sample) => sample.sourceId.endsWith(':motion'))
  const locationObserved = liveSamples.some((sample) => sample.sourceId.endsWith(':geolocation'))
  const motionError = acquisitionErrors.find((error) => error.toLocaleLowerCase('fr-FR').includes('mouvement') || error.includes('DeviceMotion'))

  useEffect(() => {
    document.documentElement.dataset.recording = 'true'
    return () => { delete document.documentElement.dataset.recording }
  }, [])

  if (activeSession === undefined || activeSession.id !== id) return <div className="screen"><p>{messages.record.missing}</p></div>

  const stop = async (): Promise<void> => {
    setStopping(true)
    const session = await stopSession()
    void navigate(`/sessions/${session.id}`)
  }

  return (
    <div className="record-screen">
      <header className="record-header"><div><span className="record-dot" />{acquisitionStatus}</div><strong>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}</strong><div className="record-header-icons"><LocateFixed size={19} aria-hidden="true" /><span className={wakeLockState === 'ACTIVE' || wakeLockState === 'COMPATIBILITY' ? 'wake-lock-active' : 'wake-lock-inactive'} title={messages.record.wakeLock[wakeLockState]} aria-label={messages.record.wakeLock[wakeLockState]}><SunMedium size={19} aria-hidden="true" /></span></div></header>
      <div className="live-grid">
        {channels.map((channel) => {
          const values = grouped.get(channel)?.flatMap((sample) => typeof sample.value === 'number' ? [sample.value] : []) ?? []
          const rawUnit = grouped.get(channel)?.[0]?.unit ?? ''
          const displayed = toDisplaySeries(channel, values, rawUnit)
          const value = displayed.values.at(-1)
          const spec = visualizationSpecFor(channel)
          const label = METRIC_LABELS[channel] ?? channel
          const requiresMotion = channel !== 'speed' && channel !== 'altitude' && channel !== 'verticalSpeed' && channel !== 'heartRate' && channel !== 'cadence'
          const waiting = requiresMotion && motionError !== undefined ? messages.record.motionUnavailable : messages.record.waiting
          return <section className="live-card" key={channel}><p>{label}</p><div className="live-card-value">{value === undefined ? <div className="live-unavailable">{waiting}</div> : spec.preferredLiveView === 'DIVERGING_GAUGE' ? <Gauge value={value} minimum={spec.scalePolicy.minimum ?? -10} maximum={spec.scalePolicy.maximum ?? 10} label={label} unit={displayed.unit} signed /> : <div className="live-reading"><strong>{value.toFixed(1)} <small>{displayed.unit}</small></strong><Sparkline values={displayed.values} label={`${messages.record.history} ${label}`} scalePolicy={spec.scalePolicy} /></div>}</div></section>
        })}
      </div>
      <div className="source-diagnostics" aria-label={messages.record.sourceDiagnostics}><span className={locationObserved ? 'source-ok' : ''}>GPS · {locationObserved ? messages.record.observed : messages.record.waiting}</span><span className={motionObserved ? 'source-ok' : motionError === undefined ? '' : 'source-error'}>Mouvement · {motionObserved ? messages.record.observed : motionError === undefined ? messages.record.authorizedWaiting : messages.record.refused}</span><span className={wakeLockState === 'ACTIVE' || wakeLockState === 'COMPATIBILITY' ? 'source-ok source-wide' : 'source-error source-wide'}>{messages.record.wakeLock[wakeLockState]}</span></div>
      <div className="record-quality"><span>{liveSamples.length} {messages.record.recentSamples}</span><span>{messages.record.progressiveWrite}</span></div>
      <button className="stop-button" type="button" disabled={stopping} onClick={() => void stop()}><CircleStop size={24} aria-hidden="true" />{stopping ? messages.record.finalizing : messages.record.stop}</button>
    </div>
  )
}

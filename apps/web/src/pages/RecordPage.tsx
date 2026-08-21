import type { MetricChannel } from '@track-analyser/domain'
import { Gauge, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { CircleStop, LocateFixed } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context'
import { messages } from '../i18n'

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
  const { activeSession, liveSamples, acquisitionStatus, stopSession } = useAppData()
  const navigate = useNavigate()
  const [stopping, setStopping] = useState(false)
  const elapsed = activeSession === undefined ? 0 : Math.max(0, (Date.now() - Date.parse(activeSession.startTime)) / 1000)
  const channels = LIVE_CHANNELS[activeSession?.activityType ?? ''] ?? ['speed', 'acceleration', 'altitude']
  const grouped = useMemo(() => Map.groupBy(liveSamples, (sample) => sample.channel), [liveSamples])

  if (activeSession === undefined || activeSession.id !== id) return <div className="screen"><p>{messages.record.missing}</p></div>

  const stop = async (): Promise<void> => {
    setStopping(true)
    const session = await stopSession()
    void navigate(`/sessions/${session.id}`)
  }

  return (
    <div className="record-screen">
      <header className="record-header"><div><span className="record-dot" />{acquisitionStatus}</div><strong>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}</strong><LocateFixed size={20} aria-hidden="true" /></header>
      <div className="live-grid">
        {channels.map((channel) => {
          const values = grouped.get(channel)?.flatMap((sample) => typeof sample.value === 'number' ? [sample.value] : []) ?? []
          const value = values.at(-1)
          const spec = visualizationSpecFor(channel)
          const label = METRIC_LABELS[channel] ?? channel
          return <section className="live-card" key={channel}><p>{label}</p>{value === undefined ? <div className="live-unavailable">{messages.record.waiting}</div> : spec.preferredLiveView === 'DIVERGING_GAUGE' ? <Gauge value={value} minimum={spec.scalePolicy.minimum ?? -10} maximum={spec.scalePolicy.maximum ?? 10} label={label} unit={grouped.get(channel)?.[0]?.unit ?? ''} signed /> : <><strong>{value.toFixed(1)} <small>{grouped.get(channel)?.[0]?.unit}</small></strong><Sparkline values={values} label={`${messages.record.history} ${label}`} scalePolicy={spec.scalePolicy} /></>}</section>
        })}
      </div>
      <div className="record-quality"><span>{liveSamples.length} {messages.record.recentSamples}</span><span>{messages.record.progressiveWrite}</span></div>
      <button className="stop-button" type="button" disabled={stopping} onClick={() => void stop()}><CircleStop size={24} aria-hidden="true" />{stopping ? messages.record.finalizing : messages.record.stop}</button>
    </div>
  )
}

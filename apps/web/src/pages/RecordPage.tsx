import type { MetricChannel } from '@track-analyser/domain'
import { Gauge, Sparkline, visualizationSpecFor } from '@track-analyser/visualization'
import { CircleStop, LocateFixed } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context'

const LIVE_CHANNELS: Readonly<Record<string, MetricChannel[]>> = {
  CAR: ['speed', 'longitudinalAcceleration', 'lateralAcceleration'],
  MOTORCYCLE: ['speed', 'roll', 'longitudinalAcceleration'],
  PARAGLIDING: ['altitude', 'verticalSpeed', 'speed'],
  TRAIL_RUNNING: ['speed', 'verticalSpeed', 'altitude'],
  RUNNING: ['speed', 'heartRate', 'cadence'],
  BOAT: ['speed', 'roll', 'pitch'],
}

const LABELS: Partial<Record<MetricChannel, string>> = {
  speed: 'Vitesse', altitude: 'Altitude', verticalSpeed: 'Vario', heartRate: 'Cardio', cadence: 'Cadence',
  longitudinalAcceleration: 'Accélération', lateralAcceleration: 'Latéral', roll: 'Inclinaison', pitch: 'Tangage',
}

export function RecordPage(): ReactNode {
  const { id } = useParams()
  const { activeSession, liveSamples, acquisitionStatus, stopSession } = useAppData()
  const navigate = useNavigate()
  const [stopping, setStopping] = useState(false)
  const elapsed = activeSession === undefined ? 0 : Math.max(0, (Date.now() - Date.parse(activeSession.startTime)) / 1000)
  const channels = LIVE_CHANNELS[activeSession?.activityType ?? ''] ?? ['speed', 'acceleration', 'altitude']
  const grouped = useMemo(() => Map.groupBy(liveSamples, (sample) => sample.channel), [liveSamples])

  if (activeSession === undefined || activeSession.id !== id) return <div className="screen"><p>Aucune session active. Une session interrompue peut être récupérée depuis Sessions.</p></div>

  const stop = async (): Promise<void> => {
    setStopping(true)
    const session = await stopSession()
    navigate(`/sessions/${session.id}`)
  }

  return (
    <div className="record-screen">
      <header className="record-header"><div><span className="record-dot" />{acquisitionStatus}</div><strong>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{Math.floor(elapsed % 60).toString().padStart(2, '0')}</strong><LocateFixed size={20} aria-hidden="true" /></header>
      <div className="live-grid">
        {channels.map((channel) => {
          const values = grouped.get(channel)?.flatMap((sample) => typeof sample.value === 'number' ? [sample.value] : []) ?? []
          const value = values.at(-1)
          const spec = visualizationSpecFor(channel)
          return <section className="live-card" key={channel}><p>{LABELS[channel] ?? channel}</p>{value === undefined ? <div className="live-unavailable">En attente</div> : spec.preferredLiveView === 'DIVERGING_GAUGE' ? <Gauge value={value} minimum={spec.scalePolicy.minimum ?? -10} maximum={spec.scalePolicy.maximum ?? 10} label={LABELS[channel] ?? channel} unit={grouped.get(channel)?.[0]?.unit ?? ''} signed /> : <><strong>{value.toFixed(1)} <small>{grouped.get(channel)?.[0]?.unit}</small></strong><Sparkline values={values} label={`Historique ${LABELS[channel] ?? channel}`} scalePolicy={spec.scalePolicy} /></>}</section>
        })}
      </div>
      <div className="record-quality"><span>{liveSamples.length} échantillons récents</span><span>Écriture progressive active</span></div>
      <button className="stop-button" type="button" disabled={stopping} onClick={() => void stop()}><CircleStop size={24} aria-hidden="true" />{stopping ? 'Finalisation et analyse…' : 'Arrêter et analyser'}</button>
    </div>
  )
}


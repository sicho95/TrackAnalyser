import { ACTIVITY_TYPES, type ActivityType } from '@track-analyser/domain'
import { estimateRecordingStorage, type RecordingStorageReadiness } from '@track-analyser/storage'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { HardDrive, Navigation, Play, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context'
import { messages } from '../i18n'

export function HomePage(): ReactNode {
  const { participants, equipment, activeSession, settings, prepareSessionStart, commitPreparedSession, cancelPreparedSession, ready } = useAppData()
  const [participantId, setParticipantId] = useState('')
  const [activityType, setActivityType] = useState<ActivityType>('GENERIC')
  const [equipmentId, setEquipmentId] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'IDLE' | 'AUTHORIZING' | 'COUNTDOWN' | 'STARTING'>('IDLE')
  const [countdown, setCountdown] = useState(5)
  const [motionAvailable, setMotionAvailable] = useState(true)
  const [storageReadiness, setStorageReadiness] = useState<RecordingStorageReadiness>()
  const defaultsApplied = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    if (defaultsApplied.current || !ready || participants.length === 0) return
    const defaults = settings.lastSessionDefaults
    const selectedParticipant = defaults !== undefined && participants.some((participant) => participant.id === defaults.participantId && !participant.archived)
      ? defaults.participantId
      : participants.find((participant) => !participant.archived)?.id ?? ''
    setParticipantId(selectedParticipant)
    if (defaults !== undefined) {
      setActivityType(defaults.activityType)
      setEquipmentId(defaults.equipmentId !== undefined && equipment.some((item) => item.id === defaults.equipmentId) ? defaults.equipmentId : '')
    }
    defaultsApplied.current = true
  }, [equipment, participants, ready, settings.lastSessionDefaults])

  useEffect(() => {
    void estimateRecordingStorage(10).then(setStorageReadiness)
  }, [activeSession?.id])

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearInterval(timer.current)
    void cancelPreparedSession()
  }, [cancelPreparedSession])

  const launchAfterCountdown = async (): Promise<void> => {
    if (timer.current !== undefined) window.clearInterval(timer.current)
    timer.current = undefined
    setPhase('STARTING')
    try {
      const session = await commitPreparedSession()
      void navigate(`/record/${session.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      await cancelPreparedSession()
      setPhase('IDLE')
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    setPhase('AUTHORIZING')
    try {
      const preparation = await prepareSessionStart(participantId, activityType, equipmentId || undefined)
      setMotionAvailable(preparation.motionAvailable)
      setCountdown(5)
      setPhase('COUNTDOWN')
      const deadline = Date.now() + 5_000
      timer.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))
        setCountdown(remaining)
        if (remaining === 0) void launchAfterCountdown()
      }, 100)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('IDLE')
    }
  }

  const cancelCountdown = async (): Promise<void> => {
    if (timer.current !== undefined) window.clearInterval(timer.current)
    timer.current = undefined
    await cancelPreparedSession()
    setCountdown(5)
    setPhase('IDLE')
  }

  return (
    <div className="screen home-screen">
      <ScreenHeader eyebrow={messages.home.eyebrow} title={messages.home.title} action={<StatusPill state={navigator.onLine ? 'good' : 'neutral'}>{navigator.onLine ? messages.home.online : messages.home.offline}</StatusPill>} />
      <section className="hero-card">
        <div className="hero-orbit"><Navigation size={34} aria-hidden="true" /></div>
        <div><p className="kicker">{messages.home.kicker}</p><h2>{messages.home.heroTitle}</h2><p>{messages.home.heroBody}</p></div>
      </section>

      {activeSession === undefined ? (
        <form className="start-card" onSubmit={(event) => { void submit(event) }}>
          <label>{messages.home.participant}<span>{messages.home.required}</span><select value={participantId} onChange={(event) => setParticipantId(event.target.value)} required>
            <option value="">{messages.home.chooseParticipant}</option>
            {participants.filter((participant) => !participant.archived).map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
          </select></label>
          <label>{messages.home.activity}<select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{messages.activity[type]}</option>)}
          </select></label>
          <label>{messages.home.equipment}<span>{messages.common.optional}</span><select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
            <option value="">{messages.home.noEquipment}</option>
            {equipment.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {participants.length === 0 ? <p className="form-notice">{messages.home.participantNotice}</p> : null}
          {storageReadiness === undefined ? null : <p className={`form-notice storage-readiness ${storageReadiness.status.toLowerCase()}`}><HardDrive size={17} aria-hidden="true" />{storageReadinessMessage(storageReadiness)}</p>}
          {error.length === 0 ? null : <p className="error-message">{error}</p>}
          <button className="primary-button" type="submit" disabled={!ready || participantId.length === 0 || phase !== 'IDLE'}><Play size={20} aria-hidden="true" />{phase === 'AUTHORIZING' ? messages.home.authorizing : messages.home.start}</button>
        </form>
      ) : (
        <button className="primary-button" type="button" onClick={() => { void navigate(`/record/${activeSession.id}`) }}>{messages.home.resume}</button>
      )}

      <section className="safety-card"><ShieldCheck size={24} aria-hidden="true" /><div><strong>{messages.home.safetyTitle}</strong><p>{messages.home.safetyBody}</p></div></section>
      {phase === 'COUNTDOWN' || phase === 'STARTING' ? <div className="start-countdown" role="dialog" aria-modal="true" aria-labelledby="start-countdown-title">
        <div className="countdown-card">
          <Smartphone size={34} aria-hidden="true" />
          <p className="countdown-value" aria-live="polite">{phase === 'STARTING' ? '0' : countdown}</p>
          <h2 id="start-countdown-title">{phase === 'STARTING' ? messages.home.calibrating : messages.home.fixPhone}</h2>
          <p>{motionAvailable ? messages.home.countdownBody : messages.home.countdownGpsOnly}</p>
          <button className="secondary-button" type="button" disabled={phase === 'STARTING'} onClick={() => void cancelCountdown()}>{messages.common.cancel}</button>
        </div>
      </div> : null}
    </div>
  )
}

function storageReadinessMessage(readiness: RecordingStorageReadiness): string {
  const raw = formatGigabytes(readiness.estimatedRawBytes)
  if (readiness.status === 'UNKNOWN' || readiness.availableBytes === undefined) return `${messages.home.storageUnknown} RAW 10 h estimé : ${raw}.`
  const available = formatGigabytes(readiness.availableBytes)
  return readiness.status === 'READY'
    ? `${messages.home.storageReady} ${available} disponibles · estimation RAW 10 h de référence ≤ ${raw}.`
    : `${messages.home.storageLow} ${available} disponibles ; environ ${formatGigabytes(readiness.requiredAvailableBytes)} requis temporairement pour 10 h.`
}

function formatGigabytes(bytes: number): string {
  return `${(bytes / (1024 ** 3)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
}

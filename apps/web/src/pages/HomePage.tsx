import { ACTIVITY_TYPES, type ActivityType } from '@track-analyser/domain'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Navigation, Play, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context'
import { messages } from '../i18n'

export function HomePage(): ReactNode {
  const { participants, equipment, activeSession, startSession, ready } = useAppData()
  const [participantId, setParticipantId] = useState(participants[0]?.id ?? '')
  const [activityType, setActivityType] = useState<ActivityType>('GENERIC')
  const [equipmentId, setEquipmentId] = useState('')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    setStarting(true)
    try {
      const session = await startSession(participantId, activityType, equipmentId || undefined)
      void navigate(`/record/${session.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStarting(false)
    }
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
          {error.length === 0 ? null : <p className="error-message">{error}</p>}
          <button className="primary-button" type="submit" disabled={!ready || participantId.length === 0 || starting}><Play size={20} aria-hidden="true" />{starting ? messages.home.authorizing : messages.home.start}</button>
        </form>
      ) : (
        <button className="primary-button" type="button" onClick={() => { void navigate(`/record/${activeSession.id}`) }}>{messages.home.resume}</button>
      )}

      <section className="safety-card"><ShieldCheck size={24} aria-hidden="true" /><div><strong>{messages.home.safetyTitle}</strong><p>{messages.home.safetyBody}</p></div></section>
    </div>
  )
}

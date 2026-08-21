import { ACTIVITY_TYPES, type ActivityType } from '@track-analyser/domain'
import { ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Navigation, Play, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context'

const ACTIVITY_LABELS: Readonly<Record<ActivityType, string>> = {
  GENERIC: 'Générique', CAR: 'Voiture', MOTORCYCLE: 'Moto', BIKE: 'Vélo', BOAT: 'Bateau', AIRCRAFT: 'Avion',
  PARAGLIDING: 'Parapente', HIKING: 'Randonnée', TRAIL_RUNNING: 'Trail', RUNNING: 'Course à pied',
}

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
      navigate(`/record/${session.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="screen home-screen">
      <ScreenHeader eyebrow="Acquisition locale" title="Prêt à enregistrer" action={<StatusPill state={navigator.onLine ? 'good' : 'neutral'}>{navigator.onLine ? 'En ligne' : 'Hors ligne'}</StatusPill>} />
      <section className="hero-card">
        <div className="hero-orbit"><Navigation size={34} aria-hidden="true" /></div>
        <div><p className="kicker">Smartphone autonome</p><h2>Chaque mouvement, avec sa source.</h2><p>GPS et mouvement sont enregistrés progressivement sur cet appareil. Aucun compte ni cloud n’est requis.</p></div>
      </section>

      {activeSession === undefined ? (
        <form className="start-card" onSubmit={(event) => void submit(event)}>
          <label>Participant<span>Obligatoire</span><select value={participantId} onChange={(event) => setParticipantId(event.target.value)} required>
            <option value="">Choisir un participant</option>
            {participants.filter((participant) => !participant.archived).map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
          </select></label>
          <label>Activité<select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{ACTIVITY_LABELS[type]}</option>)}
          </select></label>
          <label>Équipement<span>Optionnel</span><select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
            <option value="">Sans équipement</option>
            {equipment.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {participants.length === 0 ? <p className="form-notice">Créer d’abord un participant dans Profils. Cette étape empêche toute contamination entre personnes.</p> : null}
          {error.length === 0 ? null : <p className="error-message">{error}</p>}
          <button className="primary-button" type="submit" disabled={!ready || participantId.length === 0 || starting}><Play size={20} aria-hidden="true" />{starting ? 'Autorisation des capteurs…' : 'Démarrer la session'}</button>
        </form>
      ) : (
        <button className="primary-button" type="button" onClick={() => navigate(`/record/${activeSession.id}`)}>Revenir à la session active</button>
      )}

      <section className="safety-card"><ShieldCheck size={24} aria-hidden="true" /><div><strong>Priorité à la sécurité</strong><p>Démarrer avant de conduire ou piloter. Les détails d’analyse sont disponibles après l’arrêt.</p></div></section>
    </div>
  )
}


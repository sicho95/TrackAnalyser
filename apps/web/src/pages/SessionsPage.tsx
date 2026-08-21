import { sessionsEligibleForImport, type ImportResult } from '@track-analyser/domain'
import { parseImportedFile } from '@track-analyser/importers'
import { EmptyState, ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Activity, FileUp, MapPin, Plus } from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../context'

export function SessionsPage(): ReactNode {
  const { sessions, participants, importData } = useAppData()
  const [candidate, setCandidate] = useState<ImportResult>()
  const [participantId, setParticipantId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [message, setMessage] = useState('')
  const eligible = useMemo(() => participantId.length === 0 ? [] : sessionsEligibleForImport(participantId, sessions), [participantId, sessions])

  const selectFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    try {
      setCandidate(parseImportedFile(new Uint8Array(await file.arrayBuffer()), file.name))
      setParticipantId('')
      setSessionId('')
      setMessage('Fichier identifié. Choisir maintenant le participant cible.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmImport = async (): Promise<void> => {
    if (candidate === undefined || participantId.length === 0) return
    const session = await importData(candidate, participantId, sessionId || undefined)
    setMessage(`Import terminé dans la session ${session.title ?? session.id}. RAW conservé.`)
    setCandidate(undefined)
  }

  return (
    <div className="screen">
      <ScreenHeader eyebrow={`${sessions.length} session${sessions.length > 1 ? 's' : ''}`} title="Sessions" action={<label className="icon-button" aria-label="Importer un fichier"><FileUp size={21} /><input type="file" accept=".fit,.gpx,.tcx,.json,.xml,.tatrip" onChange={(event) => void selectFile(event)} hidden /></label>} />
      {candidate === undefined ? null : <section className="import-panel"><div><StatusPill state="good">{candidate.identity.format}</StatusPill><h2>{candidate.identity.fileName}</h2><p>{candidate.samples.length} mesures reconnues · {candidate.opaqueRecords.length} champs bruts/opaques conservés</p></div><label>1. Participant obligatoire<select value={participantId} onChange={(event) => { setParticipantId(event.target.value); setSessionId('') }}><option value="">Choisir</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>{participantId.length === 0 ? null : <label>2. Session de ce participant<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Créer une nouvelle session</option>{eligible.map((session) => <option key={session.id} value={session.id}>{new Date(session.startTime).toLocaleString('fr-FR')} · {session.activityType}</option>)}</select></label>}<p className="form-notice">Les sessions similaires d’autres participants ne sont jamais proposées pour fusion.</p><button className="primary-button" type="button" disabled={participantId.length === 0} onClick={() => void confirmImport()}><Plus size={19} />Importer et analyser</button></section>}
      {message.length === 0 ? null : <p className="inline-message">{message}</p>}
      {sessions.length === 0 ? <EmptyState icon={<Activity size={34} />} title="Aucune session" description="Enregistrer avec ce smartphone ou importer un fichier Garmin, GPX, TCX ou Apple." /> : <div className="session-list">{sessions.map((session) => { const participant = participants.find((item) => item.id === session.participantId); return <Link to={`/sessions/${session.id}`} className="session-card" key={session.id}><div className="session-icon"><MapPin size={20} /></div><div><strong>{session.title ?? session.activityType}</strong><span>{participant?.name ?? 'Participant inconnu'} · {new Date(session.startTime).toLocaleDateString('fr-FR')}</span></div><StatusPill state={session.status === 'COMPLETED' ? 'good' : session.status === 'INTERRUPTED' ? 'warning' : 'neutral'}>{session.status}</StatusPill></Link> })}</div>}
    </div>
  )
}

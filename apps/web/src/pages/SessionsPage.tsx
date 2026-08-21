import { sessionsEligibleForImport, type ImportResult } from '@track-analyser/domain'
import { parseImportedFile } from '@track-analyser/importers'
import { EmptyState, ScreenHeader, StatusPill } from '@track-analyser/ui'
import { Activity, FileUp, MapPin, Plus } from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../context'
import { messages } from '../i18n'

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
      setMessage(messages.sessions.fileIdentified)
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
      <ScreenHeader eyebrow={`${sessions.length} session${sessions.length > 1 ? 's' : ''}`} title={messages.sessions.title} action={<label className="icon-button" aria-label={messages.sessions.importAria}><FileUp size={21} /><input type="file" accept=".fit,.gpx,.tcx,.json,.xml,.tatrip" onChange={(event) => void selectFile(event)} hidden /></label>} />
      {candidate === undefined ? null : <section className="import-panel"><div><StatusPill state="good">{candidate.identity.format}</StatusPill><h2>{candidate.identity.fileName}</h2><p>{candidate.samples.length} mesures reconnues · {candidate.opaqueRecords.length} champs bruts/opaques conservés</p></div><label>{messages.sessions.participantStep}<select value={participantId} onChange={(event) => { setParticipantId(event.target.value); setSessionId('') }}><option value="">{messages.common.choose}</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>{participantId.length === 0 ? null : <label>{messages.sessions.sessionStep}<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">{messages.sessions.createSession}</option>{eligible.map((session) => <option key={session.id} value={session.id}>{new Date(session.startTime).toLocaleString('fr-FR')} · {session.activityType}</option>)}</select></label>}<p className="form-notice">{messages.sessions.isolationNotice}</p><button className="primary-button" type="button" disabled={participantId.length === 0} onClick={() => void confirmImport()}><Plus size={19} />{messages.sessions.importAction}</button></section>}
      {message.length === 0 ? null : <p className="inline-message">{message}</p>}
      {sessions.length === 0 ? <EmptyState icon={<Activity size={34} />} title={messages.sessions.emptyTitle} description={messages.sessions.emptyDescription} /> : <div className="session-list">{sessions.map((session) => { const participant = participants.find((item) => item.id === session.participantId); return <Link to={`/sessions/${session.id}`} className="session-card" key={session.id}><div className="session-icon"><MapPin size={20} /></div><div><strong>{session.title ?? session.activityType}</strong><span>{participant?.name ?? messages.sessions.unknownParticipant} · {new Date(session.startTime).toLocaleDateString('fr-FR')}</span></div><StatusPill state={session.status === 'COMPLETED' ? 'good' : session.status === 'INTERRUPTED' ? 'warning' : 'neutral'}>{session.status}</StatusPill></Link> })}</div>}
    </div>
  )
}

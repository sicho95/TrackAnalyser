import type { Session } from '@track-analyser/domain'
import { StatusPill } from '@track-analyser/ui'
import { Archive, FileJson, FileSpreadsheet, Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { messages } from '../i18n'
import type { SessionExportKind } from '../session-export'
import { ActivityIcon } from './EquipmentIcon'

const EXPORT_WIDTH = 174
const DELETE_WIDTH = 78

export function SwipeSessionCard({ session, participantName, onExport, onDelete }: { session: Session; participantName: string; onExport(kind: SessionExportKind): Promise<void>; onDelete(): void }): ReactNode {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number; offset: number } | undefined>(undefined)
  const moved = useRef(false)

  const pointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    start.current = { x: event.clientX, y: event.clientY, offset }
    moved.current = false
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (start.current === undefined) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dy) > Math.abs(dx) && !moved.current) return
    if (Math.abs(dx) > 7) {
      moved.current = true
      // Capturer seulement après avoir reconnu un glissement horizontal afin de laisser un toucher simple activer le lien.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setOffset(Math.max(-DELETE_WIDTH, Math.min(EXPORT_WIDTH, start.current.offset + dx)))
  }
  const pointerUp = (): void => {
    if (offset > 60) setOffset(EXPORT_WIDTH)
    else if (offset < -38) setOffset(-DELETE_WIDTH)
    else setOffset(0)
    start.current = undefined
  }
  const runExport = async (kind: SessionExportKind): Promise<void> => {
    setOffset(0)
    await onExport(kind)
  }

  return <article className="swipe-session-row">
    <div className="swipe-actions swipe-exports" aria-hidden={offset <= 0}>
      <button type="button" tabIndex={offset > 0 ? 0 : -1} onClick={() => void runExport('JSON')}><FileJson size={19} /><span>JSON</span></button>
      <button type="button" tabIndex={offset > 0 ? 0 : -1} onClick={() => void runExport('CSV')}><FileSpreadsheet size={19} /><span>CSV</span></button>
      <button type="button" tabIndex={offset > 0 ? 0 : -1} onClick={() => void runExport('TATRIP')}><Archive size={19} /><span>.tatrip</span></button>
    </div>
    <div className="swipe-actions swipe-delete" aria-hidden={offset >= 0}><button type="button" tabIndex={offset < 0 ? 0 : -1} onClick={onDelete}><Trash2 size={21} /><span>{messages.common.delete}</span></button></div>
    <div className="session-card swipe-front" style={{ transform: `translateX(${offset}px)` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <Link to={`/sessions/${session.id}`} className="session-card-main" onClick={(event) => { if (moved.current) event.preventDefault() }}>
        <div className="session-icon"><ActivityIcon activityType={session.activityType} /></div><div><strong>{session.title ?? messages.activity[session.activityType]}</strong><span>{participantName} · {new Date(session.startTime).toLocaleDateString('fr-FR')}</span></div><StatusPill state={session.status === 'COMPLETED' ? 'good' : session.status === 'INTERRUPTED' ? 'warning' : 'neutral'}>{session.status}</StatusPill>
      </Link>
    </div>
  </article>
}

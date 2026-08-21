import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { messages } from '../i18n'

export function DeleteSessionDialog({ open, sessionName, onCancel, onConfirm }: { open: boolean; sessionName: string; onCancel(): void; onConfirm(): Promise<void> }): ReactNode {
  const [stage, setStage] = useState<1 | 2>(1)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStage(1)
    setDeleting(false)
    setError('')
  }, [open])

  if (!open) return null
  const confirm = async (): Promise<void> => {
    if (stage === 1) {
      setStage(2)
      return
    }
    setDeleting(true)
    setError('')
    try {
      await onConfirm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setDeleting(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !deleting) onCancel() }}>
    <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-session-title" aria-describedby="delete-session-description">
      <button className="dialog-close" type="button" disabled={deleting} onClick={onCancel} aria-label={messages.common.cancel}><X size={20} /></button>
      <div className="danger-icon"><AlertTriangle size={28} /></div>
      <h2 id="delete-session-title">{stage === 1 ? messages.sessions.deleteTitle : messages.sessions.deleteFinalTitle}</h2>
      <p id="delete-session-description">{stage === 1 ? `${sessionName} · ${messages.sessions.deleteFirstBody}` : messages.sessions.deleteFinalBody}</p>
      {error.length === 0 ? null : <p className="dialog-error">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={deleting} onClick={onCancel}>{messages.common.cancel}</button><button className="danger-button" type="button" disabled={deleting} onClick={() => void confirm()}><Trash2 size={18} />{deleting ? messages.sessions.deleting : stage === 1 ? messages.common.continue : messages.sessions.deleteForever}</button></div>
    </section>
  </div>
}

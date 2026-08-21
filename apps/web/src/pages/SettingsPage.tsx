import { createBackupArchive, restoreBackupArchive } from '@track-analyser/exporters'
import { chunkBytes, ProgressiveRawStore } from '@track-analyser/storage'
import { ScreenHeader } from '@track-analyser/ui'
import { DatabaseBackup, Download, Moon, RotateCcw, Sun, Upload } from 'lucide-react'
import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useAppData } from '../context'

function saveFile(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of stream) { chunks.push(chunk); length += chunk.byteLength }
  const result = new Uint8Array(length)
  let offset = 0
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.byteLength })
  return result
}

export function SettingsPage(): ReactNode {
  const { settings, updateSettings, repositories, sessions, refresh } = useAppData()
  const [message, setMessage] = useState('')

  const backup = async (): Promise<void> => {
    if (repositories === undefined) return
    setMessage('Préparation de la sauvegarde locale…')
    const snapshot = await repositories.snapshot()
    const rawStore = new ProgressiveRawStore()
    const rawFiles: Record<string, Uint8Array> = {}
    for (const reference of sessions.flatMap((session) => session.rawDataReferences)) rawFiles[`${reference.id}.bin`] = await collect(rawStore.read(reference))
    saveFile(createBackupArchive(snapshot, rawFiles), `track-analyser-${new Date().toISOString().slice(0, 10)}.tabackup`)
    setMessage('Sauvegarde complète créée.')
  }

  const restore = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (file === undefined || repositories === undefined) return
    const restored = restoreBackupArchive(new Uint8Array(await file.arrayBuffer()))
    const rawStore = new ProgressiveRawStore()
    const rawById = new Map(Object.entries(restored.rawFiles).map(([path, bytes]) => [path.replace(/\.bin$/, ''), bytes]))
    for (const reference of restored.snapshot.sessions.flatMap((session) => session.rawDataReferences)) {
      const bytes = rawById.get(reference.id)
      if (bytes !== undefined) {
        const written = await rawStore.write(reference.id, chunkBytes(bytes), {
          sessionId: reference.sessionId,
          sourceId: reference.sourceId,
          mediaType: reference.mediaType,
          ...(reference.importedFileName === undefined ? {} : { importedFileName: reference.importedFileName }),
        })
        if (written.sha256 !== reference.sha256) throw new Error(`Empreinte RAW invalide pour ${reference.id}.`)
      }
    }
    await repositories.restore(restored.snapshot)
    await refresh()
    setMessage('Sauvegarde restaurée avec vérification des RAW.')
  }

  return <div className="screen"><ScreenHeader eyebrow={`Version ${__APP_VERSION__} · build ${__BUILD_ID__}`} title="Réglages" />
    <section className="settings-section"><h2>Apparence</h2><div className="segmented-control"><button className={settings.theme === 'light' ? 'active' : ''} type="button" onClick={() => void updateSettings({ ...settings, theme: 'light' })}><Sun size={17} />Clair</button><button className={settings.theme === 'dark' ? 'active' : ''} type="button" onClick={() => void updateSettings({ ...settings, theme: 'dark' })}><Moon size={17} />Sombre</button><button className={settings.theme === 'system' ? 'active' : ''} type="button" onClick={() => void updateSettings({ ...settings, theme: 'system' })}><RotateCcw size={17} />Système</button></div></section>
    <section className="settings-section"><h2>Cartographie</h2><label>Source libre<select value={settings.mapProvider} onChange={(event) => void updateSettings({ ...settings, mapProvider: event.target.value })}><option value="osm">OpenStreetMap standard</option><option value="topo">OpenTopoMap relief</option></select></label><p>La carte dépend du réseau en V1. L’enregistrement, les analyses et la trace restent utilisables sans fond cartographique.</p></section>
    <section className="settings-section"><h2>Données</h2><button className="settings-action" type="button" onClick={() => void backup()}><DatabaseBackup size={20} /><span><strong>Sauvegarde complète</strong><small>Participants, équipements, appareils, groupes, sessions, profils, analyses, réglages et RAW</small></span><Download size={18} /></button><label className="settings-action"><Upload size={20} /><span><strong>Restaurer .tabackup</strong><small>Vérifier le format et les empreintes avant restauration</small></span><input type="file" accept=".tabackup" onChange={(event) => void restore(event)} hidden /></label></section>
    <section className="privacy-panel"><h2>Local par défaut</h2><p>Aucune télémétrie, aucun compte et aucun envoi automatique. Tout export est déclenché explicitement.</p></section>
    {message.length === 0 ? null : <p className="inline-message">{message}</p>}
  </div>
}


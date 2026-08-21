import { ScreenHeader } from '@track-analyser/ui'
import { FlaskConical, Plus, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAppData } from '../context'
import { messages } from '../i18n'
import { EquipmentIcon } from '../components/EquipmentIcon'

export function ProfilesPage(): ReactNode {
  const { participants, equipment, sessions, analysisProfiles, addParticipant, addEquipment, createAnalysisProfile } = useAppData()
  const [name, setName] = useState('')
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentType, setEquipmentType] = useState('CAR')
  const [baseProfileId, setBaseProfileId] = useState('')
  const [version, setVersion] = useState('1.1.0')
  const [profileName, setProfileName] = useState('')
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [profileMessage, setProfileMessage] = useState('')
  const baseProfile = analysisProfiles.find((profile) => profile.id === baseProfileId) ?? analysisProfiles[0]
  const effectiveBaseId = baseProfile?.id ?? ''

  useEffect(() => {
    if (baseProfile === undefined) return
    setProfileName(`${baseProfile.name} ${messages.profiles.calibratedSuffix}`)
    setParameters(Object.fromEntries(Object.entries(baseProfile.parameters).map(([key, value]) => [key, String(value)])))
  }, [baseProfile])

  const parsedParameters = useMemo(() => Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, Number(value)])), [parameters])
  const submitParticipant = async (event: FormEvent): Promise<void> => { event.preventDefault(); await addParticipant(name); setName('') }
  const submitEquipment = async (event: FormEvent): Promise<void> => { event.preventDefault(); await addEquipment(equipmentName, equipmentType); setEquipmentName('') }
  const submitProfile = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setProfileMessage('')
    try {
      const created = await createAnalysisProfile(effectiveBaseId, version, profileName, parsedParameters)
      setBaseProfileId(created.id)
      setProfileMessage(`Profil ${created.name} version ${created.version} conservé.`)
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return <div className="screen"><ScreenHeader eyebrow={messages.profiles.eyebrow} title={messages.profiles.title} />
    <section className="profile-section"><h2>{messages.profiles.participants}</h2><form className="inline-form" onSubmit={(event) => void submitParticipant(event)}><input value={name} onChange={(event) => setName(event.target.value)} placeholder={messages.profiles.participantName} aria-label={messages.profiles.participantName} required /><button type="submit" aria-label={messages.profiles.add}><Plus size={20} /></button></form><div className="profile-list">{participants.map((participant) => <article key={participant.id}><UserRound size={22} /><div><strong>{participant.name}</strong><span>{sessions.filter((session) => session.participantId === participant.id).length} session(s)</span></div></article>)}</div></section>
    <section className="profile-section"><h2>{messages.profiles.equipment}</h2><form className="stacked-form" onSubmit={(event) => void submitEquipment(event)}><input value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} placeholder={messages.profiles.equipmentExample} required /><label>{messages.profiles.equipmentType}<select value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)}>{Object.entries(messages.activity).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="secondary-button" type="submit"><Plus size={18} />{messages.profiles.addEquipment}</button></form><div className="profile-list">{equipment.map((item) => <article key={item.id}><EquipmentIcon type={item.type} /><div><strong>{item.name}</strong><span>{messages.activity[item.type as keyof typeof messages.activity] ?? item.type}</span></div></article>)}</div></section>
    <section className="profile-section analysis-profile-section"><div className="section-title"><FlaskConical size={22} /><div><h2>{messages.profiles.analysisTitle}</h2><p>{messages.profiles.analysisBody}</p></div></div>
      {baseProfile === undefined ? <p>{messages.profiles.noProfile}</p> : <form className="stacked-form" onSubmit={(event) => void submitProfile(event)}>
        <label>{messages.profiles.sourceProfile}<select value={effectiveBaseId} onChange={(event) => setBaseProfileId(event.target.value)}>{analysisProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.activityType} · {profile.name} · {profile.version}</option>)}</select></label>
        <div className="profile-version-row"><label>{messages.profiles.nextVersion}<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.1.0" pattern="[0-9]+\.[0-9]+\.[0-9]+.*" required /></label><label>{messages.profiles.name}<input value={profileName} onChange={(event) => setProfileName(event.target.value)} required /></label></div>
        <details><summary>{messages.profiles.parameters}</summary><div className="parameter-grid">{Object.entries(parameters).map(([key, value]) => <label key={key}>{key}<input type="number" step="any" value={value} onChange={(event) => setParameters((current) => ({ ...current, [key]: event.target.value }))} required /></label>)}</div></details>
        <button className="secondary-button" type="submit"><Plus size={18} />{messages.profiles.saveVersion}</button>
      </form>}
      {profileMessage.length === 0 ? null : <p className="inline-message">{profileMessage}</p>}
    </section>
  </div>
}

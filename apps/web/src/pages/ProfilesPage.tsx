import { ScreenHeader } from '@track-analyser/ui'
import { Bike, Plus, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useAppData } from '../context'

export function ProfilesPage(): ReactNode {
  const { participants, equipment, sessions, addParticipant, addEquipment } = useAppData()
  const [name, setName] = useState('')
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentType, setEquipmentType] = useState('')
  const submitParticipant = async (event: FormEvent): Promise<void> => { event.preventDefault(); await addParticipant(name); setName('') }
  const submitEquipment = async (event: FormEvent): Promise<void> => { event.preventDefault(); await addEquipment(equipmentName, equipmentType); setEquipmentName(''); setEquipmentType('') }
  return <div className="screen"><ScreenHeader eyebrow="Séparation stricte des données" title="Profils" />
    <section className="profile-section"><h2>Participants</h2><form className="inline-form" onSubmit={(event) => void submitParticipant(event)}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du participant" aria-label="Nom du participant" required /><button type="submit" aria-label="Ajouter"><Plus size={20} /></button></form><div className="profile-list">{participants.map((participant) => <article key={participant.id}><UserRound size={22} /><div><strong>{participant.name}</strong><span>{sessions.filter((session) => session.participantId === participant.id).length} session(s)</span></div></article>)}</div></section>
    <section className="profile-section"><h2>Équipements</h2><form className="stacked-form" onSubmit={(event) => void submitEquipment(event)}><input value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} placeholder="Nom, par ex. Vélo route" required /><input value={equipmentType} onChange={(event) => setEquipmentType(event.target.value)} placeholder="Type" required /><button className="secondary-button" type="submit"><Plus size={18} />Ajouter l’équipement</button></form><div className="profile-list">{equipment.map((item) => <article key={item.id}><Bike size={22} /><div><strong>{item.name}</strong><span>{item.type}</span></div></article>)}</div></section>
  </div>
}


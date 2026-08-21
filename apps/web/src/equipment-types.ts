import type { ActivityType } from '@track-analyser/domain'

const TYPE_ALIASES: Readonly<Record<string, ActivityType | 'OTHER'>> = {
  generic: 'GENERIC', autre: 'OTHER', other: 'OTHER',
  car: 'CAR', voiture: 'CAR', auto: 'CAR', automobile: 'CAR',
  motorcycle: 'MOTORCYCLE', moto: 'MOTORCYCLE', scooter: 'MOTORCYCLE',
  bike: 'BIKE', bicycle: 'BIKE', velo: 'BIKE', vtt: 'BIKE',
  boat: 'BOAT', bateau: 'BOAT', voile: 'BOAT', kayak: 'BOAT',
  aircraft: 'AIRCRAFT', avion: 'AIRCRAFT', plane: 'AIRCRAFT',
  paragliding: 'PARAGLIDING', parapente: 'PARAGLIDING',
  hiking: 'HIKING', randonnee: 'HIKING', marche: 'HIKING',
  trail_running: 'TRAIL_RUNNING', trail: 'TRAIL_RUNNING',
  running: 'RUNNING', course: 'RUNNING', chaussures: 'RUNNING',
}

export function normalizeEquipmentType(type: string): ActivityType | 'OTHER' {
  const normalized = type.trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ -]+/g, '_')
  return TYPE_ALIASES[normalized] ?? 'OTHER'
}

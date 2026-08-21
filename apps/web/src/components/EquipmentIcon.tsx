import type { ActivityType } from '@track-analyser/domain'
import { Bike, CarFront, Footprints, Gauge, Package, Plane, Sailboat, ShipWheel, Wind, Wrench, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { normalizeEquipmentType } from '../equipment-types'
import { messages } from '../i18n'

const ICONS: Readonly<Record<ActivityType | 'OTHER', LucideIcon>> = {
  GENERIC: Wrench,
  CAR: CarFront,
  MOTORCYCLE: Gauge,
  BIKE: Bike,
  BOAT: ShipWheel,
  AIRCRAFT: Plane,
  PARAGLIDING: Wind,
  HIKING: Footprints,
  TRAIL_RUNNING: Footprints,
  RUNNING: Footprints,
  OTHER: Package,
}

export function EquipmentIcon({ type, size = 22 }: { type: string; size?: number }): ReactNode {
  const normalized = normalizeEquipmentType(type)
  const Icon = ICONS[normalized]
  const label = normalized === 'OTHER' ? 'Autre équipement' : messages.activity[normalized]
  return <Icon size={size} role="img" aria-label={`Équipement ${label.toLocaleLowerCase('fr-FR')}`} />
}

export function ActivityIcon({ activityType, size = 20 }: { activityType: ActivityType; size?: number }): ReactNode {
  const Icon = activityType === 'BOAT' ? Sailboat : ICONS[activityType]
  return <Icon size={size} aria-hidden="true" />
}

import type { StyleSpecification } from 'maplibre-gl'

export const MAP_PROVIDER_IDS = ['osm', 'topo'] as const

export type MapProviderId = (typeof MAP_PROVIDER_IDS)[number]

export function isMapProviderId(value: string): value is MapProviderId {
  return MAP_PROVIDER_IDS.some((id) => id === value)
}

export function createMapStyle(provider: string): StyleSpecification {
  if (provider === 'topo') {
    return {
      version: 8,
      sources: {
        topo: { type: 'raster', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors, SRTM | OpenTopoMap' },
      },
      layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
    }
  }
  return {
    version: 8,
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  }
}

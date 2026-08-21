import type { GeoPoint } from '@track-analyser/domain'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, type ReactNode } from 'react'

const STYLES: Readonly<Record<string, StyleSpecification>> = {
  osm: {
    version: 8,
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  topo: {
    version: 8,
    sources: {
      topo: { type: 'raster', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors, SRTM | OpenTopoMap' },
    },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  },
}

export function MapView({ route, provider = 'osm' }: { route: readonly GeoPoint[]; provider?: string }): ReactNode {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (container.current === null || route.length === 0) return
    const first = route[0]
    if (first === undefined) return
    const style = STYLES[provider] ?? STYLES.osm
    if (style === undefined) return
    const map = new maplibregl.Map({
      container: container.current,
      style,
      center: [first.longitude, first.latitude],
      zoom: 13,
      attributionControl: {},
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: route.map((point) => [point.longitude, point.latitude]) },
        },
      })
      map.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#07111f', 'line-width': 7, 'line-opacity': 0.55 } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#3dd7c5', 'line-width': 4 } })
      const bounds = route.reduce(
        (current, point) => current.extend([point.longitude, point.latitude]),
        new maplibregl.LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude]),
      )
      map.fitBounds(bounds, { padding: 36, maxZoom: 16, duration: 0 })
    })
    return () => map.remove()
  }, [provider, route])
  if (route.length === 0) return <div className="map-placeholder">Trace cartographique indisponible. Les analyses restent accessibles hors ligne.</div>
  return <div ref={container} className="map-view" aria-label="Carte du parcours" />
}

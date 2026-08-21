import type { GeoPoint } from '@track-analyser/domain'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { Layers3, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { messages } from '../i18n'

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

export function MapView({
  route,
  provider = 'osm',
  onProviderChange,
}: {
  route: readonly GeoPoint[]
  provider?: string
  onProviderChange?(provider: 'osm' | 'topo'): void
}): ReactNode {
  const container = useRef<HTMLDivElement>(null)
  const mapReference = useRef<maplibregl.Map | undefined>(undefined)
  const [fullscreen, setFullscreen] = useState(false)

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
    mapReference.current = map
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
    return () => {
      mapReference.current = undefined
      map.remove()
    }
  }, [provider, route])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    if (fullscreen) document.body.style.overflow = 'hidden'
    const resize = window.setTimeout(() => mapReference.current?.resize(), 0)
    const closeWithEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      window.clearTimeout(resize)
      window.removeEventListener('keydown', closeWithEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [fullscreen])

  if (route.length === 0) return <div className="map-placeholder">{messages.detail.noRoute}</div>
  return <section className={`session-map${fullscreen ? ' session-map-fullscreen' : ''}`}>
    <div className="map-direct-controls">
      <div className="map-provider-control" role="group" aria-label={messages.detail.mapBackground}>
        <Layers3 size={16} aria-hidden="true" />
        <button className={provider === 'osm' ? 'active' : ''} type="button" aria-pressed={provider === 'osm'} onClick={() => onProviderChange?.('osm')}>{messages.detail.mapStandard}</button>
        <button className={provider === 'topo' ? 'active' : ''} type="button" aria-pressed={provider === 'topo'} onClick={() => onProviderChange?.('topo')}>{messages.detail.mapTopo}</button>
      </div>
      <button className="map-fullscreen-toggle" type="button" aria-label={fullscreen ? messages.detail.mapReduce : messages.detail.mapFullscreen} onClick={() => setFullscreen((current) => !current)}>
        {fullscreen ? <Minimize2 size={19} aria-hidden="true" /> : <Maximize2 size={19} aria-hidden="true" />}
      </button>
    </div>
    <div ref={container} className="map-view" aria-label={messages.detail.mapAria} />
  </section>
}

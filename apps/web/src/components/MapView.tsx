import type { GeoPoint } from '@track-analyser/domain'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { messages } from '../i18n'
import { createMapStyle, type MapProviderId } from '../map-providers'
import { MapStyleControl } from './MapStyleControl'

export function MapView({
  route,
  segments,
  provider = 'osm',
  onProviderChange,
}: {
  route: readonly GeoPoint[]
  segments?: readonly (readonly GeoPoint[])[]
  provider?: string
  onProviderChange?(provider: MapProviderId): void
}): ReactNode {
  const container = useRef<HTMLDivElement>(null)
  const providerChange = useRef(onProviderChange)
  providerChange.current = onProviderChange
  const routeSegments = useMemo(() => segments?.filter((segment) => segment.length >= 2) ?? (route.length < 2 ? [] : [route]), [route, segments])
  const visiblePoints = useMemo(() => routeSegments.flat(), [routeSegments])

  useEffect(() => {
    if (container.current === null || visiblePoints.length === 0) return
    const first = visiblePoints[0]
    if (first === undefined) return
    const map = new maplibregl.Map({
      container: container.current,
      style: createMapStyle(provider),
      center: [first.longitude, first.latitude],
      zoom: 13,
      attributionControl: {},
      locale: {
        'FullscreenControl.Enter': messages.detail.mapFullscreen,
        'FullscreenControl.Exit': messages.detail.mapReduce,
        'NavigationControl.ZoomIn': messages.detail.mapZoomIn,
        'NavigationControl.ZoomOut': messages.detail.mapZoomOut,
        'NavigationControl.ResetBearing': messages.detail.mapResetBearing,
      },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new MapStyleControl(provider, (nextProvider) => providerChange.current?.(nextProvider)), 'top-right')
    map.addControl(new maplibregl.FullscreenControl({ pseudo: true }), 'top-right')
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiLineString', coordinates: routeSegments.map((segment) => segment.map((point) => [point.longitude, point.latitude])) },
        },
      })
      map.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#07111f', 'line-width': 7, 'line-opacity': 0.55 } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#3dd7c5', 'line-width': 4 } })
      const bounds = visiblePoints.reduce(
        (current, point) => current.extend([point.longitude, point.latitude]),
        new maplibregl.LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude]),
      )
      map.fitBounds(bounds, { padding: 36, maxZoom: 16, duration: 0 })
    })
    return () => map.remove()
  }, [provider, routeSegments, visiblePoints])

  if (visiblePoints.length === 0) return <div className="map-placeholder">{messages.detail.noRoute}</div>
  return <div ref={container} className="map-view" aria-label={messages.detail.mapAria} />
}

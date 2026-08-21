import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAP_PROVIDER_IDS } from '../map-providers'
import { MapStyleControl } from './MapStyleControl'

describe('contrôle MapLibre des fonds cartographiques', () => {
  it('ouvre un seul menu qui expose tous les fonds du catalogue', () => {
    const selectProvider = vi.fn()
    const control = new MapStyleControl('osm', selectProvider)
    document.body.append(control.onAdd())

    fireEvent.click(screen.getByRole('button', { name: 'Choisir le fond de carte' }))
    const providers = screen.getAllByRole('menuitemradio')
    expect(providers).toHaveLength(MAP_PROVIDER_IDS.length)
    expect(screen.getByRole('menuitemradio', { name: 'OpenStreetMap standard' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'OpenTopoMap relief' }))
    expect(selectProvider).toHaveBeenCalledWith('topo')

    control.onRemove()
  })
})

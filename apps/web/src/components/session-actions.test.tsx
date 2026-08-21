import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { session } from '../../../../tests/helpers'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { EquipmentIcon } from './EquipmentIcon'
import { normalizeEquipmentType } from '../equipment-types'
import { SwipeSessionCard } from './SwipeSessionCard'

describe('actions et équipements de session', () => {
  it('associe une voiture à une icône automobile, y compris pour une ancienne valeur française', () => {
    expect(normalizeEquipmentType('Voiture')).toBe('CAR')
    const { rerender } = render(<EquipmentIcon type="CAR" />)
    expect(screen.getByRole('img', { name: 'Équipement voiture' })).toBeDefined()
    rerender(<EquipmentIcon type="vélo" />)
    expect(screen.getByRole('img', { name: 'Équipement vélo' })).toBeDefined()
  })

  it('exige deux confirmations avant de supprimer', async () => {
    const confirm = vi.fn(async () => undefined)
    render(<DeleteSessionDialog open sessionName="Kuga" onCancel={() => undefined} onConfirm={confirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Confirmer la suppression définitive' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('révèle la suppression à gauche et les exports à droite', () => {
    const { container } = render(<MemoryRouter><SwipeSessionCard session={session('session', 'damien', 'CAR')} participantName="Damien" onExport={async () => undefined} onDelete={() => undefined} /></MemoryRouter>)
    const front = container.querySelector<HTMLElement>('.swipe-front')
    if (front === null) throw new Error('Carte glissable absente.')
    fireEvent(front, new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 40 }))
    fireEvent(front, new MouseEvent('pointermove', { bubbles: true, clientX: 190, clientY: 42 }))
    fireEvent(front, new MouseEvent('pointerup', { bubbles: true }))
    expect(container.querySelector<HTMLButtonElement>('.swipe-delete button')?.tabIndex).toBe(0)

    fireEvent(front, new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 40 }))
    fireEvent(front, new MouseEvent('pointermove', { bubbles: true, clientX: 380, clientY: 42 }))
    fireEvent(front, new MouseEvent('pointerup', { bubbles: true }))
    const exportButtons = container.querySelectorAll<HTMLButtonElement>('.swipe-exports button')
    expect([...exportButtons].map((button) => button.tabIndex)).toEqual([0, 0, 0])
  })
})

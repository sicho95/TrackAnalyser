import type { IControl } from 'maplibre-gl'
import { messages } from '../i18n'
import { MAP_PROVIDER_IDS, type MapProviderId } from '../map-providers'

export class MapStyleControl implements IControl {
  private container: HTMLDivElement | undefined
  private menu: HTMLDivElement | undefined

  constructor(
    private readonly selectedProvider: string,
    private readonly selectProvider: (provider: MapProviderId) => void,
  ) {}

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group map-style-control'
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'maplibregl-ctrl-icon map-style-control-toggle'
    toggle.title = messages.detail.mapBackground
    toggle.setAttribute('aria-label', messages.detail.mapBackground)
    toggle.setAttribute('aria-expanded', 'false')

    const menu = document.createElement('div')
    menu.className = 'map-style-menu'
    menu.setAttribute('role', 'menu')
    menu.hidden = true
    MAP_PROVIDER_IDS.forEach((provider) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.setAttribute('role', 'menuitemradio')
      option.setAttribute('aria-checked', String(this.selectedProvider === provider))
      option.textContent = messages.settings.mapProviders[provider]
      option.addEventListener('click', () => {
        this.selectProvider(provider)
        this.closeMenu(toggle)
      })
      menu.append(option)
    })

    toggle.addEventListener('click', (event) => {
      event.stopPropagation()
      menu.hidden = !menu.hidden
      toggle.setAttribute('aria-expanded', String(!menu.hidden))
    })
    container.append(toggle, menu)
    this.container = container
    this.menu = menu
    document.addEventListener('pointerdown', this.closeFromOutside)
    document.addEventListener('keydown', this.closeWithEscape)
    return container
  }

  onRemove(): void {
    document.removeEventListener('pointerdown', this.closeFromOutside)
    document.removeEventListener('keydown', this.closeWithEscape)
    this.container?.remove()
    this.container = undefined
    this.menu = undefined
  }

  private closeMenu(toggle = this.container?.querySelector<HTMLButtonElement>('.map-style-control-toggle')): void {
    if (this.menu !== undefined) this.menu.hidden = true
    toggle?.setAttribute('aria-expanded', 'false')
  }

  private readonly closeFromOutside = (event: PointerEvent): void => {
    if (event.target instanceof Node && this.container?.contains(event.target) === true) return
    this.closeMenu()
  }

  private readonly closeWithEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.closeMenu()
  }
}

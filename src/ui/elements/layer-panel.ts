/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { EntityId, Layer } from '../../document.js'
import { escapeHtml } from '../lib/escape.js'

export type LayerPanelOp = 'add' | 'rename' | 'visibility' | 'lock' | 'activate' | 'remove'

export interface LayerPanelChange {
  op: LayerPanelOp
  /** For `add` no layer exists yet, so the id is empty and `value` names it. */
  layerId: EntityId
  value?: string | boolean
}

export interface LayerPanelEventMap {
  'layer-panel:change': CustomEvent<LayerPanelChange>
}

// Decorative glyphs; the aria-label carries the accessible name.
const ICON_VISIBLE =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.9" fill="currentColor"/></svg>'
const ICON_HIDDEN =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M3.2 5.4C2 6.6 1.5 8 1.5 8S4 12.2 8 12.2c1 0 1.9-.2 2.7-.6M7 3.9c.3 0 .7-.1 1-.1 4 0 6.5 4.2 6.5 4.2s-.6 1.1-1.7 2.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
const ICON_LOCK =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.4" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'

/**
 * Layer table panel. Property-driven: the mediator pushes the layer list and
 * active id in via {@link LayerPanel.setLayers}; the element never touches
 * the document. Every user intent is emitted as `layer-panel:change` for the
 * mediator to map onto model ops.
 */
export class LayerPanel extends HTMLElement {
  #layers: readonly Layer[] = []
  #activeLayerId: EntityId | null = null
  #abort: AbortController | null = null
  #renameAbort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
    this.syncDisplay()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  /** The mediator's single push point; safe before and after connection. */
  setLayers(layers: readonly Layer[], activeLayerId: EntityId): void {
    this.#layers = layers
    this.#activeLayerId = activeLayerId
    if (this.isConnected) {
      this.render()
      this.syncDisplay()
    }
  }

  render(): void {
    this.setAttribute('role', 'group')
    this.setAttribute('aria-label', 'Layers')
    this.innerHTML = `
      <ul class="layer-rows" role="radiogroup" aria-label="Active layer">
        ${this.#layers.map(layer => this.#rowHtml(layer)).join('')}
      </ul>
      <button type="button" class="layer-add">Add layer</button>
    `
  }

  #rowHtml(layer: Layer): string {
    // Layer names are user data — every interpolation is escaped.
    const name = escapeHtml(layer.name)
    const active = layer.id === this.#activeLayerId
    const lastLayer = this.#layers.length <= 1
    return `
      <li class="layer-row" data-layer-id="${layer.id}">
        <button type="button" class="layer-active" role="radio" aria-checked="${active}"
          aria-label="Make ${name} the active layer" title="Set active"></button>
        <button type="button" class="layer-name" title="Rename layer">${name}</button>
        <button type="button" class="layer-visible" aria-pressed="${layer.visible}"
          aria-label="${layer.visible ? 'Hide' : 'Show'} layer ${name}">${layer.visible ? ICON_VISIBLE : ICON_HIDDEN}</button>
        <button type="button" class="layer-lock" aria-pressed="${layer.locked}"
          aria-label="${layer.locked ? 'Unlock' : 'Lock'} layer ${name}">${ICON_LOCK}</button>
        <button type="button" class="layer-remove" aria-label="Delete layer ${name}"
          ${lastLayer ? 'disabled title="A document needs at least one layer"' : ''}>&times;</button>
      </li>
    `
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('click', this.#onClick, opts)
    this.addEventListener('keydown', this.#onKeydown, opts)
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
    this.#closeRename()
  }

  syncDisplay(): void {
    // Radio/pressed state is rendered into the markup; nothing to patch here.
  }

  #layerOf(id: EntityId): Layer | undefined {
    return this.#layers.find(layer => layer.id === id)
  }

  #emit(op: LayerPanelOp, layerId: EntityId, value?: string | boolean): void {
    this.dispatchEvent(
      new CustomEvent<LayerPanelChange>('layer-panel:change', {
        bubbles: true,
        composed: true,
        detail: value === undefined ? { op, layerId } : { op, layerId, value },
      })
    )
  }

  #onClick = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button')
    if (target === null || target.disabled) return
    if (target.classList.contains('layer-add')) {
      // A sensible default the mediator is free to keep; renaming is inline.
      this.#emit('add', '', `Layer ${this.#layers.length + 1}`)
      return
    }
    const row = target.closest<HTMLLIElement>('.layer-row')
    const layer = row !== null ? this.#layerOf(row.dataset.layerId ?? '') : undefined
    if (layer === undefined) return

    if (target.classList.contains('layer-active')) {
      this.#emit('activate', layer.id)
    } else if (target.classList.contains('layer-name')) {
      this.#openRename(row, layer)
    } else if (target.classList.contains('layer-visible')) {
      this.#emit('visibility', layer.id, !layer.visible)
    } else if (target.classList.contains('layer-lock')) {
      this.#emit('lock', layer.id, !layer.locked)
    } else if (target.classList.contains('layer-remove')) {
      this.#emit('remove', layer.id)
    }
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLInputElement)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#commitRename(event.target.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.#closeRename()
      this.render()
    }
  }

  /** Swap the name button for an inline editor; blur commits like Enter. */
  #openRename(row: Element | null, layer: Layer): void {
    this.#closeRename()
    const button = row?.querySelector<HTMLButtonElement>('.layer-name')
    if (button === null || button === undefined) return
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'layer-rename'
    input.value = layer.name
    input.setAttribute('aria-label', 'Layer name')
    button.replaceWith(input)
    input.focus()
    input.select()

    this.#renameAbort = new AbortController()
    const opts = { signal: this.#renameAbort.signal }
    input.addEventListener('blur', () => this.#commitRename(input.value), opts)
  }

  #commitRename(raw: string): void {
    const input = this.querySelector<HTMLInputElement>('input.layer-rename')
    if (input === null) return
    const row = input.closest<HTMLLIElement>('.layer-row')
    const layer = row !== null ? this.#layerOf(row.dataset.layerId ?? '') : undefined
    this.#closeRename()
    const name = raw.trim()
    if (layer !== undefined && name !== '' && name !== layer.name) {
      this.#emit('rename', layer.id, name)
    }
    // Restore the name button; the new name arrives via setLayers.
    this.render()
  }

  #closeRename(): void {
    this.#renameAbort?.abort()
    this.#renameAbort = null
  }
}

customElements.define('layer-panel', LayerPanel)

declare global {
  interface HTMLElementTagNameMap {
    'layer-panel': LayerPanel
  }
}

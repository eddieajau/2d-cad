/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { Entity, EntityId } from '../../document.js'
import { DEFAULT_COLOUR } from '../../document.js'
import { escapeHtml } from '../lib/escape.js'

export interface EntityColourChange {
  id: EntityId
  /** A hex colour to apply, or null to clear the override. */
  colour: string | null
}

export interface EntityColourEventMap {
  'entity-colour:change': CustomEvent<EntityColourChange>
}

/**
 * Colour control for the single selected entity. Property-driven: the
 * mediator pushes the selection in via {@link EntityColour.setSelection};
 * both controls stay disabled unless exactly one entity is selected. Every
 * user intent is emitted as `entity-colour:change` for the mediator to map
 * onto model ops.
 */
export class EntityColour extends HTMLElement {
  #entity: Entity | null = null
  #layerColour: string = DEFAULT_COLOUR
  #abort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  /**
   * The mediator's single push point: the selected entity (or null) plus the
   * colour of its layer, so the swatch shows the effective colour.
   */
  setSelection(entity: Entity | null, layerColour: string): void {
    this.#entity = entity
    this.#layerColour = layerColour
    if (this.isConnected) this.render()
  }

  render(): void {
    this.setAttribute('role', 'group')
    this.setAttribute('aria-label', 'Selected entity colour')
    const colour = this.#entity?.colour ?? this.#layerColour
    const disabled = this.#entity === null ? 'disabled' : ''
    // Interpolation is model data; escape defensively even though hex values.
    const safeColour = escapeHtml(colour)
    this.innerHTML = `
      <input type="color" class="entity-colour-swatch" value="${safeColour}"
        aria-label="Entity colour" ${disabled} />
      <button type="button" class="entity-colour-clear" aria-label="Clear entity colour override"
        ${disabled}>Clear</button>
    `
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('change', this.#onColour, opts)
    this.addEventListener('click', this.#onClear, opts)
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
  }

  #onColour = (event: Event): void => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.classList.contains('entity-colour-swatch')) return
    if (this.#entity === null) return
    this.#emit(event.target.value)
  }

  #onClear = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest('button.entity-colour-clear')
    if (target === null || target === undefined) return
    if (this.#entity === null) return
    this.#emit(null)
  }

  #emit(colour: string | null): void {
    this.dispatchEvent(
      new CustomEvent<EntityColourChange>('entity-colour:change', {
        bubbles: true,
        composed: true,
        detail: { id: this.#entity!.id, colour },
      })
    )
  }
}

customElements.define('entity-colour', EntityColour)

declare global {
  interface HTMLElementTagNameMap {
    'entity-colour': EntityColour
  }
}

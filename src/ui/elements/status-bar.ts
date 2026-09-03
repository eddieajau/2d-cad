/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { EntityId } from '../../document.js'
import type { SnapMode } from '../../snap.js'
import type { WorldPoint } from '../../viewport.js'

/** Fixed-decimal coordinate formatting; unit system switcher is deferred. */
const COORD_DECIMALS = 2

function formatCoord(value: number): string {
  return value.toFixed(COORD_DECIMALS)
}

/**
 * Readout strip under the canvas. Purely property-driven: the mediator
 * pushes position, snap state, and selection in — the bar never reads the
 * canvas. `aria-live` regions announce changes without stealing focus.
 */
export class StatusBar extends HTMLElement {
  #position: WorldPoint | null = null
  #snapMode: SnapMode = 'off'
  #selectedId: EntityId | null = null
  #hintText: string | null = null
  #coords: HTMLSpanElement | null = null
  #snap: HTMLSpanElement | null = null
  #selection: HTMLSpanElement | null = null
  #hint: HTMLSpanElement | null = null

  connectedCallback(): void {
    this.render()
  }

  render(): void {
    this.innerHTML = `
      <span class="status-coords" aria-live="polite">x: —, y: —</span>
      <span class="status-snap">Snap: off (G)</span>
      <span class="status-selection" aria-live="polite">No selection</span>
      <span class="status-hint" aria-live="polite"></span>
    `
    this.#coords = this.querySelector('.status-coords')
    this.#snap = this.querySelector('.status-snap')
    this.#selection = this.querySelector('.status-selection')
    this.#hint = this.querySelector('.status-hint')
    this.syncDisplay()
  }

  /** Live cursor position in world coordinates. */
  setPosition(p: WorldPoint): void {
    this.#position = p
    if (this.#coords !== null) this.#coords.textContent = `x: ${formatCoord(p.x)}, y: ${formatCoord(p.y)}`
  }

  /** Reflect the canvas snap mode; `G` on the canvas toggles it. */
  setSnap(mode: SnapMode): void {
    this.#snapMode = mode
    if (this.#snap !== null) this.#snap.textContent = `Snap: ${mode === 'grid' ? 'on' : 'off'} (G)`
  }

  /** Selected entity id, or null when nothing is selected. */
  setSelection(selection: { id: EntityId } | null): void {
    this.#selectedId = selection?.id ?? null
    if (this.#selection === null) return
    this.#selection.textContent = this.#selectedId === null ? 'No selection' : `Selected: ${String(this.#selectedId)}`
  }

  /** A transient refusal message (e.g. a locked-layer edit), or null to clear. */
  setHint(text: string | null): void {
    this.#hintText = text
    if (this.#hint !== null) this.#hint.textContent = text ?? ''
  }

  syncDisplay(): void {
    if (this.#position !== null) this.setPosition(this.#position)
    this.setSnap(this.#snapMode)
    this.setSelection(this.#selectedId === null ? null : { id: this.#selectedId })
    this.setHint(this.#hintText)
  }
}

customElements.define('status-bar', StatusBar)

declare global {
  interface HTMLElementTagNameMap {
    'status-bar': StatusBar
  }
}

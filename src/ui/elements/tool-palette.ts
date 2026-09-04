/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { ToolId } from '../../tools/types.js'

export interface ToolPaletteEventMap {
  'tool-palette:select': CustomEvent<{ tool: ToolId }>
  'tool-palette:thickness': CustomEvent<{ thickness: number }>
  /** Typed dx/dy (mm) committed on Enter from the offset tool's entry row. */
  'tool-palette:offset': CustomEvent<{ dx: number; dy: number; link: boolean }>
  /** Live dx/dy from the offset inputs; null when a field is empty or invalid. */
  'tool-palette:offset-entry': CustomEvent<{ dx: number | null; dy: number | null }>
  /** Entry cancelled with Escape in an offset input; the mediator refocuses the canvas. */
  'tool-palette:escape': CustomEvent<Record<string, never>>
}

type ToolPaletteAttribute = 'tools' | 'active'

const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Select',
  line: 'Line',
  rect: 'Rect',
  circle: 'Circle',
  text: 'Text',
  dim: 'Dim',
  wall: 'Wall',
  offset: 'Offset',
}

// Decorative glyphs; the text label carries the accessible name.
const TOOL_ICONS: Record<ToolId, string> = {
  select:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l7.5 6.9-3.5.7 1.9 3.9-1.8.9-1.9-4L4 12.6z" fill="currentColor"/></svg>',
  line: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14 14 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  rect: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  circle:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  text: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v2.5M8 3v10M6 13h4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  dim: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11V5m12 6V5M2 8h12M4 6.5 2 8l2 1.5M12 6.5 14 8l-2 1.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  wall: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="6" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  offset:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6.5" y="6.5" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
}

const SHORTCUTS: Record<string, ToolId> = {
  l: 'line',
  r: 'rect',
  c: 'circle',
  t: 'text',
  d: 'dim',
  w: 'wall',
  o: 'offset',
}

/** Wall band thickness page state defaults, in millimetres. */
const THICKNESS_DEFAULT = 270
const THICKNESS_STEP = 10

function parseToolId(value: string | null | undefined): ToolId | null {
  return value != null && value in TOOL_LABELS ? (value as ToolId) : null
}

function parseTools(value: string | null): ToolId[] {
  if (value === null) return Object.keys(TOOL_LABELS) as ToolId[]
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter((entry): entry is ToolId => entry in TOOL_LABELS)
}

/**
 * Toolbar of tool buttons. Emits `tool-palette:select` on click and on the
 * shared `l`/`r`/`c` keyboard shortcuts (ignored while a form control has
 * focus). The mediator owns tool state; this element only reflects `active`.
 */
export class ToolPalette extends HTMLElement {
  static observedAttributes: ToolPaletteAttribute[] = ['tools', 'active']

  #tools: ToolId[] = parseTools(null)
  #active: ToolId = 'line'
  #abort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
    this.syncDisplay()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: ToolPaletteAttribute, _old: string | null, value: string | null): void {
    if (name === 'tools') {
      this.#tools = parseTools(value)
      if (this.isConnected) this.render()
    }
    if (name === 'active') {
      const parsed = parseToolId(value)
      if (parsed !== null) this.#active = parsed
    }
    if (this.isConnected) this.syncDisplay()
  }

  render(): void {
    this.setAttribute('role', 'toolbar')
    this.setAttribute('aria-label', 'Drawing tools')
    // Interpolated values come only from the fixed records above, keyed by
    // validated tool ids — nothing from the raw attribute reaches the DOM.
    this.innerHTML =
      this.#tools
        .map(
          tool => `
            <button type="button" data-tool="${tool}" title="${TOOL_LABELS[tool]} tool (${tool.toUpperCase()[0]})">
              ${TOOL_ICONS[tool]}
              <span>${TOOL_LABELS[tool]}</span>
            </button>
          `
        )
        .join('') +
      // The wall tool's thickness setting. Hidden unless the wall tool is
      // active (syncDisplay); the wrapped label names the input.
      `<label class="wall-thickness" hidden>
         Thickness mm
         <input type="number" min="0" step="${THICKNESS_STEP}" value="${THICKNESS_DEFAULT}" />
       </label>` +
      // The offset tool's exact dx/dy entry. Hidden unless the offset tool
      // is active (syncDisplay); Enter commits both values, Escape cancels.
      // The Link toggle attaches a positional reference to the source
      // instead of baking coordinates.
      `<span class="offset-entry" hidden>
          <label>dx mm <input class="offset-dx" type="number" step="1" /></label>
          <label>dy mm <input class="offset-dy" type="number" step="1" /></label>
          <label class="offset-link"><input type="checkbox" /> Link</label>
        </span>`
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('click', this.#onClick, opts)
    this.addEventListener('keydown', this.#onButtonKey, opts)
    this.addEventListener('keydown', this.#onOffsetKey, opts)
    this.addEventListener('input', this.#onThicknessInput, opts)
    this.addEventListener('input', this.#onOffsetInput, opts)
    // Shortcuts live here so palette buttons and keys emit the same event.
    document.addEventListener('keydown', this.#onShortcut, opts)
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
  }

  syncDisplay(): void {
    for (const button of this.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
      const tool = parseToolId(button.dataset.tool)
      button.setAttribute('aria-pressed', String(tool === this.#active))
    }
    const thickness = this.querySelector('.wall-thickness')
    if (thickness instanceof HTMLElement) thickness.hidden = this.#active !== 'wall'
    const offsetRow = this.querySelector('.offset-entry')
    if (offsetRow instanceof HTMLElement) offsetRow.hidden = this.#active !== 'offset'
  }

  #onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tool]')
    if (button === null) return
    const tool = parseToolId(button.dataset.tool)
    if (tool !== null) this.#select(tool)
  }

  // Enter/Space activation, handled explicitly (and default-prevented) so
  // behaviour is identical in browsers and synthetic environments.
  #onButtonKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('button[data-tool]')
    if (button === null) return
    event.preventDefault()
    const tool = parseToolId(button.dataset.tool)
    if (tool !== null) this.#select(tool)
  }

  #onShortcut = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
      return
    }
    const tool = SHORTCUTS[event.key.toLowerCase()]
    if (tool === undefined || !this.#tools.includes(tool)) return
    this.#select(tool)
  }

  #onThicknessInput = (event: Event): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.matches('.wall-thickness input')) return
    const raw = input.value.trim()
    if (raw === '') return
    const thickness = Number(raw)
    if (!Number.isFinite(thickness) || thickness < 0) return
    this.dispatchEvent(
      new CustomEvent('tool-palette:thickness', {
        bubbles: true,
        composed: true,
        detail: { thickness },
      })
    )
  }

  #select(tool: ToolId): void {
    this.dispatchEvent(
      new CustomEvent('tool-palette:select', {
        bubbles: true,
        composed: true,
        detail: { tool },
      })
    )
  }

  // Enter commits both typed values; Escape backs out of entry to the
  // preview (the canvas keeps the flow and unwinds it on its own Escape).
  #onOffsetKey = (event: KeyboardEvent): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.matches('.offset-dx, .offset-dy')) return
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#commitOffset()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.#clearOffsetInputs()
      // Clearing also releases the canvas tool's typed preview pin.
      this.#emitOffsetEntry()
      this.dispatchEvent(new CustomEvent('tool-palette:escape', { bubbles: true, composed: true }))
    }
  }

  // Live entry: every keystroke pushes the parsed values down so the tool
  // can pin its preview to the typed position.
  #onOffsetInput = (event: Event): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.matches('.offset-dx, .offset-dy')) return
    this.#emitOffsetEntry()
  }

  #emitOffsetEntry(): void {
    this.dispatchEvent(
      new CustomEvent('tool-palette:offset-entry', {
        bubbles: true,
        composed: true,
        detail: { dx: this.#offsetValue('.offset-dx'), dy: this.#offsetValue('.offset-dy') },
      })
    )
  }

  #commitOffset(): void {
    const dx = this.#offsetValue('.offset-dx')
    const dy = this.#offsetValue('.offset-dy')
    // Both values are required; negatives are fine, garbage is not.
    if (dx === null || dy === null) return
    const link = this.querySelector<HTMLInputElement>('.offset-link input')?.checked ?? false
    this.#clearOffsetInputs()
    this.dispatchEvent(
      new CustomEvent('tool-palette:offset', {
        bubbles: true,
        composed: true,
        detail: { dx, dy, link },
      })
    )
  }

  #offsetValue(selector: string): number | null {
    const input = this.querySelector<HTMLInputElement>(selector)
    if (input === null) return null
    const raw = input.value.trim()
    if (raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }

  #clearOffsetInputs(): void {
    for (const input of this.querySelectorAll<HTMLInputElement>('.offset-dx, .offset-dy')) input.value = ''
  }
}

customElements.define('tool-palette', ToolPalette)

declare global {
  interface HTMLElementTagNameMap {
    'tool-palette': ToolPalette
  }
}

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { ToolId } from '../../tools/types.js'

export interface ToolPaletteEventMap {
  'tool-palette:select': CustomEvent<{ tool: ToolId }>
}

type ToolPaletteAttribute = 'tools' | 'active'

const TOOL_LABELS: Record<ToolId, string> = { line: 'Line', rect: 'Rect', circle: 'Circle' }

// Decorative glyphs; the text label carries the accessible name.
const TOOL_ICONS: Record<ToolId, string> = {
  line: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14 14 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  rect: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  circle:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
}

const SHORTCUTS: Record<string, ToolId> = { l: 'line', r: 'rect', c: 'circle' }

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
    this.innerHTML = this.#tools
      .map(
        tool => `
          <button type="button" data-tool="${tool}" title="${TOOL_LABELS[tool]} tool (${tool.toUpperCase()[0]})">
            ${TOOL_ICONS[tool]}
            <span>${TOOL_LABELS[tool]}</span>
          </button>
        `
      )
      .join('')
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('click', this.#onClick, opts)
    this.addEventListener('keydown', this.#onButtonKey, opts)
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

  #select(tool: ToolId): void {
    this.dispatchEvent(
      new CustomEvent('tool-palette:select', {
        bubbles: true,
        composed: true,
        detail: { tool },
      })
    )
  }
}

customElements.define('tool-palette', ToolPalette)

declare global {
  interface HTMLElementTagNameMap {
    'tool-palette': ToolPalette
  }
}

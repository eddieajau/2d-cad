/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import '../pages/canvas/index.js'
import type { ToolId } from '../../tools/types.js'
import './tool-palette.js'

/**
 * Page mediator: palette selections (click or shortcut) switch the canvas
 * tool and are reflected back onto the palette's `active` attribute.
 */
export class AppShell extends HTMLElement {
  #abort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  render(): void {
    this.innerHTML = `
      <header class="topnav">
        <a class="brand" href="#/">2D CAD</a>
      </header>
      <tool-palette tools="line,rect,circle" active="line"></tool-palette>
      <main class="app-main">
        <cad-canvas></cad-canvas>
      </main>
    `
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    this.addEventListener('tool-palette:select', this.#onToolSelect, { signal: this.#abort.signal })
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
  }

  #onToolSelect = (event: Event): void => {
    const tool = (event as CustomEvent<{ tool: ToolId }>).detail.tool
    this.querySelector('cad-canvas')?.setTool(tool)
    this.querySelector('tool-palette')?.setAttribute('active', tool)
  }
}

customElements.define('app-shell', AppShell)

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}

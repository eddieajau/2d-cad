/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import '../pages/canvas/index.js'

export class AppShell extends HTMLElement {
  connectedCallback(): void {
    this.render()
  }

  render(): void {
    this.innerHTML = `
      <header class="topnav">
        <a class="brand" href="#/">2D CAD</a>
      </header>
      <main class="app-main">
        <cad-canvas></cad-canvas>
      </main>
    `
  }
}

customElements.define('app-shell', AppShell)

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}

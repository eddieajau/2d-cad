/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

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
        <p class="hello">Hello, world</p>
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

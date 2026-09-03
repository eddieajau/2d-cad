/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import '../pages/canvas/index.js'
import { createDocument, type DrawingDocument, type EntityId } from '../../document.js'
import { canRedo, canUndo, commit, createHistory, current, redo, undo, type History } from '../../history.js'
import type { SnapMode } from '../../snap.js'
import type { ToolId } from '../../tools/types.js'
import type { WorldPoint } from '../../viewport.js'
import './status-bar.js'
import './tool-palette.js'

/**
 * Page mediator: palette selections (click or shortcut) switch the canvas
 * tool and are reflected back onto the palette's `active` attribute. The
 * shell also owns the snapshot history: every commit/delete event the canvas
 * emits is appended, and ctrl/cmd+z (shift+z, ctrl/cmd+y) walk it. Pointer,
 * snap, and selection events are pushed down into the status bar readout.
 */
export class AppShell extends HTMLElement {
  #abort: AbortController | null = null
  #history: History = createHistory(createDocument())

  connectedCallback(): void {
    this.render()
    const canvas = this.querySelector('cad-canvas')
    if (canvas) this.#history = createHistory(canvas.getDocument())
    this.setupEventListeners()
    // Seed the status bar with the canvas's current snap mode.
    const bar = this.querySelector('status-bar')
    if (canvas && bar) bar.setSnap(canvas.getSnapMode())
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  render(): void {
    this.innerHTML = `
      <header class="topnav">
        <a class="brand" href="#/">2D CAD</a>
      </header>
      <tool-palette tools="select,line,rect,circle,text,dim" active="line"></tool-palette>
      <main class="app-main">
        <cad-canvas></cad-canvas>
      </main>
      <status-bar></status-bar>
    `
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('tool-palette:select', this.#onToolSelect, opts)
    this.addEventListener('cad-canvas:commit', this.#onDocChange, opts)
    this.addEventListener('cad-canvas:delete', this.#onDocChange, opts)
    this.addEventListener('cad-canvas:pointer', this.#onPointerReadout, opts)
    this.addEventListener('cad-canvas:snap', this.#onSnapChange, opts)
    this.addEventListener('cad-canvas:selection', this.#onSelectionChange, opts)
    // Shortcuts live on the document so they fire wherever focus sits.
    document.addEventListener('keydown', this.#onShortcut, opts)
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

  #onDocChange = (event: Event): void => {
    const doc = (event as CustomEvent<{ document: DrawingDocument }>).detail.document
    this.#history = commit(this.#history, doc)
  }

  #onPointerReadout = (event: Event): void => {
    const world = (event as CustomEvent<{ world: WorldPoint }>).detail.world
    this.querySelector('status-bar')?.setPosition(world)
  }

  #onSnapChange = (event: Event): void => {
    const mode = (event as CustomEvent<{ mode: SnapMode }>).detail.mode
    this.querySelector('status-bar')?.setSnap(mode)
  }

  #onSelectionChange = (event: Event): void => {
    const { id } = (event as CustomEvent<{ id: EntityId | null }>).detail
    this.querySelector('status-bar')?.setSelection(id === null ? null : { id })
  }

  #onShortcut = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
      return
    }

    const key = event.key.toLowerCase()
    if (key === 'z' && event.shiftKey) {
      this.#applyRedo(event)
    } else if (key === 'z') {
      this.#applyUndo(event)
    } else if (key === 'y') {
      this.#applyRedo(event)
    }
  }

  #applyUndo(event: KeyboardEvent): void {
    event.preventDefault()
    if (!canUndo(this.#history)) return
    this.#history = undo(this.#history)
    this.querySelector('cad-canvas')?.setDocument(current(this.#history))
  }

  #applyRedo(event: KeyboardEvent): void {
    event.preventDefault()
    if (!canRedo(this.#history)) return
    this.#history = redo(this.#history)
    this.querySelector('cad-canvas')?.setDocument(current(this.#history))
  }
}

customElements.define('app-shell', AppShell)

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}

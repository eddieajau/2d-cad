/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import '../pages/canvas/index.js'
import { createDocument, DocumentParseError, type DrawingDocument, type EntityId } from '../../document.js'
import { canRedo, canUndo, commit, createHistory, current, redo, undo, type History } from '../../history.js'
import { downloadDocument, loadLocal, openDocument, saveLocal } from '../../persistence.js'
import type { SnapMode } from '../../snap.js'
import type { ToolId } from '../../tools/types.js'
import type { WorldPoint } from '../../viewport.js'
import './status-bar.js'
import './tool-palette.js'

export type AppShellAction = 'new' | 'open' | 'save'

export interface AppShellEventMap {
  'app-shell:action': CustomEvent<AppShellAction>
}

const AUTOSAVE_DELAY_MS = 1000

/**
 * Page mediator: palette selections (click or shortcut) switch the canvas
 * tool and are reflected back onto the palette's `active` attribute. The
 * shell also owns the snapshot history: every commit/delete event the canvas
 * emits is appended, and ctrl/cmd+z (shift+z, ctrl/cmd+y) walk it. Pointer,
 * snap, and selection events are pushed down into the status bar readout.
 * The shell is also the persistence boundary: document changes autosave to
 * localStorage (debounced), and the New/Open/Save actions row round-trips
 * documents through files. Elements stay persistence-free.
 */
export class AppShell extends HTMLElement {
  #abort: AbortController | null = null
  #history: History = createHistory(createDocument())
  #autosaveTimer: ReturnType<typeof setTimeout> | null = null
  #pendingSave = false

  connectedCallback(): void {
    this.render()
    const canvas = this.querySelector('cad-canvas')
    if (canvas) {
      // Restore-on-load: the autosaved drawing replaces the empty document.
      // Corrupt stored data is ignored; the next autosave overwrites it.
      const saved = this.#loadSavedDocument()
      if (saved === null) {
        this.#history = createHistory(canvas.getDocument())
      } else {
        this.#history = createHistory(saved)
        canvas.setDocument(saved)
      }
    }
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
        <div class="actions" role="toolbar" aria-label="Document actions">
          <button type="button" data-action="new">New</button>
          <button type="button" data-action="open">Open</button>
          <button type="button" data-action="save">Save</button>
          <input class="file-input" type="file" accept="application/json,.json" hidden />
        </div>
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

    this.querySelector('.actions')?.addEventListener('click', this.#onActionClick, opts)
    this.addEventListener('app-shell:action', this.#onAction, opts)
    this.querySelector<HTMLInputElement>('.file-input')?.addEventListener('change', this.#onFileChange, opts)
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
    // A pending autosave flushes now so teardown never loses work.
    if (this.#autosaveTimer !== null) {
      clearTimeout(this.#autosaveTimer)
      this.#autosaveTimer = null
      if (this.#pendingSave) saveLocal(current(this.#history))
      this.#pendingSave = false
    }
  }

  #onActionClick = (event: Event): void => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('button[data-action]')
    if (button === null || button === undefined) return
    const action = button.dataset.action
    if (action === 'new' || action === 'open' || action === 'save') {
      this.dispatchEvent(
        new CustomEvent<AppShellAction>('app-shell:action', {
          bubbles: true,
          composed: true,
          detail: action,
        })
      )
    }
  }

  #onAction = (event: Event): void => {
    const action = (event as CustomEvent<AppShellAction>).detail
    if (action === 'new') this.#newDocument()
    else if (action === 'open') this.querySelector<HTMLInputElement>('.file-input')?.click()
    else {
      const doc = this.querySelector('cad-canvas')?.getDocument()
      if (doc) downloadDocument(doc)
    }
  }

  #newDocument(): void {
    const canvas = this.querySelector('cad-canvas')
    if (!canvas) return
    // Only un-persisted changes can be lost; ask before discarding them.
    if (this.#pendingSave && !window.confirm('Discard unsaved changes?')) return
    const doc = createDocument()
    this.#history = createHistory(doc)
    canvas.setDocument(doc)
    this.#persistNow(doc)
  }

  #onFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const doc = await openDocument(file)
      this.#history = createHistory(doc)
      this.querySelector('cad-canvas')?.setDocument(doc)
      this.#persistNow(doc)
    } catch (error) {
      const reason = error instanceof DocumentParseError ? error.message : 'the file could not be read'
      window.alert(`Could not open "${file.name}": ${reason}`)
    }
  }

  #loadSavedDocument(): DrawingDocument | null {
    try {
      return loadLocal()
    } catch {
      return null
    }
  }

  /** Save immediately and cancel any queued autosave. */
  #persistNow(doc: DrawingDocument): void {
    if (this.#autosaveTimer !== null) {
      clearTimeout(this.#autosaveTimer)
      this.#autosaveTimer = null
    }
    this.#pendingSave = false
    saveLocal(doc)
  }

  /** Debounced localStorage autosave after each document change. */
  #scheduleAutosave(doc: DrawingDocument): void {
    this.#pendingSave = true
    if (this.#autosaveTimer !== null) clearTimeout(this.#autosaveTimer)
    this.#autosaveTimer = setTimeout(() => {
      this.#autosaveTimer = null
      this.#pendingSave = false
      saveLocal(doc)
    }, AUTOSAVE_DELAY_MS)
  }

  #onToolSelect = (event: Event): void => {
    const tool = (event as CustomEvent<{ tool: ToolId }>).detail.tool
    this.querySelector('cad-canvas')?.setTool(tool)
    this.querySelector('tool-palette')?.setAttribute('active', tool)
  }

  #onDocChange = (event: Event): void => {
    const doc = (event as CustomEvent<{ document: DrawingDocument }>).detail.document
    this.#history = commit(this.#history, doc)
    this.#scheduleAutosave(doc)
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
    this.#scheduleAutosave(current(this.#history))
  }

  #applyRedo(event: KeyboardEvent): void {
    event.preventDefault()
    if (!canRedo(this.#history)) return
    this.#history = redo(this.#history)
    this.querySelector('cad-canvas')?.setDocument(current(this.#history))
    this.#scheduleAutosave(current(this.#history))
  }
}

customElements.define('app-shell', AppShell)

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}

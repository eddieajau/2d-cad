/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import '../pages/canvas/index.js'
import {
  addLayer,
  createDocument,
  DocumentParseError,
  getEntity,
  isEditable,
  layerById,
  removeLayer,
  setActiveLayer,
  updateEntity,
  updateLayer,
  DEFAULT_COLOUR,
  type DrawingDocument,
  type EntityId,
} from '../../document.js'
import { canRedo, canUndo, commit, createHistory, current, redo, undo, type History } from '../../history.js'
import { downloadDocument, loadLocal, openDocument, saveLocal } from '../../persistence.js'
import type { SnapMode } from '../../snap.js'
import type { ToolId } from '../../tools/types.js'
import type { WorldPoint } from '../../viewport.js'
import './entity-colour.js'
import type { EntityColourChange } from './entity-colour.js'
import './layer-panel.js'
import type { LayerPanelChange } from './layer-panel.js'
import './status-bar.js'
import './tool-palette.js'

export type AppShellAction = 'new' | 'open' | 'save' | 'fit'

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
 * Layer-panel ops map onto the model's layer functions and entity-colour
 * ops onto `updateEntity`, each through the same history commit, so layer
 * and colour changes are undoable like any edit. The shell is
 * also the persistence boundary: document changes autosave to
 * localStorage (debounced), and the New/Open/Save/Fit actions row
 * round-trips documents through files (Fit frames the drawing on screen).
 * Elements stay persistence-free.
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
    // Seed the status bar with the canvas's current snap mode, and the
    // layer panel with the restored document's layer table.
    const bar = this.querySelector('status-bar')
    if (canvas && bar) bar.setSnap(canvas.getSnapMode())
    this.#syncLayerPanel()
    this.#syncEntityColour()
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
          <button type="button" data-action="fit" title="Fit drawing to view (F)">Fit</button>
          <input class="file-input" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      <main class="app-main">
        <cad-canvas></cad-canvas>
      </main>
      <aside class="side-panel" role="complementary" aria-label="Panels">
        <section class="panel-section">
          <h2>Tools</h2>
          <tool-palette tools="select,line,rect,circle,text,dim,wall,offset" active="line"></tool-palette>
        </section>
        <section class="panel-section">
          <h2>Colour</h2>
          <entity-colour></entity-colour>
        </section>
        <section class="panel-section">
          <h2>Layers</h2>
          <layer-panel></layer-panel>
        </section>
      </aside>
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
    this.addEventListener('tool-palette:thickness', this.#onThicknessChange, opts)
    this.addEventListener('tool-palette:offset', this.#onOffsetCommit, opts)
    this.addEventListener('tool-palette:offset-entry', this.#onOffsetEntry, opts)
    this.addEventListener('tool-palette:escape', this.#onOffsetEscape, opts)
    this.addEventListener('layer-panel:change', this.#onLayerChange, opts)
    this.addEventListener('entity-colour:change', this.#onEntityColour, opts)
    this.addEventListener('cad-canvas:commit', this.#onDocChange, opts)
    this.addEventListener('cad-canvas:delete', this.#onDocChange, opts)
    this.addEventListener('cad-canvas:blocked', this.#onBlocked, opts)
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
    if (action === 'new' || action === 'open' || action === 'save' || action === 'fit') {
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
    else if (action === 'fit') this.querySelector('cad-canvas')?.fitToExtents(current(this.#history))
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
    this.#syncLayerPanel()
  }

  #onFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const doc = await openDocument(file)
      this.#history = createHistory(doc)
      const canvas = this.querySelector('cad-canvas')
      if (canvas) {
        canvas.setDocument(doc)
        // An opened file lands framed — no hunt for the missing building.
        canvas.fitToExtents(doc)
      }
      this.#persistNow(doc)
      this.#syncLayerPanel()
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

  /** Wall thickness from the palette input, pushed into the canvas tool. */
  #onThicknessChange = (event: Event): void => {
    const { thickness } = (event as CustomEvent<{ thickness: number }>).detail
    this.querySelector('cad-canvas')?.setWallThickness(thickness)
  }

  /** Typed dx/dy (plus Link state) from the palette, pushed into the canvas tool. */
  #onOffsetCommit = (event: Event): void => {
    const { dx, dy, link } = (event as CustomEvent<{ dx: number; dy: number; link: boolean }>).detail
    this.querySelector('cad-canvas')?.commitOffset(dx, dy, link)
  }

  /** Live dx/dy entry from the palette, pushed into the canvas tool. */
  #onOffsetEntry = (event: Event): void => {
    const { dx, dy } = (event as CustomEvent<{ dx: number | null; dy: number | null }>).detail
    this.querySelector('cad-canvas')?.setOffsetEntry(dx, dy)
  }

  /** Offset entry cancelled — focus returns to the canvas so Escape unwinds the flow. */
  #onOffsetEscape = (): void => {
    this.querySelector('cad-canvas')?.focus()
  }

  /** Push the history head's layer table down into the panel. */
  #syncLayerPanel(): void {
    const doc = current(this.#history)
    this.querySelector('layer-panel')?.setLayers(doc.layers, doc.activeLayerId)
  }

  /** Push the selected entity (plus its layer colour) down into the panel. */
  #syncEntityColour(): void {
    const doc = current(this.#history)
    const id = this.querySelector('cad-canvas')?.getSelection() ?? null
    const entity = id === null ? undefined : getEntity(doc, id)
    const layerColour = entity !== undefined ? layerById(doc, entity.layerId)?.colour : undefined
    this.querySelector('entity-colour')?.setSelection(entity ?? null, layerColour ?? DEFAULT_COLOUR)
  }

  /**
   * Map a panel op onto the model's layer functions and commit it through
   * the history like any other edit — layer changes are undoable.
   */
  #onLayerChange = (event: Event): void => {
    const { op, layerId, value } = (event as CustomEvent<LayerPanelChange>).detail
    const canvas = this.querySelector('cad-canvas')
    const doc = canvas?.getDocument()
    if (canvas === null || canvas === undefined || doc === undefined) return

    let next: DrawingDocument
    switch (op) {
      case 'add':
        next = addLayer(doc, typeof value === 'string' && value.trim() !== '' ? value.trim() : 'Layer')
        break
      case 'rename':
        if (typeof value !== 'string' || value.trim() === '') return
        next = updateLayer(doc, layerId, { name: value.trim() })
        break
      case 'visibility':
        next = updateLayer(doc, layerId, { visible: value === true })
        break
      case 'lock':
        next = updateLayer(doc, layerId, { locked: value === true })
        break
      case 'colour':
        if (typeof value !== 'string' || value === '') return
        next = updateLayer(doc, layerId, { colour: value })
        break
      case 'activate':
        next = setActiveLayer(doc, layerId)
        break
      case 'remove':
        next = removeLayer(doc, layerId)
        break
    }
    if (next === doc) return

    this.#history = commit(this.#history, next)
    canvas.setDocument(next)
    this.#scheduleAutosave(next)
    this.#syncLayerPanel()
    this.#syncEntityColour()
  }

  /**
   * Map an entity-colour op onto `updateEntity` through the same history
   * commit — recolouring is undoable like any other edit.
   */
  #onEntityColour = (event: Event): void => {
    const { id, colour } = (event as CustomEvent<EntityColourChange>).detail
    const canvas = this.querySelector('cad-canvas')
    const doc = canvas?.getDocument()
    if (canvas === null || canvas === undefined || doc === undefined) return
    const entity = getEntity(doc, id)
    if (entity === undefined) return
    // Colouring is an entity edit: locked layers are refused like any other.
    if (!isEditable(doc, entity)) {
      this.querySelector('status-bar')?.setHint('That layer is locked')
      return
    }
    // Clearing a colour that is not set would only churn the history.
    if (colour === null && entity.colour === undefined) return
    const next = updateEntity(doc, id, colour === null ? { colour: undefined } : { colour })
    this.#history = commit(this.#history, next)
    canvas.setDocument(next)
    this.#scheduleAutosave(next)
    this.#syncEntityColour()
  }

  #onBlocked = (event: Event): void => {
    const { reason } = (event as CustomEvent<{ reason: 'locked' }>).detail
    if (reason === 'locked') this.querySelector('status-bar')?.setHint('That layer is locked')
  }

  #onDocChange = (event: Event): void => {
    const doc = (event as CustomEvent<{ document: DrawingDocument }>).detail.document
    this.#history = commit(this.#history, doc)
    this.#scheduleAutosave(doc)
    this.#syncLayerPanel()
    this.#syncEntityColour()
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
    const entity = id === null ? undefined : getEntity(current(this.#history), id)
    this.querySelector('status-bar')?.setSelection(
      id === null
        ? null
        : {
            id,
            thickness: entity?.type === 'wall' ? entity.thickness : undefined,
            linked: entity !== undefined && 'ref' in entity && entity.ref !== undefined,
          }
    )
    // Any new interaction supersedes a refusal hint.
    this.querySelector('status-bar')?.setHint(null)
    this.#syncEntityColour()
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
    // A history walk can restore a different layer table.
    this.#syncLayerPanel()
    this.#syncEntityColour()
  }

  #applyRedo(event: KeyboardEvent): void {
    event.preventDefault()
    if (!canRedo(this.#history)) return
    this.#history = redo(this.#history)
    this.querySelector('cad-canvas')?.setDocument(current(this.#history))
    this.#scheduleAutosave(current(this.#history))
    this.#syncLayerPanel()
    this.#syncEntityColour()
  }
}

customElements.define('app-shell', AppShell)

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell
  }
}

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import {
  addEntity,
  createDocument,
  getEntity,
  isEditable,
  removeEntity,
  resolveDocument,
  resolveEntity,
  updateEntity,
  type DrawingDocument,
  type Entity,
  type EntityId,
} from '../../../document.js'
import { anchorPoint } from '../../../geometry.js'
import { hitTest } from '../../../hit-test.js'
import { gridInterval, renderScene } from '../../../render.js'
import { resolveSnapGrid, snapToGrid, type SnapMode } from '../../../snap.js'
import { CircleTool } from '../../../tools/circle.js'
import { DimTool } from '../../../tools/dim.js'
import { LineTool } from '../../../tools/line.js'
import { OffsetTool } from '../../../tools/offset.js'
import { RectTool } from '../../../tools/rect.js'
import { SELECT_TOLERANCE_PX, SelectTool, type SelectToolState } from '../../../tools/select.js'
import { TextTool, TEXT_DEFAULT_SIZE, type TextToolState } from '../../../tools/text.js'
import type { Tool, ToolCommit, ToolContext, ToolId, ToolState } from '../../../tools/types.js'
import { WallTool } from '../../../tools/wall.js'
import { screenToWorld, worldToScreen, panBy, zoomAt, type Viewport, type WorldPoint } from '../../../viewport.js'

export interface CadCanvasEventMap {
  'cad-canvas:pointer': CustomEvent<{ world: { x: number; y: number }; buttons: number }>
  'cad-canvas:commit': CustomEvent<{ entity: Entity; document: DrawingDocument }>
  'cad-canvas:delete': CustomEvent<{ entity: Entity; document: DrawingDocument }>
  'cad-canvas:selection': CustomEvent<{ id: EntityId | null }>
  'cad-canvas:snap': CustomEvent<{ mode: SnapMode }>
  /** An edit was refused — currently only by a locked layer. */
  'cad-canvas:blocked': CustomEvent<{ reason: 'locked' }>
}

/** The available tool set. Tools are stateless, so instances are shared. */
const TOOLS: Record<ToolId, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  rect: new RectTool(),
  circle: new CircleTool(),
  text: new TextTool(),
  dim: new DimTool(),
  wall: new WallTool(),
  offset: new OffsetTool(),
}

const MAX_DEVICE_PIXEL_RATIO = 2

/** Wheel-zoom sensitivity; trackpad pinch (ctrlKey) uses the finer one. */
const WHEEL_ZOOM_STRENGTH = 0.0015
const PINCH_ZOOM_STRENGTH = 0.0005

const DEFAULT_THEME = {
  gridMinor: '#1f243014',
  gridMajor: '#1f243033',
  gridAxis: '#1f243066',
  gridLabel: '#66707f',
  ink: '#1f2430',
  selection: '#b45309',
}

export class CadCanvas extends HTMLElement {
  #viewport: Viewport = { offsetX: 0, offsetY: 0, scale: 1 }
  #centred = false
  #canvas: HTMLCanvasElement | null = null
  #abort: AbortController | null = null
  #resizeObserver: ResizeObserver | null = null
  #document: DrawingDocument = createDocument()
  #tool: Tool = TOOLS.line
  #toolState: ToolState = this.#tool.init()
  #selectedId: EntityId | null = null
  #snapMode: SnapMode = 'off'
  #wallThickness = 270
  #dirty = false
  #rafId = 0
  #textInput: HTMLInputElement | null = null
  #textAbort: AbortController | null = null
  #spaceHeld = false
  #panLast: { x: number; y: number } | null = null

  constructor() {
    super()
    this.setAttribute('role', 'application')
    this.setAttribute('aria-label', 'Drawing canvas')
    this.tabIndex = 0
  }

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
    this.syncCanvasSize()
    this.#startLoop()
    this.invalidate()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  render(): void {
    if (this.#canvas !== null) return
    this.innerHTML = '<canvas class="surface"></canvas>'
    this.#canvas = this.querySelector('canvas')
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('pointerdown', this.#onPointer, opts)
    this.addEventListener('pointermove', this.#onPointer, opts)
    this.addEventListener('pointerup', this.#onPointer, opts)
    this.addEventListener('wheel', this.#onWheel, { ...opts, passive: false })
    this.addEventListener('keydown', this.#onKeyDown, opts)
    this.addEventListener('keyup', this.#onKeyUp, opts)

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.syncCanvasSize())
      this.#resizeObserver.observe(this)
    }
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#closeTextInput()
    cancelAnimationFrame(this.#rafId)
    this.#spaceHeld = false
    this.#panLast = null
    this.style.cursor = ''
  }

  #startLoop(): void {
    cancelAnimationFrame(this.#rafId)
    this.#rafId = requestAnimationFrame(this.#tick)
  }

  #tick = (): void => {
    if (this.#dirty) {
      this.#dirty = false
      this.#draw()
    }
    this.#rafId = requestAnimationFrame(this.#tick)
  }

  /** Mark the scene for redraw on the next animation frame. */
  invalidate(): void {
    this.#dirty = true
  }

  /** Parent pushes the document down; never pull it from here. */
  setDocument(doc: DrawingDocument): void {
    this.#document = doc
    // A history walk can remove the selected entity — drop a stale selection.
    if (this.#selectedId !== null && getEntity(doc, this.#selectedId) === undefined) {
      this.#setSelection(null)
    }
    this.invalidate()
  }

  getDocument(): DrawingDocument {
    return this.#document
  }

  /** Switch the active tool; any in-progress gesture or selection is reset. */
  setTool(id: ToolId): void {
    const tool = TOOLS[id]
    if (tool === undefined || tool === this.#tool) return
    this.#closeTextInput()
    this.#tool = tool
    this.#toolState = tool.init()
    this.#setSelection(null)
    this.invalidate()
  }

  getTool(): ToolId {
    return this.#tool.id
  }

  /** Wall band thickness (mm) committed by the wall tool; palette page state. */
  setWallThickness(thickness: number): void {
    if (!Number.isFinite(thickness) || thickness < 0 || thickness === this.#wallThickness) return
    this.#wallThickness = thickness
    this.invalidate()
  }

  getWallThickness(): number {
    return this.#wallThickness
  }

  /**
   * Typed dx/dy (mm) from the palette's offset row, committed on Enter.
   * The active tool must implement the numeric-entry hook; others ignore
   * it. `link` is the palette's Link toggle — the commit may then attach a
   * positional reference instead of baking coordinates.
   */
  commitOffset(dx: number, dy: number, link = false): void {
    const result = this.#tool.onOffsetCommit?.(this.#toolState, dx, dy, link)
    if (!result) return
    this.#toolState = result.state
    if (result.commit) this.#applyCommit(result.commit)
    if (result.select !== undefined) this.#setSelection(result.select)
    this.focus()
    this.invalidate()
  }

  /**
   * Live dx/dy from the palette's offset row (`null` when a field is empty
   * or invalid): tools with the live-entry hook pin their preview to the
   * typed values while both hold.
   */
  setOffsetEntry(dx: number | null, dy: number | null): void {
    const next = this.#tool.onOffsetEntry?.(this.#toolState, dx, dy)
    if (next === undefined || next === this.#toolState) return
    this.#toolState = next
    this.invalidate()
  }

  getSelection(): EntityId | null {
    return this.#selectedId
  }

  /** Current snap mode; toggled with `G` and broadcast as `cad-canvas:snap`. */
  getSnapMode(): SnapMode {
    return this.#snapMode
  }

  #draw(): void {
    const canvas = this.#canvas
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const style = getComputedStyle(this)
    const cssVar = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback
    // References apply here: the scene draws the resolved world.
    renderScene(ctx, resolveDocument(this.#document), this.#viewport, {
      width: this.clientWidth,
      height: this.clientHeight,
      preview: this.#toolState.preview,
      theme: {
        gridMinor: cssVar('--canvas-grid-minor', DEFAULT_THEME.gridMinor),
        gridMajor: cssVar('--canvas-grid-major', DEFAULT_THEME.gridMajor),
        gridAxis: cssVar('--canvas-grid-axis', DEFAULT_THEME.gridAxis),
        gridLabel: cssVar('--canvas-grid-label', DEFAULT_THEME.gridLabel),
        ink: cssVar('--canvas-ink', DEFAULT_THEME.ink),
        selection: cssVar('--canvas-selection', DEFAULT_THEME.selection),
      },
      selectedId: this.#selectedId,
    })
  }

  /** Recompute the backing store size from the host's client size. */
  syncCanvasSize(): void {
    const canvas = this.#canvas
    if (canvas === null) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
    canvas.width = Math.round(this.clientWidth * dpr)
    canvas.height = Math.round(this.clientHeight * dpr)
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.invalidate()
    if (!this.#centred && this.clientWidth > 0 && this.clientHeight > 0) {
      // Centre the world origin on first sight; pan/zoom then takes over.
      this.#viewport = panBy(this.#viewport, this.clientWidth / 2, this.clientHeight / 2)
      this.#centred = true
    }
  }

  getViewport(): Viewport {
    return this.#viewport
  }

  setViewport(viewport: Viewport): void {
    this.#viewport = viewport
    this.invalidate()
  }

  #onPointer = (event: PointerEvent): void => {
    const canvas = this.#canvas
    if (canvas === null) return
    if (event.type === 'pointerdown') {
      canvas.setPointerCapture(event.pointerId)
    } else if (event.type === 'pointerup') {
      canvas.releasePointerCapture(event.pointerId)
    }

    // Pan gesture (middle-drag or space+drag) bypasses the active tool
    // entirely: pointer deltas feed panBy in screen px — no commits, no
    // selection, no history.
    if (event.type === 'pointerdown' && (event.button === 1 || (event.button === 0 && this.#spaceHeld))) {
      this.#panLast = { x: event.clientX, y: event.clientY }
      this.style.cursor = 'grabbing'
      this.invalidate()
      return
    }
    if (this.#panLast !== null) {
      if (event.type === 'pointermove') {
        this.#viewport = panBy(this.#viewport, event.clientX - this.#panLast.x, event.clientY - this.#panLast.y)
        this.#panLast = { x: event.clientX, y: event.clientY }
        this.invalidate()
        return
      }
      if (event.type === 'pointerup') {
        this.#panLast = null
        this.style.cursor = this.#spaceHeld ? 'grab' : ''
        this.invalidate()
        return
      }
    }

    const rect = canvas.getBoundingClientRect()
    const raw = screenToWorld(this.#viewport, event.clientX - rect.left, event.clientY - rect.top)

    // In select mode a click picks the nearest entity; the hit test keeps
    // the raw pointer so selection feels precise even when snapping is on.
    // Everything downstream sees the resolved world: refs applied, so
    // linked entities are picked where they render.
    const resolved = resolveDocument(this.#document)
    if (event.type === 'pointerdown' && this.#tool.id === 'select') {
      const tolerance = SELECT_TOLERANCE_PX / this.#viewport.scale
      const hit = hitTest(resolved, raw, tolerance)
      this.#setSelection(hit?.id ?? null)
    }

    // Snapping applies after screenToWorld and before tools see the point;
    // the grid matches the rendered minor grid so drawing lands on lines.
    const grid = resolveSnapGrid(this.#snapMode, gridInterval(this.#viewport.scale).minor)
    const world = grid === null ? raw : snapToGrid(raw, grid)

    // Route the gesture through the active tool first; the pointer event
    // still bubbles outward as `cad-canvas:pointer` for the mediator.
    const ctx: ToolContext = { doc: resolved, viewport: this.#viewport, wallThickness: this.#wallThickness }
    if (event.type === 'pointerdown') {
      this.#toolState = this.#tool.onPointerDown(ctx, this.#toolState, world, event)
    } else if (event.type === 'pointermove') {
      this.#toolState = this.#tool.onPointerMove(ctx, this.#toolState, world, event)
    } else if (event.type === 'pointerup') {
      const result = this.#tool.onPointerUp(ctx, this.#toolState, world, event)
      this.#toolState = result.state
      if (result.commit) this.#applyCommit(result.commit)
      if (result.select !== undefined) this.#setSelection(result.select)
    }
    this.#syncTextInput()
    this.invalidate()

    this.dispatchEvent(
      new CustomEvent('cad-canvas:pointer', {
        bubbles: true,
        composed: true,
        detail: { world, buttons: event.buttons },
      })
    )
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    // The inline text editor handles its own keys (Enter/Escape); canvas
    // shortcuts like `G` must not fire while the user is typing.
    if (event.target instanceof HTMLInputElement) return

    // Space arms the pan gesture; the cursor announces it.
    if (event.key === ' ') {
      event.preventDefault()
      this.#spaceHeld = true
      if (this.#panLast === null) this.style.cursor = 'grab'
      return
    }

    if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.#toggleSnap()
      return
    }

    if (this.#tool.id === 'select') {
      // Escape cancels an in-progress drag (zero document delta — the
      // document was never touched) or, when idle, clears the selection.
      if (event.key === 'Escape') {
        const wasDragging = (this.#toolState as SelectToolState).drag !== undefined
        this.#toolState = this.#tool.onKey?.(this.#toolState, event) ?? this.#tool.init()
        if (!wasDragging) this.#setSelection(null)
        this.invalidate()
        return
      }
      if (this.#selectedId !== null && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        this.#deleteSelected()
        return
      }
    }

    const next = this.#tool.onKey?.(this.#toolState, event)
    if (next === undefined || next === this.#toolState) return
    this.#toolState = next
    this.invalidate()
  }

  #onKeyUp = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement) return
    if (event.key === ' ') {
      this.#spaceHeld = false
      // An in-flight pan keeps `grabbing` until the pointer is released.
      if (this.#panLast === null) this.style.cursor = ''
    }
  }

  #toggleSnap(): void {
    this.#snapMode = this.#snapMode === 'off' ? 'grid' : 'off'
    this.dispatchEvent(
      new CustomEvent('cad-canvas:snap', {
        bubbles: true,
        composed: true,
        detail: { mode: this.#snapMode },
      })
    )
  }

  #emitBlocked(reason: 'locked'): void {
    this.dispatchEvent(
      new CustomEvent('cad-canvas:blocked', {
        bubbles: true,
        composed: true,
        detail: { reason },
      })
    )
  }

  #setSelection(id: EntityId | null): void {
    if (id === this.#selectedId) return
    this.#selectedId = id
    this.invalidate()
    this.dispatchEvent(
      new CustomEvent('cad-canvas:selection', {
        bubbles: true,
        composed: true,
        detail: { id },
      })
    )
  }

  #deleteSelected(): void {
    const id = this.#selectedId
    if (id === null) return
    const entity = getEntity(this.#document, id)
    // Edits on locked layers are refused at the edit boundary.
    if (entity !== undefined && !isEditable(this.#document, entity)) {
      this.#emitBlocked('locked')
      return
    }
    // A disappearing selection kills any drag referencing it.
    this.#toolState = this.#tool.init()
    this.#setSelection(null)
    if (!entity) return
    this.#document = removeEntity(this.#document, id)
    this.dispatchEvent(
      new CustomEvent('cad-canvas:delete', {
        bubbles: true,
        composed: true,
        detail: { entity, document: this.#document },
      })
    )
    this.invalidate()
  }

  /**
   * A tool commits coordinates from the resolved world; for a linked entity
   * the same visual move is expressed through the reference — the committed
   * coordinates land on the stored entity and dx/dy absorb the difference,
   * so the link survives the edit.
   */
  #withMovedRef(stored: Entity | undefined, committed: Entity): Entity {
    if (stored === undefined || !('ref' in stored) || stored.ref === undefined) return committed
    if (!('ref' in committed)) return committed
    const ref = stored.ref
    const from = anchorPoint(resolveEntity(this.#document, stored), ref.corner)
    const to = anchorPoint(committed, ref.corner)
    if (from === null || to === null) return committed
    return { ...committed, ref: { ...ref, dx: ref.dx + to.x - from.x, dy: ref.dy + to.y - from.y } }
  }

  #applyCommit(commit: ToolCommit): void {
    if (commit.kind === 'add') {
      this.#document = addEntity(this.#document, commit.entity)
    } else {
      // Edits on locked layers are refused at the commit boundary (the
      // hit test already keeps drags off locked entities).
      const existing = getEntity(this.#document, commit.entity.id)
      if (existing !== undefined && !isEditable(this.#document, existing)) {
        this.#emitBlocked('locked')
        return
      }
      this.#document = updateEntity(this.#document, commit.entity.id, this.#withMovedRef(existing, commit.entity))
    }
    // The stored entity carries the applied layer for adds.
    const entity = getEntity(this.#document, commit.entity.id)!
    this.dispatchEvent(
      new CustomEvent('cad-canvas:commit', {
        bubbles: true,
        composed: true,
        detail: { entity, document: this.#document },
      })
    )
  }

  /**
   * Inline text entry: keep the `<input>` in step with the text tool's
   * placing anchor. Light DOM, positioned over the canvas at the anchor's
   * screen position; commit on Enter/blur, cancel on Escape, and focus
   * always returns to the canvas.
   */
  #syncTextInput(): void {
    const placing = this.#tool.id === 'text' ? (this.#toolState as TextToolState).placing : undefined
    if (placing && this.#textInput === null) this.#openTextInput(placing)
    if (!placing && this.#textInput !== null) this.#closeTextInput()
  }

  #openTextInput(at: WorldPoint): void {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'text-entry'
    input.setAttribute('aria-label', 'Text content')
    const pos = worldToScreen(this.#viewport, at.x, at.y)
    input.style.left = `${pos.sx}px`
    input.style.top = `${pos.sy}px`
    input.style.fontSize = `${TEXT_DEFAULT_SIZE * this.#viewport.scale}px`
    this.appendChild(input)
    this.#textInput = input

    this.#textAbort = new AbortController()
    const opts = { signal: this.#textAbort.signal }
    input.addEventListener('keydown', this.#onTextKey, opts)
    input.addEventListener('blur', this.#onTextBlur, opts)
    input.focus()
  }

  /** Detach the editor; listeners are aborted so blur cannot double-commit. */
  #closeTextInput(): void {
    this.#textAbort?.abort()
    this.#textAbort = null
    this.#textInput?.remove()
    this.#textInput = null
  }

  #onTextKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#commitTextInput(this.#textInput?.value ?? '')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      const state = this.#toolState
      this.#closeTextInput()
      this.#toolState = this.#tool.onTextCommit?.(state, null)?.state ?? this.#tool.init()
      this.focus()
      this.invalidate()
    }
  }

  #onTextBlur = (): void => {
    // Removing the input aborts its listeners first, so programmatic closes
    // never re-enter here.
    const input = this.#textInput
    if (input === null) return
    this.#commitTextInput(input.value)
  }

  #commitTextInput(value: string): void {
    const state = this.#toolState
    this.#closeTextInput()
    const result = this.#tool.onTextCommit?.(state, value)
    this.#toolState = result ? result.state : this.#tool.init()
    if (result?.commit) this.#applyCommit(result.commit)
    this.focus()
    this.invalidate()
  }

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    // Zoom anchors to the viewport centre — magnify what you're looking at,
    // regardless of where the cursor sits. Trackpad pinch (wheel with
    // ctrlKey) shares the centre anchor with a finer factor.
    const strength = event.ctrlKey ? PINCH_ZOOM_STRENGTH : WHEEL_ZOOM_STRENGTH
    const factor = Math.exp(-event.deltaY * strength)
    this.#viewport = zoomAt(this.#viewport, factor, this.clientWidth / 2, this.clientHeight / 2)
    this.invalidate()
  }
}

customElements.define('cad-canvas', CadCanvas)

declare global {
  interface HTMLElementTagNameMap {
    'cad-canvas': CadCanvas
  }
}

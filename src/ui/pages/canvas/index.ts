/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { addEntity, createDocument, type DrawingDocument, type Entity } from '../../../document.js'
import { renderScene } from '../../../render.js'
import { CircleTool } from '../../../tools/circle.js'
import { LineTool } from '../../../tools/line.js'
import { RectTool } from '../../../tools/rect.js'
import type { Tool, ToolContext, ToolId, ToolState } from '../../../tools/types.js'
import { panBy, screenToWorld, zoomAt, type Viewport } from '../../../viewport.js'

export interface CadCanvasEventMap {
  'cad-canvas:pointer': CustomEvent<{ world: { x: number; y: number }; buttons: number }>
  'cad-canvas:commit': CustomEvent<{ entity: Entity; document: DrawingDocument }>
}

/** The available tool set. Tools are stateless, so instances are shared. */
const TOOLS: Record<ToolId, Tool> = {
  line: new LineTool(),
  rect: new RectTool(),
  circle: new CircleTool(),
}

const MAX_DEVICE_PIXEL_RATIO = 2

const DEFAULT_THEME = {
  gridMinor: '#8a93a3',
  gridMajor: '#66707f',
  ink: '#1f2430',
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
  #dirty = false
  #rafId = 0

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
    cancelAnimationFrame(this.#rafId)
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
    this.invalidate()
  }

  getDocument(): DrawingDocument {
    return this.#document
  }

  /** Switch the active tool; any in-progress gesture is reset. */
  setTool(id: ToolId): void {
    const tool = TOOLS[id]
    if (tool === undefined || tool === this.#tool) return
    this.#tool = tool
    this.#toolState = tool.init()
    this.invalidate()
  }

  getTool(): ToolId {
    return this.#tool.id
  }

  #draw(): void {
    const canvas = this.#canvas
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const style = getComputedStyle(this)
    const cssVar = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback
    renderScene(ctx, this.#document, this.#viewport, {
      width: this.clientWidth,
      height: this.clientHeight,
      preview: this.#toolState.preview,
      theme: {
        gridMinor: cssVar('--canvas-grid-minor', DEFAULT_THEME.gridMinor),
        gridMajor: cssVar('--canvas-grid-major', DEFAULT_THEME.gridMajor),
        ink: cssVar('--canvas-ink', DEFAULT_THEME.ink),
      },
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
    const rect = canvas.getBoundingClientRect()
    const world = screenToWorld(this.#viewport, event.clientX - rect.left, event.clientY - rect.top)

    // Route the gesture through the active tool first; the pointer event
    // still bubbles outward as `cad-canvas:pointer` for the mediator.
    const ctx: ToolContext = { doc: this.#document, viewport: this.#viewport }
    if (event.type === 'pointerdown') {
      this.#toolState = this.#tool.onPointerDown(ctx, this.#toolState, world, event)
    } else if (event.type === 'pointermove') {
      this.#toolState = this.#tool.onPointerMove(ctx, this.#toolState, world, event)
    } else if (event.type === 'pointerup') {
      const result = this.#tool.onPointerUp(ctx, this.#toolState, world, event)
      this.#toolState = result.state
      if (result.commit) this.#commit(result.commit)
    }
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
    const next = this.#tool.onKey?.(this.#toolState, event)
    if (next === undefined || next === this.#toolState) return
    this.#toolState = next
    this.invalidate()
  }

  #commit(entity: Entity): void {
    this.#document = addEntity(this.#document, entity)
    this.dispatchEvent(
      new CustomEvent('cad-canvas:commit', {
        bubbles: true,
        composed: true,
        detail: { entity, document: this.#document },
      })
    )
  }

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const canvas = this.#canvas
    if (canvas === null) return
    const rect = canvas.getBoundingClientRect()
    const factor = Math.exp(-event.deltaY * 0.0015)
    this.#viewport = zoomAt(this.#viewport, factor, event.clientX - rect.left, event.clientY - rect.top)
    this.invalidate()
  }
}

customElements.define('cad-canvas', CadCanvas)

declare global {
  interface HTMLElementTagNameMap {
    'cad-canvas': CadCanvas
  }
}

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { panBy, screenToWorld, zoomAt, type Viewport } from '../../../viewport.js'

export interface CadCanvasEventMap {
  'cad-canvas:pointer': CustomEvent<{ world: { x: number; y: number }; buttons: number }>
}

const MAX_DEVICE_PIXEL_RATIO = 2

export class CadCanvas extends HTMLElement {
  #viewport: Viewport = { offsetX: 0, offsetY: 0, scale: 1 }
  #centred = false
  #canvas: HTMLCanvasElement | null = null
  #abort: AbortController | null = null
  #resizeObserver: ResizeObserver | null = null

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
  }

  /** Recompute the backing store size from the host's client size. */
  syncCanvasSize(): void {
    const canvas = this.#canvas
    if (canvas === null) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
    canvas.width = Math.round(this.clientWidth * dpr)
    canvas.height = Math.round(this.clientHeight * dpr)
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
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
    this.dispatchEvent(
      new CustomEvent('cad-canvas:pointer', {
        bubbles: true,
        composed: true,
        detail: { world, buttons: event.buttons },
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
  }
}

customElements.define('cad-canvas', CadCanvas)

declare global {
  interface HTMLElementTagNameMap {
    'cad-canvas': CadCanvas
  }
}

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocument, addEntity } from '../../../document.js'
import './index.js'
import { CadCanvas } from './index.js'

const { renderSceneMock } = vi.hoisted(() => ({ renderSceneMock: vi.fn() }))
vi.mock('../../../render.js', () => ({ renderScene: renderSceneMock }))

beforeEach(() => {
  renderSceneMock.mockClear()
})

function makeCanvas(): CadCanvas {
  const el = document.createElement('cad-canvas')
  document.body.appendChild(el)
  return el
}

function stubSize(el: CadCanvas, width: number, height: number): void {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true })
}

describe('cad-canvas', () => {
  it('sets its accessibility attributes and tabindex', () => {
    const el = makeCanvas()
    expect(el.getAttribute('role')).toBe('application')
    expect(el.getAttribute('aria-label')).toBe('Drawing canvas')
    expect(el.tabIndex).toBe(0)
    el.remove()
  })

  it('sizes its canvas backing store on connect (DPR capped at 2)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const el = makeCanvas()
    stubSize(el, 400, 300)
    el.syncCanvasSize()

    const canvas = el.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBe(800)
    expect(canvas!.height).toBe(600)

    el.remove()
  })

  it('centres the world origin on first sizing', () => {
    const el = makeCanvas()
    stubSize(el, 400, 300)
    el.syncCanvasSize()
    expect(el.getViewport()).toEqual({ offsetX: 200, offsetY: 150, scale: 1 })
    el.remove()
  })

  it('dispatches cad-canvas:pointer with world coordinates for the stubbed viewport', () => {
    const el = makeCanvas()
    const canvas = el.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, right: 410, bottom: 320 }) as DOMRect
    el.setViewport({ offsetX: 100, offsetY: 200, scale: 2 })

    const events: CustomEvent[] = []
    el.addEventListener('cad-canvas:pointer', event => events.push(event as CustomEvent))

    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 110,
        clientY: 160,
        buttons: 1,
        bubbles: true,
      })
    )

    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({
      world: { x: 0, y: 30 },
      buttons: 1,
    })

    el.remove()
  })

  it('cleans up listeners on disconnect', () => {
    const el = makeCanvas()
    el.remove()

    const events: CustomEvent[] = []
    el.addEventListener('cad-canvas:pointer', event => events.push(event as CustomEvent))
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    expect(events).toHaveLength(0)
  })

  it('draws once per invalidation and idles when clean', async () => {
    const el = makeCanvas()
    // happy-dom's 2D context is null; the mocked renderer doesn't need one.
    const canvas = el.querySelector('canvas')!
    canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext
    const doc = addEntity(createDocument(), {
      id: 'e1',
      type: 'line',
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
    })

    el.setDocument(doc)
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(renderSceneMock).toHaveBeenCalledTimes(1)

    // No state change → no further draws.
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(renderSceneMock).toHaveBeenCalledTimes(1)

    el.setViewport({ offsetX: 0, offsetY: 0, scale: 2 })
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(renderSceneMock).toHaveBeenCalledTimes(2)

    el.remove()
  })
})

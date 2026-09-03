/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocument, addEntity } from '../../../document.js'
import type { ToolId } from '../../../tools/types.js'
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

function stubCapture(el: CadCanvas): void {
  const canvas = el.querySelector('canvas')!
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
}

function pointer(el: CadCanvas, type: string, clientX: number, clientY: number): void {
  el.querySelector('canvas')!.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
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

  describe('line tool', () => {
    it('grows the document by one line on a click-drag gesture', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      pointer(el, 'pointerdown', 10, 10)
      pointer(el, 'pointermove', 30, 40)
      pointer(el, 'pointerup', 30, 40)

      const doc = el.getDocument()
      expect(doc.entities).toHaveLength(1)
      // y-up world: screen (10,10) → world (10,-10); (30,40) → (30,-40).
      expect(doc.entities[0]).toEqual({
        id: expect.any(String),
        type: 'line',
        x1: 10,
        y1: -10,
        x2: 30,
        y2: -40,
      })

      el.remove()
    })

    it('dispatches cad-canvas:commit with the entity and updated document', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      const commits: CustomEvent[] = []
      el.addEventListener('cad-canvas:commit', event => commits.push(event as CustomEvent))

      pointer(el, 'pointerdown', 0, 0)
      pointer(el, 'pointerup', 10, 0)

      expect(commits).toHaveLength(1)
      expect(commits[0].detail.entity).toMatchObject({ type: 'line' })
      expect(commits[0].detail.document).toBe(el.getDocument())

      el.remove()
    })

    it('passes the rubber-band preview to the renderer while dragging', async () => {
      const el = makeCanvas()
      stubCapture(el)
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      pointer(el, 'pointerdown', 0, 0)
      pointer(el, 'pointermove', 20, 30)
      await new Promise(resolve => requestAnimationFrame(resolve))

      const lastCall = renderSceneMock.mock.calls.at(-1)!
      expect(lastCall[3].preview).toMatchObject({ type: 'line', x2: 20, y2: -30 })

      el.remove()
    })

    it('Escape cancels an in-progress gesture without committing', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      pointer(el, 'pointerdown', 0, 0)
      pointer(el, 'pointermove', 15, 15)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      pointer(el, 'pointerup', 15, 15)

      expect(el.getDocument().entities).toHaveLength(0)

      el.remove()
    })

    it('does not commit a click without drag', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      pointer(el, 'pointerdown', 5, 5)
      pointer(el, 'pointerup', 5, 5)

      expect(el.getDocument().entities).toHaveLength(0)

      el.remove()
    })
  })

  describe('selection', () => {
    /** Canvas with a single horizontal line through world (0,0)–(40,0). */
    function makeSelectScene(): CadCanvas {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(addEntity(createDocument(), { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }))
      el.setTool('select')
      return el
    }

    it('click selects the nearest entity, fires cad-canvas:selection, and highlights it', async () => {
      const el = makeSelectScene()
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:selection', event => events.push(event as CustomEvent))

      // World (20,0) sits on the line at screen (20,0).
      pointer(el, 'pointerdown', 20, 0)

      expect(el.getSelection()).toBe('e1')
      expect(events).toHaveLength(1)
      expect(events[0].detail).toEqual({ id: 'e1' })

      await new Promise(resolve => requestAnimationFrame(resolve))
      const lastCall = renderSceneMock.mock.calls.at(-1)!
      expect(lastCall[3].selectedId).toBe('e1')

      el.remove()
    })

    it('clicking empty space clears the selection', () => {
      const el = makeSelectScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:selection', event => events.push(event as CustomEvent))

      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointerdown', 200, 200)

      expect(el.getSelection()).toBeNull()
      expect(events.map(event => event.detail.id)).toEqual(['e1', null])

      el.remove()
    })

    it('Delete removes the selected entity from the document', () => {
      const el = makeSelectScene()
      const deletes: CustomEvent[] = []
      el.addEventListener('cad-canvas:delete', event => deletes.push(event as CustomEvent))

      pointer(el, 'pointerdown', 20, 0)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

      expect(el.getDocument().entities).toHaveLength(0)
      expect(el.getSelection()).toBeNull()
      expect(deletes).toHaveLength(1)
      expect(deletes[0].detail.entity).toMatchObject({ id: 'e1' })
      expect(deletes[0].detail.document).toBe(el.getDocument())

      el.remove()
    })

    it('Backspace removes the selected entity too', () => {
      const el = makeSelectScene()

      pointer(el, 'pointerdown', 20, 0)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))

      expect(el.getDocument().entities).toHaveLength(0)
      el.remove()
    })

    it('Escape clears the selection without deleting', () => {
      const el = makeSelectScene()
      const deletes: CustomEvent[] = []
      el.addEventListener('cad-canvas:delete', event => deletes.push(event as CustomEvent))

      pointer(el, 'pointerdown', 20, 0)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(el.getSelection()).toBeNull()
      expect(el.getDocument().entities).toHaveLength(1)
      expect(deletes).toHaveLength(0)

      el.remove()
    })

    it('clears the selection when switching tools', () => {
      const el = makeSelectScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:selection', event => events.push(event as CustomEvent))

      pointer(el, 'pointerdown', 20, 0)
      el.setTool('line')

      expect(el.getSelection()).toBeNull()
      expect(events.map(event => event.detail.id)).toEqual(['e1', null])

      el.remove()
    })

    it('the select tool never commits entities', () => {
      const el = makeSelectScene()
      const commits: CustomEvent[] = []
      el.addEventListener('cad-canvas:commit', event => commits.push(event as CustomEvent))

      pointer(el, 'pointerdown', 5, 5)
      pointer(el, 'pointermove', 20, 20)
      pointer(el, 'pointerup', 20, 20)

      expect(el.getDocument().entities).toHaveLength(1)
      expect(commits).toHaveLength(0)

      el.remove()
    })
  })

  describe('setTool', () => {
    it('switches tools and commits the new geometry', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      expect(el.getTool()).toBe('line')

      el.setTool('circle')
      expect(el.getTool()).toBe('circle')

      pointer(el, 'pointerdown', 2, 2)
      pointer(el, 'pointermove', 5, 6)
      pointer(el, 'pointerup', 5, 6)

      expect(el.getDocument().entities).toEqual([{ id: expect.any(String), type: 'circle', cx: 2, cy: -2, r: 5 }])

      el.remove()
    })

    it('resets an in-progress gesture when switching mid-drag', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      pointer(el, 'pointerdown', 0, 0)
      el.setTool('rect')
      pointer(el, 'pointermove', 10, 10)
      pointer(el, 'pointerup', 10, 10)

      expect(el.getDocument().entities).toHaveLength(0)

      el.remove()
    })

    it('ignores unknown tool ids', () => {
      const el = makeCanvas()
      el.setTool('bogus' as ToolId)
      expect(el.getTool()).toBe('line')
      el.remove()
    })
  })
})

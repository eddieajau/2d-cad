/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocument, addEntity, getEntity, updateLayer } from '../../../document.js'
import { TEXT_DEFAULT_SIZE } from '../../../tools/text.js'
import type { ToolId } from '../../../tools/types.js'
import { screenToWorld, worldToScreen } from '../../../viewport.js'
import './index.js'
import { CadCanvas } from './index.js'

const { renderSceneMock } = vi.hoisted(() => ({ renderSceneMock: vi.fn() }))
// Keep the real gridInterval — snap alignment tests rely on it — and mock
// only the scene renderer (happy-dom's 2D context is null).
vi.mock('../../../render.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../render.js')>()),
  renderScene: renderSceneMock,
}))

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
        layerId: 'layer-0',
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

      // Complete the click before escaping, so no drag is in progress.
      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointerup', 20, 0)
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

      // Outside the 8px hit tolerance of the test line.
      pointer(el, 'pointerdown', 5, 50)
      pointer(el, 'pointermove', 20, 70)
      pointer(el, 'pointerup', 20, 70)

      expect(el.getDocument().entities).toHaveLength(1)
      expect(commits).toHaveLength(0)

      el.remove()
    })

    it('deleting an entity on a locked layer is refused with a blocked event', () => {
      const el = makeSelectScene()
      const blocked: CustomEvent[] = []
      el.addEventListener('cad-canvas:blocked', event => blocked.push(event as CustomEvent))

      pointer(el, 'pointerdown', 20, 0)
      expect(el.getSelection()).toBe('e1')

      // Lock the layer underneath the selection; the edit is refused at the
      // boundary and the document is untouched.
      el.setDocument(updateLayer(el.getDocument(), 'layer-0', { locked: true }))
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

      expect(blocked).toHaveLength(1)
      expect(blocked[0].detail).toEqual({ reason: 'locked' })
      expect(el.getDocument().entities).toHaveLength(1)

      el.remove()
    })
  })

  describe('move + copy', () => {
    /** Canvas with a single horizontal line through world (0,0)–(40,0). */
    function makeMoveScene(): CadCanvas {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(addEntity(createDocument(), { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }))
      el.setTool('select')
      return el
    }

    it('a drag moves the entity in the document under the same id', async () => {
      const el = makeMoveScene()
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext

      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointermove', 30, 10)

      // During the drag the document is unchanged; only the preview differs.
      expect(el.getDocument().entities).toEqual([
        { id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 0 },
      ])
      await new Promise(resolve => requestAnimationFrame(resolve))
      const lastCall = renderSceneMock.mock.calls.at(-1)!
      expect(lastCall[3].preview).toEqual({
        id: 'e1',
        type: 'line',
        layerId: 'layer-0',
        x1: 10,
        y1: -10,
        x2: 50,
        y2: -10,
      })
      expect(lastCall[3].selectedId).toBe('e1')

      pointer(el, 'pointerup', 30, 10)

      expect(el.getDocument().entities).toEqual([
        { id: 'e1', type: 'line', layerId: 'layer-0', x1: 10, y1: -10, x2: 50, y2: -10 },
      ])
      expect(el.getSelection()).toBe('e1')

      el.remove()
    })

    it('an alt-drag duplicates the entity and selects the clone', () => {
      const el = makeMoveScene()

      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointermove', 30, 10)
      // Alt held at drop time copies.
      el.querySelector('canvas')!.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 30, clientY: 10, altKey: true, bubbles: true })
      )

      const doc = el.getDocument()
      expect(doc.entities).toHaveLength(2)
      expect(doc.entities[0]).toEqual({ id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 0 })
      const clone = doc.entities[1]!
      expect(clone).toMatchObject({ type: 'line', x1: 10, y1: -10, x2: 50, y2: -10 })
      expect(clone.id).not.toBe('e1')
      expect(el.getSelection()).toBe(clone.id)

      el.remove()
    })

    it('Escape mid-drag cancels back to the pre-drag state', () => {
      const el = makeMoveScene()

      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointermove', 30, 10)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      pointer(el, 'pointerup', 30, 10)

      expect(el.getDocument().entities).toEqual([
        { id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 0 },
      ])
      // Pre-drag state had the entity selected — that survives the cancel.
      expect(el.getSelection()).toBe('e1')

      el.remove()
    })
  })

  describe('grid snap', () => {
    it('is off by default', () => {
      const el = makeCanvas()
      expect(el.getSnapMode()).toBe('off')
      el.remove()
    })

    it('toggles via G and emits cad-canvas:snap', () => {
      const el = makeCanvas()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:snap', event => events.push(event as CustomEvent))

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      expect(el.getSnapMode()).toBe('grid')
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'G' }))
      expect(el.getSnapMode()).toBe('off')

      expect(events.map(event => event.detail.mode)).toEqual(['grid', 'off'])

      el.remove()
    })

    it('snaps tool input to the rendered grid interval when on', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))

      pointer(el, 'pointerdown', 12, 7)
      pointer(el, 'pointermove', 26, 33)
      pointer(el, 'pointerup', 26, 33)

      // Rendered minor grid at scale 1 is 10 world units: screen (12,7) is
      // world (12,-7), which lands on the grid at (10,-10).
      expect(el.getDocument().entities[0]).toEqual({
        id: expect.any(String),
        type: 'line',
        layerId: 'layer-0',
        x1: 10,
        y1: -10,
        x2: 30,
        y2: -30,
      })

      el.remove()
    })

    it('keeps hit testing on the raw pointer while snap is on', () => {
      const el = makeCanvas()
      stubCapture(el)
      // Scale 10 → rendered grid 1 world unit, hit tolerance 0.8 world units.
      el.setViewport({ offsetX: 500, offsetY: 500, scale: 10 })
      el.setDocument(addEntity(createDocument(), { id: 'e1', type: 'line', x1: 3, y1: 0, x2: 7, y2: 0 }))
      el.setTool('select')
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))

      // Raw world (6.5, 0.6) is within tolerance of the segment; its snap
      // (7, 1) is not — selection must still succeed.
      pointer(el, 'pointerdown', 565, 494)

      expect(el.getSelection()).toBe('e1')

      el.remove()
    })
  })

  describe('text tool', () => {
    function makeTextScene(): { el: CadCanvas; input: HTMLInputElement } {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setTool('text')
      pointer(el, 'pointerdown', 10, 10)
      const input = el.querySelector<HTMLInputElement>('input.text-entry')!
      return { el, input }
    }

    it('opens the inline editor at the clicked anchor', () => {
      const { el, input } = makeTextScene()
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
      expect(input.style.left).toBe('10px')
      expect(input.style.top).toBe('10px')
      el.remove()
    })

    it('Enter commits a text entity at the anchor and refocuses the canvas', () => {
      const { el, input } = makeTextScene()
      input.value = 'note'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(el.getDocument().entities).toEqual([
        {
          id: expect.any(String),
          type: 'text',
          layerId: 'layer-0',
          x: 10,
          y: -10,
          text: 'note',
          size: TEXT_DEFAULT_SIZE,
        },
      ])
      expect(el.querySelector('input.text-entry')).toBeNull()
      expect(document.activeElement).toBe(el)

      el.remove()
    })

    it('Escape cancels without committing and refocuses the canvas', () => {
      const { el, input } = makeTextScene()
      input.value = 'note'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

      expect(el.getDocument().entities).toHaveLength(0)
      expect(el.querySelector('input.text-entry')).toBeNull()
      expect(document.activeElement).toBe(el)

      el.remove()
    })

    it('blur commits the text', () => {
      const { el, input } = makeTextScene()
      input.value = 'blurry'
      input.dispatchEvent(new Event('blur'))

      expect(el.getDocument().entities).toEqual([expect.objectContaining({ type: 'text', text: 'blurry' })])

      el.remove()
    })

    it('a blank entry commits nothing', () => {
      const { el, input } = makeTextScene()
      input.value = '   '
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(el.getDocument().entities).toHaveLength(0)
      expect(el.querySelector('input.text-entry')).toBeNull()

      el.remove()
    })

    it('canvas shortcuts are suppressed while the editor has focus', () => {
      const { el, input } = makeTextScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:snap', event => events.push(event as CustomEvent))

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
      expect(events).toHaveLength(0)

      el.remove()
    })

    it('switching tools closes an open editor', () => {
      const { el } = makeTextScene()
      el.setTool('line')
      expect(el.querySelector('input.text-entry')).toBeNull()
      el.remove()
    })

    it('commit flows through cad-canvas:commit for the history', () => {
      const { el, input } = makeTextScene()
      const commits: CustomEvent[] = []
      el.addEventListener('cad-canvas:commit', event => commits.push(event as CustomEvent))

      input.value = 'note'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(commits).toHaveLength(1)
      expect(commits[0].detail.document).toBe(el.getDocument())

      el.remove()
    })
  })

  describe('dim tool', () => {
    it('two clicks plus an offset drag commit a dimension', () => {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setTool('dim')

      pointer(el, 'pointerdown', 0, 0)
      pointer(el, 'pointerup', 0, 0)
      pointer(el, 'pointerdown', 40, 0)
      // Screen y = -5 is world y = +5 (y-up world): a drag "above" the line.
      pointer(el, 'pointermove', 20, -5)
      pointer(el, 'pointerup', 20, -5)

      // screenToWorld negates y, so a world y of 0 arrives as -0.
      expect(el.getDocument().entities).toEqual([
        {
          id: expect.any(String),
          type: 'dim',
          layerId: 'layer-0',
          x1: 0,
          y1: -0,
          x2: 40,
          y2: -0,
          offset: 5,
        },
      ])

      el.remove()
    })

    it('previews the dimension with the offset during the drag', async () => {
      const el = makeCanvas()
      stubCapture(el)
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setTool('dim')

      pointer(el, 'pointerdown', 0, 0)
      pointer(el, 'pointerup', 0, 0)
      pointer(el, 'pointerdown', 40, 0)
      pointer(el, 'pointermove', 20, -8)
      await new Promise(resolve => requestAnimationFrame(resolve))

      const lastCall = renderSceneMock.mock.calls.at(-1)!
      expect(lastCall[3].preview).toMatchObject({ type: 'dim', x2: 40, offset: 8 })

      el.remove()
    })
  })

  describe('offset tool', () => {
    /** Canvas with a single 270-thick boundary rect at the world origin. */
    function makeOffsetScene(): CadCanvas {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(
        addEntity(createDocument(), {
          id: 'src',
          type: 'rect',
          x: 0,
          y: 0,
          w: 12000,
          h: 9000,
          thickness: 270,
        })
      )
      el.setTool('offset')
      return el
    }

    it('a source click plus typed dx/dy commits a clone and selects it', () => {
      const el = makeOffsetScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:commit', event => events.push(event as CustomEvent))

      // A click inside the envelope picks the source (world (100, 100)).
      pointer(el, 'pointerdown', 100, -100)
      el.commitOffset(-6000, -1500)

      const doc = el.getDocument()
      expect(doc.entities).toHaveLength(2)
      expect(doc.entities[1]).toMatchObject({
        id: expect.any(String),
        type: 'rect',
        x: -6000,
        y: -1500,
        w: 12000,
        h: 9000,
        thickness: 270,
      })
      expect(el.getSelection()).toBe(doc.entities[1]!.id)
      expect(events).toHaveLength(1)
      expect(events[0].detail.document).toBe(doc)

      el.remove()
    })

    it('commitOffset without a picked source is a no-op', () => {
      const el = makeOffsetScene()
      el.commitOffset(-6000, -1500)
      expect(el.getDocument().entities).toHaveLength(1)
      el.remove()
    })

    it('commitOffset with link attaches a reference to the source', () => {
      const el = makeOffsetScene()
      pointer(el, 'pointerdown', 100, -100)
      el.commitOffset(-6000, -1500, true)

      const clone = el.getDocument().entities[1]
      expect(clone).toMatchObject({
        type: 'rect',
        x: -6000,
        y: -1500,
        ref: { id: 'src', corner: 'sw', dx: -6000, dy: -1500 },
      })

      el.remove()
    })

    it('typed entry pins the preview; clearing it returns control to the pointer', async () => {
      const el = makeOffsetScene()
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext
      pointer(el, 'pointerdown', 100, -100)

      el.setOffsetEntry(-6000, -1500)
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(renderSceneMock.mock.calls.at(-1)![3].preview).toMatchObject({ x: -6000, y: -1500 })

      // Pointer movement no longer drags the pinned preview.
      pointer(el, 'pointermove', 300, -300)
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(renderSceneMock.mock.calls.at(-1)![3].preview).toMatchObject({ x: -6000, y: -1500 })

      // Clearing a field releases the pin and the ghost.
      el.setOffsetEntry(-6000, null)
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(renderSceneMock.mock.calls.at(-1)![3].preview).toBeUndefined()

      el.remove()
    })

    it('Escape after a source pick unwinds to idle', () => {
      const el = makeOffsetScene()
      pointer(el, 'pointerdown', 100, -100)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      el.commitOffset(-6000, -1500)
      expect(el.getDocument().entities).toHaveLength(1)
      el.remove()
    })
  })

  describe('entity references', () => {
    /**
     * A parent rect at the world origin (0,0)–(500,300) and a child rect
     * referenced to its se corner + (100, 0): the child sits at
     * (500,0)–(600,100), its se anchor riding the parent's.
     */
    function makeRefScene(): CadCanvas {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(
        addEntity(addEntity(createDocument(), { id: 'parent', type: 'rect', x: 0, y: 0, w: 500, h: 300 }), {
          id: 'child',
          type: 'rect',
          x: 500,
          y: 0,
          w: 100,
          h: 100,
          ref: { id: 'parent', corner: 'se', dx: 100, dy: 0 },
        })
      )
      el.setTool('select')
      return el
    }

    it('moving the parent drags the child in the rendered world', async () => {
      const el = makeRefScene()
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext

      // Drag the parent 200 world units east.
      pointer(el, 'pointerdown', 250, -150)
      pointer(el, 'pointermove', 450, -150)
      pointer(el, 'pointerup', 450, -150)
      await new Promise(resolve => requestAnimationFrame(resolve))

      // Stored: the parent moved, the child's stored coords did not.
      const doc = el.getDocument()
      expect(getEntity(doc, 'parent')).toMatchObject({ x: 200, y: 0 })
      expect(getEntity(doc, 'child')).toMatchObject({ x: 500, y: 0 })

      // Rendered: the child followed, anchored at parent se (700, 0) + (100, 0).
      const rendered = renderSceneMock.mock.calls.at(-1)![1]
      expect(getEntity(rendered, 'child')).toMatchObject({ x: 700, y: 0 })

      el.remove()
    })

    it('deleting the parent bakes the child at its rendered position', async () => {
      const el = makeRefScene()
      const canvas = el.querySelector('canvas')!
      canvas.getContext = (() => ({}) as unknown) as typeof canvas.getContext

      pointer(el, 'pointerdown', 250, -150)
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      await new Promise(resolve => requestAnimationFrame(resolve))

      const doc = el.getDocument()
      expect(getEntity(doc, 'parent')).toBeUndefined()
      // Frozen in place — where it rendered — with the ref unlinked.
      expect(getEntity(doc, 'child')).toEqual({
        id: 'child',
        type: 'rect',
        layerId: 'layer-0',
        x: 500,
        y: 0,
        w: 100,
        h: 100,
      })
      const rendered = renderSceneMock.mock.calls.at(-1)![1]
      expect(getEntity(rendered, 'child')).toMatchObject({ x: 500, y: 0 })

      el.remove()
    })

    it('moving the child updates its ref delta and leaves the parent untouched', () => {
      const el = makeRefScene()

      // The child occupies world (500,0)–(600,100); drag it 100 east.
      pointer(el, 'pointerdown', 550, -50)
      pointer(el, 'pointermove', 650, -50)
      pointer(el, 'pointerup', 650, -50)

      const doc = el.getDocument()
      expect(getEntity(doc, 'parent')).toMatchObject({ x: 0, y: 0 })
      expect(getEntity(doc, 'child')).toEqual({
        id: 'child',
        type: 'rect',
        layerId: 'layer-0',
        x: 600,
        y: 0,
        w: 100,
        h: 100,
        ref: { id: 'parent', corner: 'se', dx: 200, dy: 0 },
      })

      el.remove()
    })
  })

  describe('anchor pick', () => {
    /** Canvas with one rect at the world origin (0,0)–(500,300). */
    function makePickScene(): CadCanvas {
      const el = makeCanvas()
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(addEntity(createDocument(), { id: 'parent', type: 'rect', x: 0, y: 0, w: 500, h: 300 }))
      el.setTool('select')
      return el
    }

    it('beginAnchorPick intercepts one click, dispatching the nearest anchor', () => {
      const el = makePickScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-picked', event => events.push(event as CustomEvent))

      el.beginAnchorPick()
      expect(document.activeElement).toBe(el)
      expect(el.style.cursor).toBe('crosshair')

      // Screen (502, -302) is world (502, 302) — just outside the NE corner.
      pointer(el, 'pointerdown', 502, -302)

      expect(events).toHaveLength(1)
      expect(events[0].detail).toEqual({ id: 'parent', corner: 'ne', world: { x: 500, y: 300 } })
      // Pick mode ended: cursor restored, tool untouched.
      expect(el.style.cursor).toBe('')
      expect(el.getTool()).toBe('select')

      el.remove()
    })

    it('the nearest anchor wins over the click point', () => {
      const el = makePickScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-picked', event => events.push(event as CustomEvent))

      el.beginAnchorPick()
      // World (20, 280) is closest to the NW corner (0, 300).
      pointer(el, 'pointerdown', 20, -280)

      expect(events[0].detail).toMatchObject({ corner: 'nw', world: { x: 0, y: 300 } })

      el.remove()
    })

    it('intercepts exactly one click, then the tool routes again', () => {
      const el = makePickScene()
      const events: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-picked', event => events.push(event as CustomEvent))

      el.beginAnchorPick()
      pointer(el, 'pointerdown', 502, -302)
      pointer(el, 'pointerdown', 502, -302)

      expect(events).toHaveLength(1)
      // Normal routing resumed: a click on the rect selects it.
      pointer(el, 'pointerup', 502, -302)
      expect(el.getSelection()).toBe('parent')

      el.remove()
    })

    it('a miss keeps pick mode armed', () => {
      const el = makePickScene()
      const picked: CustomEvent[] = []
      const cancelled: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-picked', event => picked.push(event as CustomEvent))
      el.addEventListener('cad-canvas:anchor-pick-cancelled', event => cancelled.push(event as CustomEvent))

      el.beginAnchorPick()
      pointer(el, 'pointerdown', 2000, -2000)
      expect(picked).toHaveLength(0)
      expect(el.style.cursor).toBe('crosshair')

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(cancelled).toHaveLength(1)
      expect(el.style.cursor).toBe('')

      el.remove()
    })

    it('Escape cancels without dispatching a pick', () => {
      const el = makePickScene()
      const picked: CustomEvent[] = []
      const cancelled: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-picked', event => picked.push(event as CustomEvent))
      el.addEventListener('cad-canvas:anchor-pick-cancelled', event => cancelled.push(event as CustomEvent))

      el.beginAnchorPick()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(picked).toHaveLength(0)
      expect(cancelled).toHaveLength(1)
      expect(el.style.cursor).toBe('')
      // Routing restored: the select tool picks again.
      pointer(el, 'pointerdown', 250, -150)
      expect(el.getSelection()).toBe('parent')

      el.remove()
    })

    it('a tool switch cancels a pending pick', () => {
      const el = makePickScene()
      const cancelled: CustomEvent[] = []
      el.addEventListener('cad-canvas:anchor-pick-cancelled', event => cancelled.push(event as CustomEvent))

      el.beginAnchorPick()
      el.setTool('line')

      expect(cancelled).toHaveLength(1)
      expect(el.style.cursor).toBe('')
      expect(el.getTool()).toBe('line')

      el.remove()
    })
  })

  describe('navigation', () => {
    /** Sized canvas at a non-default viewport so pan/zoom deltas are visible. */
    function makeNavCanvas(): CadCanvas {
      const el = makeCanvas()
      stubSize(el, 400, 300)
      stubCapture(el)
      el.setViewport({ offsetX: 100, offsetY: 200, scale: 2 })
      return el
    }

    it('scroll zoom keeps the world point at the canvas centre fixed', () => {
      const el = makeNavCanvas()
      const centreBefore = screenToWorld(el.getViewport(), 200, 150)

      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true }))

      const vp = el.getViewport()
      expect(vp.scale).toBeGreaterThan(2)
      const centreAfter = screenToWorld(vp, 200, 150)
      expect(centreAfter.x).toBeCloseTo(centreBefore.x)
      expect(centreAfter.y).toBeCloseTo(centreBefore.y)

      el.remove()
    })

    it('middle-drag pans the viewport without touching the document', () => {
      const el = makeNavCanvas()
      const commits: CustomEvent[] = []
      el.addEventListener('cad-canvas:commit', event => commits.push(event as CustomEvent))

      const canvas = el.querySelector('canvas')!
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, button: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 25, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY: 25, button: 1, bubbles: true }))

      expect(el.getViewport()).toEqual({ offsetX: 130, offsetY: 215, scale: 2 })
      expect(el.getDocument().entities).toHaveLength(0)
      expect(commits).toHaveLength(0)

      el.remove()
    })

    it('space+drag pans and shows grab/grabbing cursors', () => {
      const el = makeNavCanvas()

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      expect(el.style.cursor).toBe('grab')

      pointer(el, 'pointerdown', 10, 10)
      expect(el.style.cursor).toBe('grabbing')
      pointer(el, 'pointermove', 30, 5)
      pointer(el, 'pointerup', 30, 5)
      expect(el.getViewport()).toEqual({ offsetX: 120, offsetY: 195, scale: 2 })
      expect(el.style.cursor).toBe('grab')

      el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }))
      expect(el.style.cursor).toBe('')

      el.remove()
    })

    it('space+click neither draws nor selects', () => {
      const el = makeNavCanvas()
      el.setDocument(addEntity(createDocument(), { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }))
      el.setTool('select')

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      pointer(el, 'pointerdown', 20, 0)
      pointer(el, 'pointerup', 20, 0)
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }))

      expect(el.getSelection()).toBeNull()
      expect(el.getDocument().entities).toHaveLength(1)

      el.remove()
    })
  })

  describe('fit to extents', () => {
    /** A document far from the origin so fitting visibly recentres. */
    function makeFarCanvas(): CadCanvas {
      const el = makeCanvas()
      stubSize(el, 400, 300)
      stubCapture(el)
      el.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      el.setDocument(addEntity(createDocument(), { id: 'e1', type: 'line', x1: 1000, y1: 1000, x2: 1100, y2: 1050 }))
      return el
    }

    it('fitToExtents frames the whole document with a margin', () => {
      const el = makeFarCanvas()
      el.fitToExtents(el.getDocument())

      const vp = el.getViewport()
      // Width governs: min(320/100, 220/50) = 3.2.
      expect(vp.scale).toBeCloseTo(3.2)
      // Bounds land inside the 40px margin on the governing axis.
      expect(worldToScreen(vp, 1000, 1000).sx).toBeCloseTo(40)
      expect(worldToScreen(vp, 1100, 1050).sx).toBeCloseTo(360)

      el.remove()
    })

    it('an empty document recentres the origin at unit scale', () => {
      const el = makeCanvas()
      stubSize(el, 400, 300)
      el.setViewport({ offsetX: -500, offsetY: 900, scale: 5 })
      el.fitToExtents(el.getDocument())

      expect(el.getViewport()).toEqual({ offsetX: 200, offsetY: 150, scale: 1 })

      el.remove()
    })

    it('is a no-op before the canvas has a size', () => {
      const el = makeFarCanvas()
      // makeFarCanvas's stubbed size is dropped to simulate pre-layout.
      Object.defineProperty(el, 'clientWidth', { value: 0, configurable: true })
      const before = el.getViewport()

      el.fitToExtents(el.getDocument())
      expect(el.getViewport()).toEqual(before)

      el.remove()
    })

    it('F frames the document', () => {
      const el = makeFarCanvas()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }))

      expect(el.getViewport().scale).toBeCloseTo(3.2)

      el.remove()
    })

    it('F is inert while the text editor has focus', () => {
      const el = makeFarCanvas()
      el.setViewport({ offsetX: 100, offsetY: 100, scale: 1 })
      const before = el.getViewport()

      const input = document.createElement('input')
      el.appendChild(input)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))

      expect(el.getViewport()).toEqual(before)

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

      expect(el.getDocument().entities).toEqual([
        { id: expect.any(String), type: 'circle', layerId: 'layer-0', cx: 2, cy: -2, r: 5 },
      ])

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

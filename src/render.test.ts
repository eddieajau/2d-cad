/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, createDocument, type DrawingDocument, type Entity } from './document.js'
import { drawDim, drawText, gridInterval, renderGrid, renderScene, type RenderOptions } from './render.js'
import type { Viewport } from './viewport.js'

interface Call {
  method: string
  args: unknown[]
}

function createCtxStub(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const target: Record<string | symbol, unknown> = {}
  const stub = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop]
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
      }
    },
    set(t, prop, value) {
      t[prop] = value
      calls.push({ method: `set:${String(prop)}`, args: [value] })
      return true
    },
  })
  return { ctx: stub as unknown as CanvasRenderingContext2D, calls }
}

// Offset chosen so world y ∈ [0, 300] is visible (y-up world).
const viewport: Viewport = { offsetX: 0, offsetY: 300, scale: 1 }

const options: RenderOptions = {
  width: 400,
  height: 300,
  theme: { gridMinor: '#a0a0a0', gridMajor: '#666666', ink: '#000000', selection: '#ff8800' },
}

const line = { id: 'e1', type: 'line', x1: 10, y1: 10, x2: 50, y2: 30 } as const
const circle = { id: 'e2', type: 'circle', cx: 100, cy: 100, r: 20 } as const
const rect = { id: 'e3', type: 'rect', x: 20, y: 20, w: 30, h: 10 } as const

function docWith(...entities: Entity[]): DrawingDocument {
  let doc = createDocument()
  for (const entity of entities) doc = addEntity(doc, entity)
  return doc
}

describe('gridInterval', () => {
  it('never gets denser than the minimum pixel spacing', () => {
    expect(gridInterval(1)).toEqual({ minor: 10, major: 100 })
    expect(gridInterval(0.5)).toEqual({ minor: 100, major: 1000 })
    expect(gridInterval(10)).toEqual({ minor: 1, major: 10 })
  })
})

describe('renderScene', () => {
  it('clears the canvas before drawing the scene', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, createDocument(), viewport, options)
    expect(calls[0]).toEqual({ method: 'clearRect', args: [0, 0, options.width, options.height] })
  })

  it('dispatches one draw per entity type', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line, circle, rect), viewport, options)

    // line (10,10)→(50,30) at scale 1, y flipped: ends at screen (50,270)
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    expect(calls.some(c => c.method === 'arc')).toBe(true)
    expect(calls.some(c => c.method === 'strokeRect' && c.args[0] === 20 && c.args[1] === 270)).toBe(true)
  })

  it('renders text and dim entities with the ink fill', () => {
    const { ctx, calls } = createCtxStub()
    const text = { id: 't1', type: 'text', x: 10, y: 10, text: 'note', size: 12 } as const
    const dim = { id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 40, y2: 0, offset: 5 } as const
    renderScene(ctx, docWith(text, dim), viewport, options)

    expect(calls).toContainEqual({ method: 'set:fillStyle', args: [options.theme.ink] })
    expect(calls.some(c => c.method === 'fillText' && c.args[0] === 'note')).toBe(true)
    expect(calls.some(c => c.method === 'fillText' && c.args[0] === '40')).toBe(true)
  })

  it('highlights a selected text entity with the selection fill', () => {
    const { ctx, calls } = createCtxStub()
    const text = { id: 't1', type: 'text', x: 10, y: 10, text: 'note', size: 12 } as const
    renderScene(ctx, docWith(text), viewport, { ...options, selectedId: 't1' })

    expect(calls).toContainEqual({ method: 'set:fillStyle', args: [options.theme.selection] })
  })

  it('culls entities outside the visible world rect', () => {
    const offscreenRect = { id: 'e4', type: 'rect', x: 2000, y: 2000, w: 100, h: 100 } as const
    const offscreenCircle = { id: 'e5', type: 'circle', cx: -500, cy: 0, r: 10 } as const
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(offscreenRect, offscreenCircle), viewport, options)

    expect(calls.some(c => c.method === 'arc')).toBe(false)
    expect(calls.some(c => c.method === 'strokeRect')).toBe(false)
  })

  it('draws entities inside the visible world rect', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(circle), viewport, options)
    expect(calls.some(c => c.method === 'arc')).toBe(true)
  })

  it('adapts the grid interval to the scale', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options)
    const verticalStarts = calls.filter(c => c.method === 'moveTo' && c.args[1] === 0).map(c => c.args[0])
    expect(verticalStarts[0]).toBe(0)
    expect(verticalStarts[1]).toBe(10)

    const zoomedOut: Viewport = { offsetX: 0, offsetY: 0, scale: 0.5 }
    const zoomed = createCtxStub()
    renderGrid(zoomed.ctx, zoomedOut, options)
    const starts = zoomed.calls.filter(c => c.method === 'moveTo' && c.args[1] === 0).map(c => c.args[0])
    // minor = 100 world units at scale 0.5 → 50 px spacing
    expect(starts[1]).toBe(50)
  })

  it('labels major grid lines with world coordinates', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options)
    const labels = calls.filter(c => c.method === 'fillText').map(c => c.args[0])
    expect(labels).toContain('100')
    expect(labels).toContain('300')
  })

  it('draws the preview dashed on top of committed geometry', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(), viewport, { ...options, preview: line })

    // The preview line (10,10)→(50,30) is drawn flipped to screen (50,270)…
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    // …with a dash pattern, then save/restore resets the dash afterwards.
    expect(calls).toContainEqual({ method: 'setLineDash', args: [[9, 3]] })
    expect(calls[calls.length - 1]).toEqual({ method: 'restore', args: [] })
  })

  it('does not touch dash state when no preview is given', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, options)
    expect(calls.some(c => c.method === 'setLineDash')).toBe(false)
  })

  it('redraws the selected entity with the selection style', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id })

    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'set:lineWidth', args: [2] })
    // The highlight is wrapped in save/restore like the preview.
    expect(calls[calls.length - 1]).toEqual({ method: 'restore', args: [] })
  })

  it('does not apply the selection style when nothing is selected', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: null })
    expect(calls.some(c => c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection)).toBe(false)
  })

  it('ignores a selectedId missing from the document', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: 'missing' })
    expect(calls.some(c => c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection)).toBe(false)
  })

  it('draws a dragged selection at the preview offset, not its committed position', () => {
    const { ctx, calls } = createCtxStub()
    const moved = { ...line, x1: 20, y1: 10, x2: 60, y2: 30 }
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id, preview: moved })

    // Selection style at the dragged position…
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [60, 270] })
    // …committed geometry is skipped, and no dashed ghost is drawn.
    expect(calls).not.toContainEqual({ method: 'lineTo', args: [50, 270] })
    expect(calls.some(c => c.method === 'setLineDash')).toBe(false)
  })

  it('draws a copy drag as the highlighted original plus a dashed clone ghost', () => {
    const { ctx, calls } = createCtxStub()
    const ghost = { ...line, id: 'ghost', x1: 20, y1: 10, x2: 60, y2: 30 }
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id, preview: ghost })

    // Original keeps the selection style at its committed position…
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    // …and the clone is previewed dashed at the dragged position.
    expect(calls).toContainEqual({ method: 'setLineDash', args: [[9, 3]] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [60, 270] })
  })
})

describe('drawText', () => {
  it('scales the font by the viewport and fills at the anchor', () => {
    const { ctx, calls } = createCtxStub()
    drawText(ctx, { id: 't1', type: 'text', x: 10, y: 20, text: 'note', size: 12 }, viewport)
    expect(calls).toContainEqual({ method: 'set:font', args: ['12px sans-serif'] })
    expect(calls).toContainEqual({ method: 'fillText', args: ['note', 10, 280] })
  })

  it('zooms the font with the viewport scale', () => {
    const { ctx, calls } = createCtxStub()
    drawText(ctx, { id: 't1', type: 'text', x: 0, y: 0, text: 'A', size: 12 }, { offsetX: 0, offsetY: 0, scale: 2 })
    expect(calls).toContainEqual({ method: 'set:font', args: ['24px sans-serif'] })
  })
})

describe('drawDim', () => {
  // Measured (0,0)→(40,0), dimension line offset +5 → (0,5)→(40,5).
  const dim = { id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 40, y2: 0, offset: 5 } as const

  it('labels the measured world length, centred on the dimension line', () => {
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, viewport)
    const label = calls.find(c => c.method === 'fillText')
    expect(label).toEqual({ method: 'fillText', args: ['40', 20, expect.any(Number)] })
    expect(label!.args[2] as number).toBeLessThan(295) // above the dimension line (y=295)
  })

  it('draws the dimension line, extension lines, and arrowheads', () => {
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, viewport)
    // Dimension line runs between the offset endpoints.
    expect(calls).toContainEqual({ method: 'moveTo', args: [0, 295] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [40, 295] })
    // Extension lines start at the measured points.
    expect(calls).toContainEqual({ method: 'moveTo', args: [0, 300] })
    expect(calls).toContainEqual({ method: 'moveTo', args: [40, 300] })
    // Two arrowheads: filled triangles.
    const fills = calls.filter(c => c.method === 'fill')
    expect(fills).toHaveLength(2)
  })

  it('measures correctly at any zoom (world-space length, screen-space furniture)', () => {
    const zoomed: Viewport = { offsetX: 100, offsetY: 500, scale: 0.25 }
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, zoomed)
    // The label still reads the world length 40, at the smaller screen size.
    const label = calls.find(c => c.method === 'fillText')
    expect(label!.args[0]).toBe('40')
    expect(calls).toContainEqual({ method: 'set:font', args: ['10px sans-serif'] })
  })
})

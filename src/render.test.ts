/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, createDocument, type DrawingDocument, type Entity } from './document.js'
import { gridInterval, renderGrid, renderScene, type RenderOptions } from './render.js'
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
  theme: { gridMinor: '#a0a0a0', gridMajor: '#666666', ink: '#000000' },
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
})

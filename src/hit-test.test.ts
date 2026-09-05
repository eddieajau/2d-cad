/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, addLayer, createDocument, updateLayer, type DrawingDocument, type EntityDraft } from './document.js'
import {
  distanceToCircle,
  distanceToDim,
  distanceToLine,
  distanceToLineSegment,
  distanceToRect,
  distanceToText,
  hitTest,
} from './hit-test.js'

const p = (x: number, y: number) => ({ x, y })

function docWith(...drafts: EntityDraft[]): DrawingDocument {
  let doc = createDocument()
  for (const draft of drafts) doc = addEntity(doc, draft)
  return doc
}

describe('distanceToLineSegment', () => {
  it('measures the perpendicular distance within the segment', () => {
    expect(distanceToLineSegment(p(5, 3), p(0, 0), p(10, 0))).toBe(3)
    expect(distanceToLineSegment(p(0, 4), p(-3, 0), p(3, 0))).toBe(4)
  })

  it('clamps to the nearest endpoint beyond the segment', () => {
    expect(distanceToLineSegment(p(-4, 0), p(0, 0), p(10, 0))).toBe(4)
    expect(distanceToLineSegment(p(14, 3), p(0, 0), p(10, 0))).toBe(5)
  })

  it('treats a degenerate segment as its anchor point', () => {
    expect(distanceToLineSegment(p(3, 4), p(0, 0), p(0, 0))).toBe(5)
  })
})

describe('distanceToCircle', () => {
  const circle = { id: 'c1', type: 'circle', cx: 0, cy: 0, r: 5 } as const

  it('is zero on the edge', () => {
    expect(distanceToCircle(p(5, 0), circle)).toBe(0)
    expect(distanceToCircle(p(3, 4), circle)).toBe(0)
  })

  it('measures the band distance inside and outside', () => {
    expect(distanceToCircle(p(0, 0), circle)).toBe(5)
    expect(distanceToCircle(p(2, 0), circle)).toBe(3)
    expect(distanceToCircle(p(0, 8), circle)).toBe(3)
  })
})

describe('distanceToRect', () => {
  const rect = { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 4 } as const

  it('hits interior and edge points at zero', () => {
    expect(distanceToRect(p(5, 2), rect)).toBe(0)
    expect(distanceToRect(p(0, 2), rect)).toBe(0)
    expect(distanceToRect(p(10, 4), rect)).toBe(0)
  })

  it('measures the distance to the nearest edge outside', () => {
    expect(distanceToRect(p(5, 7), rect)).toBe(3)
    expect(distanceToRect(p(-2, 2), rect)).toBe(2)
  })

  it('measures to the nearest corner on the diagonal', () => {
    expect(distanceToRect(p(13, 8), rect)).toBe(5)
  })
})

describe('distanceToText', () => {
  const text = { id: 't1', type: 'text', x: 0, y: 0, text: 'ab', size: 5 } as const

  it('hits interior points at zero', () => {
    // Approximate bbox width: 2 × 0.6 × 5 = 6.
    expect(distanceToText(p(3, 2), text)).toBe(0)
    expect(distanceToText(p(0.5, 0.5), text)).toBe(0)
  })

  it('measures to the nearest edge outside', () => {
    expect(distanceToText(p(3, 7), text)).toBe(2)
    expect(distanceToText(p(9, 2), text)).toBe(3)
  })
})

describe('distanceToDim', () => {
  // Measured segment (0,0)–(10,0); dimension line offset +3 → (0,3)–(10,3).
  const dim = { id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 10, y2: 0, offset: 3 } as const

  it('measures to the dimension line, not the measured segment', () => {
    expect(distanceToDim(p(5, 3), dim)).toBe(0)
    expect(distanceToDim(p(5, 4), dim)).toBe(1)
    // A point on the measured segment is 3 away from the dimension line.
    expect(distanceToDim(p(5, 0), dim)).toBe(3)
  })

  it('clamps to the dimension line endpoints', () => {
    expect(distanceToDim(p(-3, 3), dim)).toBe(3)
  })
})

describe('distanceToRect with thickness', () => {
  // Envelope (0,0)–(20,10) drawn as the outer face; a 2 mm band grows inward,
  // so the inner void is (2,2)–(18,8).
  const band = { id: 'r1', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 2 } as const

  it('is zero on the band and both faces', () => {
    expect(distanceToRect(p(1, 5), band)).toBe(0)
    expect(distanceToRect(p(0, 0), band)).toBe(0)
    expect(distanceToRect(p(18, 8), band)).toBe(0)
  })

  it('measures to the nearest inner face from inside the void', () => {
    expect(distanceToRect(p(10, 5), band)).toBe(3)
    expect(distanceToRect(p(3.5, 7), band)).toBe(1)
  })

  it('measures to the nearest band boundary outside', () => {
    expect(distanceToRect(p(10, 12), band)).toBe(2)
    expect(distanceToRect(p(-3, 5), band)).toBe(3)
  })

  it('is zero everywhere except the clamped 1 mm core when the void closes', () => {
    const solid = { id: 'r2', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 50 } as const
    expect(distanceToRect(p(5, 5), solid)).toBe(0)
    // Only the 1 mm clamped core (9.5,4.5)–(10.5,5.5) still measures.
    expect(distanceToRect(p(10, 5), solid)).toBeCloseTo(0.5)
  })
})

describe('distanceToRect with per-edge thickness', () => {
  // U-shape against a neighbour: envelope (0,0)–(20,10), default thickness
  // 2 on the closed sides, north and east open (0).
  const u = { id: 'r1', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 2, edges: { n: 0, e: 0 } } as const

  it('hits a present side at zero', () => {
    // South band (y ≤ 2) and west band (x ≤ 2).
    expect(distanceToRect(p(10, 1), u)).toBe(0)
    expect(distanceToRect(p(1, 9), u)).toBe(0)
    // The corner where two present sides meet.
    expect(distanceToRect(p(1, 1), u)).toBe(0)
  })

  it('misses through an open side — the click passes behind', () => {
    // Top edge centre: north is open, the void reaches 7 mm deep from there.
    expect(distanceToRect(p(10, 9), u)).toBe(7)
    // Top-right corner: both open sides meet, nothing carries the click.
    expect(distanceToRect(p(19, 9), u)).toBe(7)
  })

  it('measures to the nearest present inner face from the void', () => {
    expect(distanceToRect(p(5, 5), u)).toBe(3)
  })

  it('keeps an open side open even against a large default', () => {
    const thickOpen = { id: 'r3', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 6, edges: { n: 0 } } as const
    // North band absent; the south band's inner face still measures.
    expect(distanceToRect(p(10, 9), thickOpen)).toBe(3)
    expect(distanceToRect(p(10, 3), thickOpen)).toBe(0)
  })

  it('treats an all-open rect as the hairline envelope', () => {
    const open = {
      id: 'r4',
      type: 'rect',
      x: 0,
      y: 0,
      w: 20,
      h: 10,
      thickness: 5,
      edges: { n: 0, e: 0, s: 0, w: 0 },
    } as const
    expect(distanceToRect(p(10, 5), open)).toBe(0)
  })

  it('resolves uniform explicit edges exactly like a plain thickness', () => {
    const plain = { id: 'r5', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 2 } as const
    const uniform = {
      id: 'r5',
      type: 'rect',
      x: 0,
      y: 0,
      w: 20,
      h: 10,
      thickness: 0,
      edges: { n: 2, e: 2, s: 2, w: 2 },
    } as const
    for (const point of [p(1, 5), p(10, 5), p(10, 12), p(30, 5)]) {
      expect(distanceToRect(point, uniform)).toBe(distanceToRect(point, plain))
    }
  })
})

describe('distanceToCircle with thickness', () => {
  const annulus = { id: 'c1', type: 'circle', cx: 0, cy: 0, r: 5, thickness: 2 } as const

  it('is zero within the band and on both faces', () => {
    expect(distanceToCircle(p(4, 0), annulus)).toBe(0)
    expect(distanceToCircle(p(5, 0), annulus)).toBe(0)
    expect(distanceToCircle(p(3, 0), annulus)).toBe(0)
  })

  it('measures to the inner face inside the void', () => {
    expect(distanceToCircle(p(0, 0), annulus)).toBe(3)
    expect(distanceToCircle(p(2, 0), annulus)).toBe(1)
  })

  it('measures to the outer face beyond the band', () => {
    expect(distanceToCircle(p(0, 8), annulus)).toBe(3)
  })
})

describe('distanceToLine with thickness', () => {
  const ribbon = { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, thickness: 4 } as const

  it('is zero within half the thickness of the centred path', () => {
    expect(distanceToLine(p(5, 2), ribbon)).toBe(0)
    expect(distanceToLine(p(5, -2), ribbon)).toBe(0)
  })

  it('measures the band overshoot beyond it', () => {
    expect(distanceToLine(p(5, 3), ribbon)).toBe(1)
    expect(distanceToLine(p(5, 5), ribbon)).toBe(3)
  })
})

describe('hitTest', () => {
  const doc = docWith(
    { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { id: 'e2', type: 'line', x1: 0, y1: 4, x2: 10, y2: 4 },
    { id: 'e3', type: 'circle', cx: 20, cy: 0, r: 5 }
  )

  it('returns null on a miss beyond the tolerance', () => {
    expect(hitTest(doc, p(5, 2.5), 1)).toBeNull()
    expect(hitTest(createDocument(), p(0, 0), 10)).toBeNull()
  })

  it('returns the hit entity at the tolerance boundary (inclusive)', () => {
    // Distance from (20, 6.5) to the circle's edge is exactly 1.5.
    expect(hitTest(doc, p(20, 6.5), 1.5)?.id).toBe('e3')
  })

  it('nearest wins when several entities are within tolerance', () => {
    expect(hitTest(doc, p(5, 3), 3.5)?.id).toBe('e2')
    expect(hitTest(doc, p(5, 1), 3)?.id).toBe('e1')
  })

  it('hits each entity type', () => {
    expect(hitTest(doc, p(25, 0), 0.5)?.id).toBe('e3')
    expect(hitTest(doc, p(20, 5.5), 0.5)?.id).toBe('e3')
    expect(hitTest(doc, p(5, 0), 0.5)?.id).toBe('e1')
  })

  it('hits text and dim entities through the document', () => {
    const annotated = docWith(
      { id: 'e4', type: 'text', x: 30, y: 10, text: 'ab', size: 5 },
      { id: 'e5', type: 'dim', x1: 0, y1: -10, x2: 10, y2: -10, offset: 2 }
    )
    expect(hitTest(annotated, p(32, 12), 1)?.id).toBe('e4')
    // The dimension line sits at y = -8 (offset +2 from y = -10).
    expect(hitTest(annotated, p(5, -8), 0.5)?.id).toBe('e5')
  })

  it('hits thick-rect bands through the document', () => {
    const walled = docWith({ id: 'e6', type: 'rect', x: 0, y: 0, w: 20, h: 10, thickness: 2 })
    expect(hitTest(walled, p(1, 5), 0.5)?.id).toBe('e6')
    // The inner void is a miss at a tight tolerance.
    expect(hitTest(walled, p(10, 5), 0.5)).toBeNull()
  })

  it('skips entities on invisible layers', () => {
    let hidden = addLayer(createDocument(), 'Hidden')
    const hiddenId = hidden.layers[1]!.id
    hidden = addEntity(hidden, { id: 'h1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layerId: hiddenId })
    hidden = updateLayer(hidden, hiddenId, { visible: false })
    expect(hitTest(hidden, p(5, 0), 1)).toBeNull()
  })

  it('skips entities on locked layers', () => {
    let locked = addLayer(createDocument(), 'Locked')
    const lockedId = locked.layers[1]!.id
    locked = addEntity(locked, { id: 'k1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layerId: lockedId })
    locked = updateLayer(locked, lockedId, { locked: true })
    expect(hitTest(locked, p(5, 0), 1)).toBeNull()
  })
})

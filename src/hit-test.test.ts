/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument, type Entity } from './document.js'
import {
  distanceToCircle,
  distanceToDim,
  distanceToLineSegment,
  distanceToRect,
  distanceToText,
  hitTest,
} from './hit-test.js'

const p = (x: number, y: number) => ({ x, y })

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

describe('hitTest', () => {
  const entities: Entity[] = [
    { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { id: 'e2', type: 'line', x1: 0, y1: 4, x2: 10, y2: 4 },
    { id: 'e3', type: 'circle', cx: 20, cy: 0, r: 5 },
  ]
  const doc = { entities }

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
    const annotated = {
      entities: [
        ...entities,
        { id: 'e4', type: 'text', x: 30, y: 10, text: 'ab', size: 5 },
        { id: 'e5', type: 'dim', x1: 0, y1: -10, x2: 10, y2: -10, offset: 2 },
      ] satisfies Entity[],
    }
    expect(hitTest(annotated, p(32, 12), 1)?.id).toBe('e4')
    // The dimension line sits at y = -8 (offset +2 from y = -10).
    expect(hitTest(annotated, p(5, -8), 0.5)?.id).toBe('e5')
  })
})

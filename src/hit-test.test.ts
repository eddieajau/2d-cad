/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument, type Entity } from './document.js'
import { distanceToCircle, distanceToLineSegment, distanceToRect, hitTest } from './hit-test.js'

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
})

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { anchorPoint, dimLine, dimOffset, nearestAnchor, textBounds, wallBand } from './geometry.js'
import type { WallGeometry } from './geometry.js'

const p = (x: number, y: number) => ({ x, y })

function wall(alignment: WallGeometry['alignment'], thickness = 2): WallGeometry {
  return { id: 'w1', type: 'wall', x: 0, y: 0, w: 10, h: 4, thickness, alignment }
}

describe('wallBand', () => {
  it('grows an outer-aligned wall inward from the drawn envelope', () => {
    const { outer, inner } = wallBand(wall('outer'))
    expect(outer).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 4 })
    expect(inner).toEqual({ minX: 2, minY: 2, maxX: 8, maxY: 2 })
  })

  it('grows an inner-aligned wall outward from the drawn envelope', () => {
    const { outer, inner } = wallBand(wall('inner'))
    expect(outer).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 6 })
    expect(inner).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 4 })
  })

  it('straddles the drawn envelope for centre alignment', () => {
    const { outer, inner } = wallBand(wall('centre'))
    expect(outer).toEqual({ minX: -1, minY: -1, maxX: 11, maxY: 5 })
    expect(inner).toEqual({ minX: 1, minY: 1, maxX: 9, maxY: 3 })
  })

  it('collapses onto the envelope for degenerate thickness', () => {
    const { outer, inner } = wallBand(wall('outer', 0))
    expect(outer).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 4 })
    expect(inner).toEqual(outer)

    // Negative thickness is clamped to the same degenerate band.
    expect(wallBand(wall('centre', -5)).inner).toEqual(wallBand(wall('centre', 0)).inner)
  })
})

describe('dimLine', () => {
  it('offsets a horizontal segment above for positive offsets', () => {
    const line = dimLine({ id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 10, y2: 0, offset: 3 })
    expect(line.a).toEqual(p(0, 3))
    expect(line.b).toEqual(p(10, 3))
  })

  it('offsets below for negative offsets', () => {
    const line = dimLine({ id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 10, y2: 0, offset: -2 })
    expect(line.a).toEqual(p(0, -2))
    expect(line.b).toEqual(p(10, -2))
  })

  it('offsets to the left of an upward segment', () => {
    // Upward direction: left side is -x.
    const line = dimLine({ id: 'd1', type: 'dim', x1: 5, y1: 0, x2: 5, y2: 10, offset: 4 })
    expect(line.a).toEqual(p(1, 0))
    expect(line.b).toEqual(p(1, 10))
  })

  it('collapses a degenerate segment onto its anchor', () => {
    const line = dimLine({ id: 'd1', type: 'dim', x1: 2, y1: 3, x2: 2, y2: 3, offset: 5 })
    expect(line.a).toEqual(p(2, 3))
    expect(line.b).toEqual(p(2, 3))
  })
})

describe('dimOffset', () => {
  it('is positive left of the first→second direction', () => {
    expect(dimOffset(p(0, 0), p(10, 0), p(5, 3))).toBe(3)
    expect(dimOffset(p(5, 0), p(5, 10), p(1, 5))).toBe(4)
  })

  it('is negative on the other side', () => {
    expect(dimOffset(p(0, 0), p(10, 0), p(5, -2))).toBe(-2)
  })

  it('is zero on the line', () => {
    expect(dimOffset(p(0, 0), p(10, 0), p(3, 0))).toBe(0)
  })

  it('is zero for a degenerate segment', () => {
    expect(dimOffset(p(1, 1), p(1, 1), p(5, 5))).toBe(0)
  })
})

describe('textBounds', () => {
  it('ascends from the baseline-left anchor by the font size', () => {
    const bounds = textBounds({ id: 't1', type: 'text', x: 10, y: 20, text: 'hi', size: 5 })
    expect(bounds.minX).toBe(10)
    expect(bounds.minY).toBe(20)
    expect(bounds.maxY).toBe(25)
    // Approximate width: 2 chars × 0.6em × 5.
    expect(bounds.maxX).toBeCloseTo(10 + 2 * 0.6 * 5)
  })

  it('is empty for empty text', () => {
    const bounds = textBounds({ id: 't1', type: 'text', x: 3, y: 4, text: '', size: 5 })
    expect(bounds.maxX).toBe(bounds.minX)
  })
})

describe('anchorPoint', () => {
  it('resolves rect corners from the normalised envelope', () => {
    // Drawn with negative w/h; anchors come from the normalised envelope.
    const rect = { id: 'r1', type: 'rect' as const, x: 2, y: 6, w: -10, h: -4 }
    expect(anchorPoint(rect, 'nw')).toEqual(p(-8, 6))
    expect(anchorPoint(rect, 'ne')).toEqual(p(2, 6))
    expect(anchorPoint(rect, 'sw')).toEqual(p(-8, 2))
    expect(anchorPoint(rect, 'se')).toEqual(p(2, 2))
  })

  it('resolves wall corners the same way as rect', () => {
    expect(anchorPoint(wall('outer'), 'sw')).toEqual(p(0, 0))
    expect(anchorPoint(wall('outer'), 'ne')).toEqual(p(10, 4))
  })

  it('resolves circle cardinal points', () => {
    const circle = { id: 'c1', type: 'circle' as const, cx: 10, cy: 20, r: 5 }
    expect(anchorPoint(circle, 'n')).toEqual(p(10, 25))
    expect(anchorPoint(circle, 'e')).toEqual(p(15, 20))
    expect(anchorPoint(circle, 's')).toEqual(p(10, 15))
    expect(anchorPoint(circle, 'w')).toEqual(p(5, 20))
  })

  it('resolves line endpoints', () => {
    const line = { id: 'l1', type: 'line' as const, x1: 1, y1: 2, x2: 8, y2: 9 }
    expect(anchorPoint(line, 'start')).toEqual(p(1, 2))
    expect(anchorPoint(line, 'end')).toEqual(p(8, 9))
  })

  it('is null for a corner that does not apply to the type', () => {
    const rect = { id: 'r1', type: 'rect' as const, x: 0, y: 0, w: 1, h: 1 }
    expect(anchorPoint(rect, 'n')).toBeNull()
    expect(anchorPoint(rect, 'start')).toBeNull()

    const line = { id: 'l1', type: 'line' as const, x1: 0, y1: 0, x2: 1, y2: 1 }
    expect(anchorPoint(line, 'nw')).toBeNull()
  })

  it('is null for types without anchors', () => {
    expect(anchorPoint({ id: 't1', type: 'text', x: 0, y: 0, text: 'a', size: 5 }, 'nw')).toBeNull()
    expect(anchorPoint({ id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 1, y2: 1, offset: 0 }, 'sw')).toBeNull()
  })
})

describe('nearestAnchor', () => {
  it('picks the nearest corner of a rect or wall', () => {
    const envelope = {
      id: 'w1',
      type: 'wall' as const,
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      thickness: 270,
      alignment: 'outer' as const,
    }
    expect(nearestAnchor(envelope, p(90, 10))).toEqual({ corner: 'se', point: p(100, 0) })
    expect(nearestAnchor(envelope, p(-3, 58))).toEqual({ corner: 'nw', point: p(0, 60) })
  })

  it('picks the nearest cardinal of a circle', () => {
    const circle = { id: 'c1', type: 'circle' as const, cx: 0, cy: 0, r: 10 }
    expect(nearestAnchor(circle, p(9, 1))).toEqual({ corner: 'e', point: p(10, 0) })
    expect(nearestAnchor(circle, p(-1, -12))).toEqual({ corner: 's', point: p(0, -10) })
  })

  it('picks the nearest endpoint of a line', () => {
    const line = { id: 'l1', type: 'line' as const, x1: 0, y1: 0, x2: 10, y2: 0 }
    expect(nearestAnchor(line, p(8, 2))).toEqual({ corner: 'end', point: p(10, 0) })
  })

  it('is null for types without anchors', () => {
    expect(nearestAnchor({ id: 't1', type: 'text', x: 0, y: 0, text: 'a', size: 5 }, p(0, 0))).toBeNull()
  })
})

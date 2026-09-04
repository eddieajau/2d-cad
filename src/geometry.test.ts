/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { dimLine, dimOffset, textBounds, wallBand } from './geometry.js'
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

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import {
  anchorPoint,
  circleBand,
  dimLine,
  dimOffset,
  nearestAnchor,
  rectBand,
  rectEdges,
  uniformRectThickness,
  textBounds,
} from './geometry.js'

const p = (x: number, y: number) => ({ x, y })

describe('rectBand', () => {
  it('insets the inner face by the thickness per side from the drawn envelope', () => {
    const { outer, inner } = rectBand({ x: 0, y: 0, w: 10, h: 10, thickness: 2 })
    expect(outer).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    expect(inner).toEqual({ minX: 2, minY: 2, maxX: 8, maxY: 8 })
  })

  it('normalises envelopes drawn corner-to-corner (negative w/h)', () => {
    const { outer, inner } = rectBand({ x: 2, y: 2, w: -10, h: -10, thickness: 2 })
    expect(outer).toEqual({ minX: -8, minY: -8, maxX: 2, maxY: 2 })
    expect(inner).toEqual({ minX: -6, minY: -6, maxX: 0, maxY: 0 })
  })

  it('collapses onto the envelope for thickness 0 (the hairline)', () => {
    const { outer, inner } = rectBand({ x: 0, y: 0, w: 10, h: 4 })
    expect(inner).toEqual(outer)
  })

  it('clamps a closed void to a 1 mm inner face, centred in the envelope', () => {
    // 4-wide envelope with 3-thick edges: the void would invert, so the
    // inner face clamps to 1 mm centred.
    const { inner } = rectBand({ x: 0, y: 0, w: 4, h: 4, thickness: 3 })
    expect(inner).toEqual({ minX: 1.5, minY: 1.5, maxX: 2.5, maxY: 2.5 })

    // Negative thickness clamps to 0 — the band collapses onto the envelope.
    const negative = rectBand({ x: 0, y: 0, w: 4, h: 4, thickness: -3 })
    expect(negative.inner).toEqual(negative.outer)
  })
})

describe('rectEdges', () => {
  it('resolves inherit, override, and open per side', () => {
    const edges = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 270, edges: { n: 0, s: 110 } })
    const effective = Object.fromEntries(edges.map(edge => [edge.side, edge.effective]))
    expect(effective).toEqual({ n: 0, e: 270, s: 110, w: 270 })
  })

  it('inherits the entity default when edges is absent', () => {
    const edges = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 270 })
    expect(edges.map(edge => edge.effective)).toEqual([270, 270, 270, 270])
  })

  it('resolves uniform explicit edges like a plain thickness', () => {
    const plain = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 5 })
    const explicit = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 0, edges: { n: 5, e: 5, s: 5, w: 5 } })
    expect(uniformRectThickness(explicit)).toBe(5)
    expect(explicit.map(edge => edge.effective)).toEqual(plain.map(edge => edge.effective))
    expect(explicit.map(edge => edge.inner)).toEqual(plain.map(edge => edge.inner))
    expect(explicit.map(edge => edge.band)).toEqual(plain.map(edge => edge.band))
  })

  it('carries no band or face on an open side', () => {
    const edges = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 2, edges: { n: 0 } })
    const north = edges.find(edge => edge.side === 'n')!
    expect(north.effective).toBe(0)
    // The open side collapses to the outer face itself; render and hit
    // testing skip it entirely.
    expect(north.band).toEqual({ minX: 0, minY: 8, maxX: 10, maxY: 8 })
  })

  it('runs every present band corner-to-corner so open sides square off', () => {
    // U-shape: south and west present, north and east open. The south band
    // spans the full width even though the east side is open.
    const edges = rectEdges({ x: 0, y: 0, w: 20, h: 10, thickness: 2, edges: { n: 0, e: 0 } })
    const south = edges.find(edge => edge.side === 's')!
    const west = edges.find(edge => edge.side === 'w')!
    expect(south.band).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 2 })
    expect(west.band).toEqual({ minX: 0, minY: 0, maxX: 2, maxY: 10 })
  })

  it('clamps an oversized edge to the opposite outer face', () => {
    const edges = rectEdges({ x: 0, y: 0, w: 10, h: 4, thickness: 0, edges: { n: 10 } })
    const north = edges.find(edge => edge.side === 'n')!
    // The band swallows the whole height, clamped — never inverted.
    expect(north.band).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 4 })
  })

  it('clamps negative edges to open', () => {
    const edges = rectEdges({ x: 0, y: 0, w: 10, h: 8, thickness: 2, edges: { e: -5 } })
    expect(edges.find(edge => edge.side === 'e')!.effective).toBe(0)
  })
})

describe('uniformRectThickness', () => {
  it('is the common value when all four sides match', () => {
    expect(uniformRectThickness([{ effective: 3 }, { effective: 3 }, { effective: 3 }, { effective: 3 }])).toBe(3)
  })

  it('is null when any side differs, including an open side', () => {
    expect(uniformRectThickness([{ effective: 3 }, { effective: 0 }, { effective: 3 }, { effective: 3 }])).toBeNull()
  })
})

describe('circleBand', () => {
  it('grows the band inward from the drawn radius', () => {
    expect(circleBand(5, 2)).toEqual({ outer: 5, inner: 3 })
  })

  it('collapses onto the drawn circle for thickness 0', () => {
    expect(circleBand(5)).toEqual({ outer: 5, inner: 5 })
  })

  it('clamps a closed annulus to a 0.5 mm inner radius (1 mm void)', () => {
    expect(circleBand(1, 3)).toEqual({ outer: 1, inner: 0.5 })
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
  it('picks the nearest corner of a rect', () => {
    const envelope = {
      id: 'r1',
      type: 'rect' as const,
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      thickness: 270,
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

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_SNAP_GRID, resolveSnapGrid, snapToGrid } from './snap.js'

describe('snapToGrid', () => {
  it('rounds to the nearest grid multiple', () => {
    expect(snapToGrid({ x: 12, y: 7 }, 10)).toEqual({ x: 10, y: 10 })
    expect(snapToGrid({ x: 25, y: 24 }, 10)).toEqual({ x: 30, y: 20 })
  })

  it('rounds negative coordinates to the nearest grid multiple', () => {
    expect(snapToGrid({ x: -13, y: -7 }, 10)).toEqual({ x: -10, y: -10 })
    expect(snapToGrid({ x: -16, y: -14 }, 10)).toEqual({ x: -20, y: -10 })
  })

  it('handles fractional grids', () => {
    expect(snapToGrid({ x: 0.14, y: 0.16 }, 0.1)).toEqual({ x: 0.1, y: 0.2 })
  })

  it('passes points already on the grid through unchanged', () => {
    expect(snapToGrid({ x: 10, y: -40 }, 10)).toEqual({ x: 10, y: -40 })
  })
})

describe('resolveSnapGrid', () => {
  it('resolves off mode to null so callers pass the pointer through', () => {
    expect(resolveSnapGrid('off', 10)).toBeNull()
  })

  it('returns the given grid when snapping is on', () => {
    expect(resolveSnapGrid('grid', 5)).toBe(5)
  })

  it('defaults to the 100 mm grid', () => {
    expect(resolveSnapGrid('grid')).toBe(100)
    expect(DEFAULT_SNAP_GRID).toBe(100)
  })
})

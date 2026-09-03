/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { panBy, screenToWorld, worldToScreen, zoomAt, type Viewport } from './viewport.js'

const viewport: Viewport = { offsetX: 100, offsetY: 200, scale: 2 }

describe('screenToWorld / worldToScreen', () => {
  it('round-trips screen → world → screen', () => {
    const { x, y } = screenToWorld(viewport, 137, 92)
    const { sx, sy } = worldToScreen(viewport, x, y)
    expect(sx).toBeCloseTo(137)
    expect(sy).toBeCloseTo(92)
  })

  it('flips the y axis', () => {
    // Higher on screen (smaller sy) means a larger world y.
    const lower = screenToWorld(viewport, 100, 200)
    const upper = screenToWorld(viewport, 100, 100)
    expect(upper.y).toBeGreaterThan(lower.y)
  })

  it('maps the offset origin to world origin', () => {
    const { x, y } = screenToWorld(viewport, 100, 200)
    expect(x).toBe(0)
    expect(y).toBeCloseTo(0)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const { x, y } = screenToWorld(viewport, 137, 92)
    const zoomed = zoomAt(viewport, 1.5, 137, 92)
    const { sx, sy } = worldToScreen(zoomed, x, y)
    expect(sx).toBeCloseTo(137)
    expect(sy).toBeCloseTo(92)
  })

  it('scales the viewport', () => {
    expect(zoomAt(viewport, 2, 0, 0).scale).toBe(4)
  })

  it('ignores non-positive or non-finite factors', () => {
    expect(zoomAt(viewport, 0, 10, 10)).toBe(viewport)
    expect(zoomAt(viewport, -1, 10, 10)).toBe(viewport)
    expect(zoomAt(viewport, Infinity, 10, 10)).toBe(viewport)
  })
})

describe('panBy', () => {
  it('shifts offsets and keeps scale', () => {
    const panned = panBy(viewport, -30, 5)
    expect(panned).toEqual({ offsetX: 70, offsetY: 205, scale: 2 })
  })
})

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { fitExtents, panBy, screenToWorld, visibleWorldRect, worldToScreen, zoomAt, type Viewport } from './viewport.js'

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

describe('visibleWorldRect', () => {
  it('returns the visible world bounds for a screen size', () => {
    const rect = visibleWorldRect(viewport, 400, 300)
    expect(rect.minX).toBeCloseTo(-50)
    expect(rect.minY).toBeCloseTo(-50)
    expect(rect.maxX).toBeCloseTo(150)
    expect(rect.maxY).toBeCloseTo(100)
  })
})

describe('fitExtents', () => {
  const margin = 40

  it('scales the bounds to fit with the margin respected, aspect preserved', () => {
    // Width governs: min(320/100, 220/50) = 3.2 — vertical margins gain slack.
    const fitted = fitExtents(viewport, { minX: 0, minY: 0, maxX: 100, maxY: 50 }, 400, 300, margin)
    expect(fitted.scale).toBeCloseTo(3.2)
    // The left edge sits exactly at the margin; the right mirrors it.
    expect(worldToScreen(fitted, 0, 0).sx).toBeCloseTo(margin)
    expect(worldToScreen(fitted, 100, 0).sx).toBeCloseTo(400 - margin)
  })

  it('lets the height govern for tall bounds', () => {
    const fitted = fitExtents(viewport, { minX: 0, minY: 0, maxX: 50, maxY: 200 }, 400, 300, margin)
    expect(fitted.scale).toBeCloseTo(1.1) // min(320/50, 220/200)
    expect(worldToScreen(fitted, 0, 200).sy).toBeCloseTo(margin)
    expect(worldToScreen(fitted, 0, 0).sy).toBeCloseTo(300 - margin)
  })

  it('centres the bounds on the screen', () => {
    const fitted = fitExtents(viewport, { minX: 10, minY: 20, maxX: 110, maxY: 70 }, 400, 300, margin)
    expect(worldToScreen(fitted, 60, 45)).toEqual({ sx: 200, sy: 150 })
  })

  it('returns the default first-sight view for empty bounds', () => {
    expect(fitExtents(viewport, null, 400, 300, margin)).toEqual({ offsetX: 200, offsetY: 150, scale: 1 })
  })

  it('clamps zero-area bounds to a sane scale and centres them', () => {
    const fitted = fitExtents(viewport, { minX: 3, minY: 7, maxX: 3, maxY: 7 }, 400, 300, margin)
    expect(fitted.scale).toBe(1)
    expect(worldToScreen(fitted, 3, 7)).toEqual({ sx: 200, sy: 150 })
  })

  it('fits a zero-width span by its height alone', () => {
    const fitted = fitExtents(viewport, { minX: 0, minY: 5, maxX: 0, maxY: 105 }, 400, 300, margin)
    expect(fitted.scale).toBeCloseTo(2.2) // min(Infinity, 220/100)
    expect(worldToScreen(fitted, 0, 105).sy).toBeCloseTo(margin)
  })
})

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DimEntity, TextEntity } from './document.js'
import type { WorldPoint, WorldRect } from './viewport.js'

/**
 * Geometric derivations shared by rendering, hit testing, and tools —
 * pure world-space math with no canvas or viewport dependency.
 */

/**
 * Approximate advance width per character, in em, for the single drafting
 * font (sans-serif). Only used where a canvas cannot measure text.
 */
const CHAR_WIDTH_EM = 0.6

/**
 * Bounding box of a text entity: baseline-left anchor, ascending by the
 * font size (world is y-up), width approximated for the drafting font.
 */
export function textBounds(e: TextEntity): WorldRect {
  const width = e.text.length * CHAR_WIDTH_EM * e.size
  return { minX: e.x, minY: e.y, maxX: e.x + width, maxY: e.y + e.size }
}

/**
 * The dimension line of a linear dimension: the measured segment translated
 * by `offset` along its left-hand normal (positive offset sits left of the
 * x1,y1 → x2,y2 direction). Degenerate segments collapse onto their anchor.
 */
export function dimLine(e: DimEntity): { a: WorldPoint; b: WorldPoint } {
  const dx = e.x2 - e.x1
  const dy = e.y2 - e.y1
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    const p = { x: e.x1, y: e.y1 }
    return { a: p, b: p }
  }
  const nx = -dy / length
  const ny = dx / length
  const off = e.offset
  return {
    a: { x: e.x1 + nx * off, y: e.y1 + ny * off },
    b: { x: e.x2 + nx * off, y: e.y2 + ny * off },
  }
}

/**
 * Signed perpendicular offset of `p` from the measured segment `first`–`second`
 * (left of the first→second direction is positive). Degenerate segments yield 0.
 */
export function dimOffset(first: WorldPoint, second: WorldPoint, p: WorldPoint): number {
  const dx = second.x - first.x
  const dy = second.y - first.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0
  return (dx * (p.y - first.y) - dy * (p.x - first.x)) / length
}

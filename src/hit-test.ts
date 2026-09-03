/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { CircleEntity, DrawingDocument, Entity, RectEntity } from './document.js'
import type { WorldPoint } from './viewport.js'

/**
 * Geometric hit testing in world space — a zoom-independent replacement for
 * pixel picking. Distances are world units; the caller scales its screen
 * tolerance (px) by the viewport scale.
 */

/** Shortest distance from `p` to the segment `a`–`b`. */
export function distanceToLineSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  // Degenerate segment collapses to its anchor point.
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0), 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance from `p` to a circle's edge: |distance-to-centre − radius|. */
export function distanceToCircle(p: WorldPoint, e: CircleEntity): number {
  return Math.abs(Math.hypot(p.x - e.cx, p.y - e.cy) - e.r)
}

/**
 * Distance from `p` to a rect's boundary. Interior points hit at 0
 * (edge-or-interior semantics).
 */
export function distanceToRect(p: WorldPoint, e: RectEntity): number {
  const x2 = e.x + e.w
  const y2 = e.y + e.h
  if (p.x >= e.x && p.x <= x2 && p.y >= e.y && p.y <= y2) return 0
  const corners = [
    { x: e.x, y: e.y },
    { x: x2, y: e.y },
    { x: x2, y: y2 },
    { x: e.x, y: y2 },
  ]
  return Math.min(...corners.map((corner, i) => distanceToLineSegment(p, corner, corners[(i + 1) % corners.length])))
}

export function distanceToEntity(p: WorldPoint, entity: Entity): number {
  switch (entity.type) {
    case 'line':
      return distanceToLineSegment(p, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 })
    case 'circle':
      return distanceToCircle(p, entity)
    case 'rect':
      return distanceToRect(p, entity)
  }
}

/** Nearest entity within `tolerance` world units of `p`, or null on a miss. */
export function hitTest(doc: DrawingDocument, p: WorldPoint, tolerance: number): Entity | null {
  let best: Entity | null = null
  let bestDistance = Infinity
  for (const entity of doc.entities) {
    const distance = distanceToEntity(p, entity)
    if (distance <= tolerance && distance < bestDistance) {
      best = entity
      bestDistance = distance
    }
  }
  return best
}

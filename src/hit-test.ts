/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { CircleEntity, DrawingDocument, Entity, RectEntity } from './document.js'
import { dimLine, textBounds, type DimGeometry, type TextGeometry } from './geometry.js'
import type { WorldPoint, WorldRect } from './viewport.js'

/**
 * Geometric hit testing in world space — a zoom-independent replacement for
 * pixel picking. Distances are world units; the caller scales its screen
 * tolerance (px) by the viewport scale. Like geometry, these helpers never
 * read `layerId`.
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
export function distanceToCircle(p: WorldPoint, e: Omit<CircleEntity, 'layerId'>): number {
  return Math.abs(Math.hypot(p.x - e.cx, p.y - e.cy) - e.r)
}

/**
 * Distance from `p` to a world rect's boundary. Interior points hit at 0
 * (edge-or-interior semantics).
 */
export function distanceToWorldRect(p: WorldPoint, r: WorldRect): number {
  if (p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY) return 0
  const corners = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ]
  return Math.min(...corners.map((corner, i) => distanceToLineSegment(p, corner, corners[(i + 1) % corners.length])))
}

/** Distance from `p` to a rect's boundary (edge-or-interior semantics). */
export function distanceToRect(p: WorldPoint, e: Omit<RectEntity, 'layerId'>): number {
  return distanceToWorldRect(p, {
    minX: Math.min(e.x, e.x + e.w),
    minY: Math.min(e.y, e.y + e.h),
    maxX: Math.max(e.x, e.x + e.w),
    maxY: Math.max(e.y, e.y + e.h),
  })
}

/** Distance from `p` to a text entity's bounding box (interior hits at 0). */
export function distanceToText(p: WorldPoint, e: TextGeometry): number {
  return distanceToWorldRect(p, textBounds(e))
}

/** Distance from `p` to a dimension's offset dimension line. */
export function distanceToDim(p: WorldPoint, e: DimGeometry): number {
  const { a, b } = dimLine(e)
  return distanceToLineSegment(p, a, b)
}

export function distanceToEntity(p: WorldPoint, entity: Entity): number {
  switch (entity.type) {
    case 'line':
      return distanceToLineSegment(p, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 })
    case 'circle':
      return distanceToCircle(p, entity)
    case 'rect':
      return distanceToRect(p, entity)
    case 'text':
      return distanceToText(p, entity)
    case 'dim':
      return distanceToDim(p, entity)
  }
}

/**
 * Nearest entity within `tolerance` world units of `p`, or null on a miss.
 * Layer enforcement lives here at pick time: entities on invisible layers
 * are never seen, and locked layers are additionally unselectable — the
 * canvas page refuses edits to locked layers via `isEditable`.
 */
export function hitTest(doc: DrawingDocument, p: WorldPoint, tolerance: number): Entity | null {
  const layers = new Map(doc.layers.map(layer => [layer.id, layer]))
  let best: Entity | null = null
  let bestDistance = Infinity
  for (const entity of doc.entities) {
    const layer = layers.get(entity.layerId)
    if (layer === undefined || !layer.visible || layer.locked) continue
    const distance = distanceToEntity(p, entity)
    if (distance <= tolerance && distance < bestDistance) {
      best = entity
      bestDistance = distance
    }
  }
  return best
}

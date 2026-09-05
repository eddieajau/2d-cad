/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { CircleEntity, DrawingDocument, LineEntity, Entity, RectEntity } from './document.js'
import { circleBand, rectBand, dimLine, textBounds, type DimGeometry, type TextGeometry } from './geometry.js'
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

/**
 * Distance from `p` to a circle's band: zero anywhere within the band
 * (between the outer face and the inner face, faces included), the
 * overshoot beyond the nearest face otherwise. Thickness 0 measures to the
 * drawn edge from both sides — the hairline's symmetric distance.
 */
export function distanceToCircle(p: WorldPoint, e: Omit<CircleEntity, 'layerId'>): number {
  const d = Math.hypot(p.x - e.cx, p.y - e.cy)
  const { inner } = circleBand(e.r, e.thickness)
  if (d > e.r) return d - e.r
  if (d < inner) return inner - d
  return 0
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

/**
 * Distance from `p` to a rect's thickness band: zero anywhere within the
 * band (inside the outer face, outside the inner face, faces included);
 * the distance to the nearest band boundary outside it. Points inside the
 * inner void measure to the nearest inner face, and a thickness that
 * closes the envelope leaves only the clamped 1 mm core measuring
 * positive. Thickness 0 keeps the hairline's edge-or-interior semantics:
 * the band is the envelope, so every interior point hits at 0.
 */
export function distanceToRect(p: WorldPoint, e: Omit<RectEntity, 'layerId'>): number {
  const { outer, inner } = rectBand(e)
  if (!withinRect(p, outer)) return distanceToWorldRect(p, outer)
  // No void when the band collapsed onto the envelope (thickness 0) —
  // every interior point hits at 0, the hairline's edge-or-interior rule.
  const hasVoid =
    inner.minX > outer.minX || inner.minY > outer.minY || inner.maxX < outer.maxX || inner.maxY < outer.maxY
  if (!hasVoid || !withinRect(p, inner)) return 0
  return Math.min(p.x - inner.minX, inner.maxX - p.x, p.y - inner.minY, inner.maxY - p.y)
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

/** Whether `p` sits within (or on the boundary of) `r`. */
function withinRect(p: WorldPoint, r: WorldRect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY
}

/**
 * Distance from `p` to a line's band. A line's band is centred on the path
 * (it has no inside), so any point within half the thickness of the path
 * hits at 0; beyond it the band overshoot is measured.
 */
export function distanceToLine(p: WorldPoint, e: Omit<LineEntity, 'layerId'>): number {
  const d = distanceToLineSegment(p, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 })
  return Math.max(0, d - Math.max(0, e.thickness ?? 0) / 2)
}

export function distanceToEntity(p: WorldPoint, entity: Entity): number {
  switch (entity.type) {
    case 'line':
      return distanceToLine(p, entity)
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

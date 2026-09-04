/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import {
  type AnchorCorner,
  type DimEntity,
  type Entity,
  type EntityDraft,
  type TextEntity,
  type WallEntity,
} from './document.js'
import type { WorldPoint, WorldRect } from './viewport.js'

/**
 * Geometric derivations shared by rendering, hit testing, and tools —
 * pure world-space math with no canvas or viewport dependency.
 *
 * Geometry never reads `layerId`, so params accept the entity type without
 * it (drafts from tools satisfy these too).
 */

/** A text entity without its layer reference. */
export type TextGeometry = Omit<TextEntity, 'layerId'>

/** A dim entity without its layer reference. */
export type DimGeometry = Omit<DimEntity, 'layerId'>

/** A wall entity without its layer reference. */
export type WallGeometry = Omit<WallEntity, 'layerId'>

/**
 * Approximate advance width per character, in em, for the single drafting
 * font (sans-serif). Only used where a canvas cannot measure text.
 */
const CHAR_WIDTH_EM = 0.6

/**
 * Bounding box of a text entity: baseline-left anchor, ascending by the
 * font size (world is y-up), width approximated for the drafting font.
 */
export function textBounds(e: TextGeometry): WorldRect {
  const width = e.text.length * CHAR_WIDTH_EM * e.size
  return { minX: e.x, minY: e.y, maxX: e.x + width, maxY: e.y + e.size }
}

/**
 * The dimension line of a linear dimension: the measured segment translated
 * by `offset` along its left-hand normal (positive offset sits left of the
 * x1,y1 → x2,y2 direction). Degenerate segments collapse onto their anchor.
 */
export function dimLine(e: DimGeometry): { a: WorldPoint; b: WorldPoint } {
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

/** Normalised world rect from an envelope drawn corner-to-corner. */
function envelopeRect(e: WallGeometry): WorldRect {
  return {
    minX: Math.min(e.x, e.x + e.w),
    minY: Math.min(e.y, e.y + e.h),
    maxX: Math.max(e.x, e.x + e.w),
    maxY: Math.max(e.y, e.y + e.h),
  }
}

/** Inset a rect inward by `t` on every face; inverted when `t` exceeds a span. */
function insetRect(r: WorldRect, t: number): WorldRect {
  return { minX: r.minX + t, minY: r.minY + t, maxX: r.maxX - t, maxY: r.maxY - t }
}

/**
 * Named reference points on an entity, used by the offset tool to anchor a
 * typed dx/dy (and by reference positioning): rect/wall corners (of the
 * normalised envelope, world y-up), circle cardinal points, and line
 * endpoints. The names are the model's `AnchorCorner` union, shared with
 * `EntityRef.corner`.
 */
export type EntityAnchor = AnchorCorner

/** The anchor corners each entity type offers; text and dim offer none. */
const ANCHORS: Record<Entity['type'], readonly EntityAnchor[]> = {
  line: ['start', 'end'],
  circle: ['n', 'e', 's', 'w'],
  rect: ['nw', 'ne', 'sw', 'se'],
  wall: ['nw', 'ne', 'sw', 'se'],
  text: [],
  dim: [],
}

/**
 * The named anchor `corner` of `entity`, or null when the corner does not
 * apply to the entity's type (text and dim have no anchors at all).
 */
export function anchorPoint(entity: EntityDraft, corner: EntityAnchor): WorldPoint | null {
  switch (entity.type) {
    case 'rect':
    case 'wall': {
      const minX = Math.min(entity.x, entity.x + entity.w)
      const maxX = Math.max(entity.x, entity.x + entity.w)
      const minY = Math.min(entity.y, entity.y + entity.h)
      const maxY = Math.max(entity.y, entity.y + entity.h)
      switch (corner) {
        case 'nw':
          return { x: minX, y: maxY }
        case 'ne':
          return { x: maxX, y: maxY }
        case 'sw':
          return { x: minX, y: minY }
        case 'se':
          return { x: maxX, y: minY }
        default:
          return null
      }
    }
    case 'circle':
      switch (corner) {
        case 'n':
          return { x: entity.cx, y: entity.cy + entity.r }
        case 'e':
          return { x: entity.cx + entity.r, y: entity.cy }
        case 's':
          return { x: entity.cx, y: entity.cy - entity.r }
        case 'w':
          return { x: entity.cx - entity.r, y: entity.cy }
        default:
          return null
      }
    case 'line':
      switch (corner) {
        case 'start':
          return { x: entity.x1, y: entity.y1 }
        case 'end':
          return { x: entity.x2, y: entity.y2 }
        default:
          return null
      }
    default:
      return null
  }
}

/**
 * The anchor of `entity` nearest to `p` — how the offset tool turns a click
 * on a source entity into its reference corner. Null when the entity has no
 * anchors (text, dim) and so cannot be offset.
 */
export function nearestAnchor(entity: EntityDraft, p: WorldPoint): { corner: EntityAnchor; point: WorldPoint } | null {
  let best: { corner: EntityAnchor; point: WorldPoint } | null = null
  let bestDistance = Infinity
  for (const corner of ANCHORS[entity.type]) {
    const point = anchorPoint(entity, corner)
    if (point === null) continue
    const distance = Math.hypot(p.x - point.x, p.y - point.y)
    if (distance < bestDistance) {
      best = { corner, point }
      bestDistance = distance
    }
  }
  return best
}

/**
 * The wall band for an entity: the outer face rect and the inner face rect,
 * both normalised. The envelope as drawn is the face named by `alignment`
 * and the thickness grows to the opposite side — `'outer'` keeps the drawn
 * rect as the band's outer boundary, `'inner'` as its inner boundary, and
 * `'centre'` straddles it by thickness/2. Degenerate (≤ 0) thickness
 * collapses the band onto the drawn rect: inner equals outer.
 */
export function wallBand(e: WallGeometry): { outer: WorldRect; inner: WorldRect } {
  const envelope = envelopeRect(e)
  const t = Math.max(0, e.thickness)
  if (t === 0) return { outer: envelope, inner: envelope }
  switch (e.alignment) {
    case 'outer':
      return { outer: envelope, inner: insetRect(envelope, t) }
    case 'inner':
      return { outer: insetRect(envelope, -t), inner: envelope }
    case 'centre':
      return { outer: insetRect(envelope, -t / 2), inner: insetRect(envelope, t / 2) }
  }
}

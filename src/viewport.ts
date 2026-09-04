/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

/**
 * The screen↔world transform. World space is y-up (drafting convention);
 * screen space is y-down (canvas) — the flip lives here and nowhere else.
 */
export interface Viewport {
  readonly offsetX: number
  readonly offsetY: number
  readonly scale: number
}

export interface ScreenPoint {
  readonly sx: number
  readonly sy: number
}

export interface WorldPoint {
  readonly x: number
  readonly y: number
}

export function screenToWorld(v: Viewport, sx: number, sy: number): WorldPoint {
  return { x: (sx - v.offsetX) / v.scale, y: -(sy - v.offsetY) / v.scale }
}

export function worldToScreen(v: Viewport, x: number, y: number): ScreenPoint {
  return { sx: x * v.scale + v.offsetX, sy: -y * v.scale + v.offsetY }
}

export interface WorldRect {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** The world-space rect currently visible on a `width` × `height` screen. */
export function visibleWorldRect(v: Viewport, width: number, height: number): WorldRect {
  const bottomLeft = screenToWorld(v, 0, height)
  const topRight = screenToWorld(v, width, 0)
  return {
    minX: bottomLeft.x,
    minY: bottomLeft.y,
    maxX: topRight.x,
    maxY: topRight.y,
  }
}

/** Zoom keeping the world point under the given screen position fixed. */
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = v.scale * factor
  if (!Number.isFinite(scale) || scale <= 0) return v
  const { x, y } = screenToWorld(v, sx, sy)
  return { offsetX: sx - x * scale, offsetY: sy + y * scale, scale }
}

/** Pan by a screen-space delta. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { offsetX: v.offsetX + dx, offsetY: v.offsetY + dy, scale: v.scale }
}

/** Scale floor for degenerate bounds — a point has no extent to fit. */
const MIN_FIT_SCALE = 1

/**
 * The viewport that frames `bounds` as large as the screen allows: the
 * smaller of the width/height fit scales (aspect preserved), bounds centre
 * on the screen centre, `marginPx` of breathing room each side. Degenerate
 * bounds (a single point, or a screen smaller than the margin) clamp to
 * {@link MIN_FIT_SCALE}. A `null` bounds (empty document) returns the
 * default first-sight view — origin centred at unit scale, the same
 * centring the canvas applies on first layout.
 */
export function fitExtents(
  viewport: Viewport,
  bounds: WorldRect | null,
  width: number,
  height: number,
  marginPx: number
): Viewport {
  if (bounds === null) {
    return panBy({ offsetX: 0, offsetY: 0, scale: 1 }, width / 2, height / 2)
  }
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  // A zero span yields an Infinity ratio, which min() discards in favour of
  // the other axis — only a fully degenerate bounds needs the clamp.
  const scale = Math.min((width - 2 * marginPx) / w, (height - 2 * marginPx) / h)
  const fitScale = Number.isFinite(scale) && scale > 0 ? scale : MIN_FIT_SCALE
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  // Keep `viewport` in the signature for call-site symmetry; the fitted view
  // replaces it wholesale.
  void viewport
  return { offsetX: width / 2 - cx * fitScale, offsetY: height / 2 + cy * fitScale, scale: fitScale }
}

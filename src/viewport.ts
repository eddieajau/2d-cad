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

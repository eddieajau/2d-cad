/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { WorldPoint } from './viewport.js'

/** Pointer snapping modes: off, or snapped to a world-space grid. */
export type SnapMode = 'off' | 'grid'

/**
 * Snap interval in world units when the viewport scale is unknown; matches
 * the rendered grid's minor interval at the default scale of 1.
 */
export const DEFAULT_SNAP_GRID = 10

/** Round a world point to the nearest multiple of `grid`. */
export function snapToGrid(p: WorldPoint, grid: number): WorldPoint {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
}

/**
 * Resolve a snap mode into the effective grid interval; `null` when snapping
 * is off. Callers pass the rendered grid's minor interval so snapped input
 * lands exactly on drawn grid lines (default: {@link DEFAULT_SNAP_GRID}).
 */
export function resolveSnapGrid(mode: SnapMode, grid: number = DEFAULT_SNAP_GRID): number | null {
  return mode === 'off' ? null : grid
}

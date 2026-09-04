/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type WallEntity } from '../document.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export interface WallToolState extends ToolState {
  /** First corner set on pointerdown; absent until a gesture starts. */
  readonly anchor?: WorldPoint
}

/** A layerless draft — `addEntity` assigns the active layer on commit. */
function makeWall(a: WorldPoint, b: WorldPoint, thickness: number): Omit<WallEntity, 'layerId'> {
  return {
    id: createEntityId(),
    type: 'wall',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    thickness,
    alignment: 'outer',
  }
}

/**
 * Corner-to-corner wall envelope, exactly like the rect tool; the commit
 * carries the thickness from the context (the palette's page state) with the
 * default `'outer'` alignment — draw the outer face, walls grow inward.
 */
export class WallTool implements Tool<WallToolState> {
  readonly id: ToolId = 'wall'

  init(): WallToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: WallToolState, world: WorldPoint, _ev: PointerEvent): WallToolState {
    return { anchor: world }
  }

  onPointerMove(ctx: ToolContext, state: WallToolState, world: WorldPoint, _ev: PointerEvent): WallToolState {
    if (!state.anchor) return state
    return { anchor: state.anchor, preview: makeWall(state.anchor, world, ctx.wallThickness) }
  }

  onPointerUp(
    ctx: ToolContext,
    state: WallToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<WallToolState> {
    const next: WallToolState = {}
    if (!state.anchor) return { state: next }
    const wall = makeWall(state.anchor, world, ctx.wallThickness)
    // Zero-width or zero-height drags are degenerate — drop them.
    if (wall.w === 0 || wall.h === 0) return { state: next }
    return { state: next, commit: { kind: 'add', entity: wall } }
  }

  onKey(state: WallToolState, ev: KeyboardEvent): WallToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

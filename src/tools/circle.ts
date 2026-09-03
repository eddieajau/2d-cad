/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type CircleEntity } from '../document.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export interface CircleToolState extends ToolState {
  /** Centre point set on pointerdown; absent until a gesture starts. */
  readonly anchor?: WorldPoint
}

function makeCircle(centre: WorldPoint, edge: WorldPoint): CircleEntity {
  return {
    id: createEntityId(),
    type: 'circle',
    cx: centre.x,
    cy: centre.y,
    r: Math.hypot(edge.x - centre.x, edge.y - centre.y),
  }
}

/** Centre + radius circle: pointerdown anchors the centre, drag sets the radius, up commits. */
export class CircleTool implements Tool<CircleToolState> {
  readonly id: ToolId = 'circle'

  init(): CircleToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: CircleToolState, world: WorldPoint, _ev: PointerEvent): CircleToolState {
    return { anchor: world }
  }

  onPointerMove(_ctx: ToolContext, state: CircleToolState, world: WorldPoint, _ev: PointerEvent): CircleToolState {
    if (!state.anchor) return state
    return { anchor: state.anchor, preview: makeCircle(state.anchor, world) }
  }

  onPointerUp(
    _ctx: ToolContext,
    state: CircleToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<CircleToolState> {
    const next: CircleToolState = {}
    if (!state.anchor) return { state: next }
    const circle = makeCircle(state.anchor, world)
    // A click without drag has zero radius — drop it.
    if (circle.r === 0) return { state: next }
    return { state: next, commit: circle }
  }

  onKey(state: CircleToolState, ev: KeyboardEvent): CircleToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

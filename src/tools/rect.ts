/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type RectEntity } from '../document.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export interface RectToolState extends ToolState {
  /** First corner set on pointerdown; absent until a gesture starts. */
  readonly anchor?: WorldPoint
}

function makeRect(a: WorldPoint, b: WorldPoint): RectEntity {
  return {
    id: createEntityId(),
    type: 'rect',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/** Corner-to-corner rect: pointerdown anchors, move previews, up commits. */
export class RectTool implements Tool<RectToolState> {
  readonly id: ToolId = 'rect'

  init(): RectToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: RectToolState, world: WorldPoint, _ev: PointerEvent): RectToolState {
    return { anchor: world }
  }

  onPointerMove(_ctx: ToolContext, state: RectToolState, world: WorldPoint, _ev: PointerEvent): RectToolState {
    if (!state.anchor) return state
    return { anchor: state.anchor, preview: makeRect(state.anchor, world) }
  }

  onPointerUp(
    _ctx: ToolContext,
    state: RectToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<RectToolState> {
    const next: RectToolState = {}
    if (!state.anchor) return { state: next }
    const rect = makeRect(state.anchor, world)
    // Zero-width or zero-height drags are degenerate — drop them.
    if (rect.w === 0 || rect.h === 0) return { state: next }
    return { state: next, commit: rect }
  }

  onKey(state: RectToolState, ev: KeyboardEvent): RectToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

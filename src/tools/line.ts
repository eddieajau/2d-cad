/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type LineEntity } from '../document.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export interface LineToolState extends ToolState {
  /** Anchor point set on pointerdown; absent until a gesture starts. */
  readonly anchor?: WorldPoint
}

function makeLine(a: WorldPoint, b: WorldPoint): LineEntity {
  return { id: createEntityId(), type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

/** Click-drag line drawing: pointerdown anchors, move previews, up commits. */
export class LineTool implements Tool<LineToolState> {
  readonly id: ToolId = 'line'

  init(): LineToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: LineToolState, world: WorldPoint, _ev: PointerEvent): LineToolState {
    return { anchor: world }
  }

  onPointerMove(_ctx: ToolContext, state: LineToolState, world: WorldPoint, _ev: PointerEvent): LineToolState {
    if (!state.anchor) return state
    return { anchor: state.anchor, preview: makeLine(state.anchor, world) }
  }

  onPointerUp(
    _ctx: ToolContext,
    state: LineToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<LineToolState> {
    const next: LineToolState = {}
    if (!state.anchor) return { state: next }
    // A click without drag would be a degenerate zero-length line — drop it.
    if (world.x === state.anchor.x && world.y === state.anchor.y) return { state: next }
    return { state: next, commit: { kind: 'add', entity: makeLine(state.anchor, world) } }
  }

  onKey(state: LineToolState, ev: KeyboardEvent): LineToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

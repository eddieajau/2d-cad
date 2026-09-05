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

/** A layerless draft — `addEntity` assigns the active layer on commit. */
function makeRect(a: WorldPoint, b: WorldPoint, thickness: number): Omit<RectEntity, 'layerId'> {
  return {
    id: createEntityId(),
    type: 'rect',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    // A zero context thickness is the hairline — omit the key so the
    // committed rect serializes exactly as a plain rect.
    ...(thickness > 0 ? { thickness } : {}),
  }
}

/**
 * Corner-to-corner rect, exactly like the hairline tool; the commit and
 * preview carry the thickness from the context (the palette's page state)
 * so thick shapes can be drawn, not just edited. Per-edge overrides are an
 * editing concern (the properties panel) — the tool draws uniformly.
 */
export class RectTool implements Tool<RectToolState> {
  readonly id: ToolId = 'rect'

  init(): RectToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: RectToolState, world: WorldPoint, _ev: PointerEvent): RectToolState {
    return { anchor: world }
  }

  onPointerMove(ctx: ToolContext, state: RectToolState, world: WorldPoint, _ev: PointerEvent): RectToolState {
    if (!state.anchor) return state
    return { anchor: state.anchor, preview: makeRect(state.anchor, world, ctx.rectThickness) }
  }

  onPointerUp(
    ctx: ToolContext,
    state: RectToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<RectToolState> {
    const next: RectToolState = {}
    if (!state.anchor) return { state: next }
    const rect = makeRect(state.anchor, world, ctx.rectThickness)
    // Zero-width or zero-height drags are degenerate — drop them.
    if (rect.w === 0 || rect.h === 0) return { state: next }
    return { state: next, commit: { kind: 'add', entity: rect } }
  }

  onKey(state: RectToolState, ev: KeyboardEvent): RectToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

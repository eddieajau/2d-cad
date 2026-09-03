/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, translateEntity, type Entity, type EntityId } from '../document.js'
import { hitTest } from '../hit-test.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

/** Click tolerance for hit testing, in screen pixels. */
export const SELECT_TOLERANCE_PX = 8

export interface SelectDrag {
  readonly id: EntityId
  /** Entity snapshot from drag start — the source for both move and copy. */
  readonly entity: Entity
  readonly origin: WorldPoint
  readonly dx: number
  readonly dy: number
  /** Copy mode engaged (Alt held at some point during the drag). */
  readonly copy: boolean
  /** Fixed id for the clone preview/commit, minted once at drag start. */
  readonly ghostId: EntityId
}

export interface SelectToolState extends ToolState {
  readonly drag?: SelectDrag
}

/**
 * Idle mode: pointerdown on a hit entity begins a drag; moving previews via
 * `preview` (the translated entity for a move, a fixed-id clone ghost for a
 * copy); pointerup commits a single `update` (move) or `add` (Alt-copy) op.
 * Selection itself remains canvas UI state — the canvas hit-tests on
 * pointerdown and reselects the clone via `result.select`.
 */
export class SelectTool implements Tool<SelectToolState> {
  readonly id: ToolId = 'select'

  init(): SelectToolState {
    return {}
  }

  onPointerDown(ctx: ToolContext, _state: SelectToolState, world: WorldPoint, ev: PointerEvent): SelectToolState {
    const tolerance = SELECT_TOLERANCE_PX / ctx.viewport.scale
    const hit = hitTest(ctx.doc, world, tolerance)
    if (hit === null) return {}
    return {
      drag: {
        id: hit.id,
        entity: hit,
        origin: world,
        dx: 0,
        dy: 0,
        copy: ev.altKey,
        ghostId: createEntityId(),
      },
    }
  }

  onPointerMove(_ctx: ToolContext, state: SelectToolState, world: WorldPoint, ev: PointerEvent): SelectToolState {
    const drag = state.drag
    if (!drag) return state
    const dx = world.x - drag.origin.x
    const dy = world.y - drag.origin.y
    if (dx === 0 && dy === 0) return state
    const copy = drag.copy || ev.altKey
    if (copy) {
      const ghost = { ...translateEntity(drag.entity, dx, dy), id: drag.ghostId }
      return { drag: { ...drag, dx, dy, copy: true }, preview: ghost }
    }
    return { drag: { ...drag, dx, dy }, preview: translateEntity(drag.entity, dx, dy) }
  }

  onPointerUp(
    _ctx: ToolContext,
    state: SelectToolState,
    world: WorldPoint,
    ev: PointerEvent
  ): ToolPointerResult<SelectToolState> {
    const drag = state.drag
    if (!drag) return { state: {} }
    const dx = world.x - drag.origin.x
    const dy = world.y - drag.origin.y
    // Zero offset is a click, not a drag — no document delta.
    if (dx === 0 && dy === 0) return { state: {} }
    if (ev.altKey || drag.copy) {
      const clone = { ...translateEntity(drag.entity, dx, dy), id: drag.ghostId }
      return { state: {}, commit: { kind: 'add', entity: clone }, select: drag.ghostId }
    }
    return { state: {}, commit: { kind: 'update', entity: translateEntity(drag.entity, dx, dy) } }
  }

  onKey(state: SelectToolState, ev: KeyboardEvent): SelectToolState {
    // Cancels an in-progress drag; the document was never touched, so
    // "pre-drag state" is exactly the initial state.
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

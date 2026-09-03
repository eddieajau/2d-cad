/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type DimEntity } from '../document.js'
import { dimOffset } from '../geometry.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export interface DimToolState extends ToolState {
  /** First measured point, set by the first click. */
  readonly first?: WorldPoint
  /** Second measured point, set by the second click which starts the drag. */
  readonly second?: WorldPoint
}

function makeDim(first: WorldPoint, second: WorldPoint, offset: number): DimEntity {
  return {
    id: createEntityId(),
    type: 'dim',
    x1: first.x,
    y1: first.y,
    x2: second.x,
    y2: second.y,
    offset,
  }
}

/**
 * Two clicks set the measured points; the second click also starts a drag
 * whose pointer position sets the dimension line's offset. Pointerup commits.
 */
export class DimTool implements Tool<DimToolState> {
  readonly id: ToolId = 'dim'

  init(): DimToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, state: DimToolState, world: WorldPoint, _ev: PointerEvent): DimToolState {
    if (!state.first) return { first: world }
    if (!state.second) return { first: state.first, second: world }
    return state
  }

  onPointerMove(_ctx: ToolContext, state: DimToolState, world: WorldPoint, _ev: PointerEvent): DimToolState {
    const { first, second } = state
    if (!first) return state
    // Rubber band while placing the second measured point…
    if (!second)
      return {
        first,
        preview: { id: createEntityId(), type: 'line', x1: first.x, y1: first.y, x2: world.x, y2: world.y },
      }
    // …then the offset drag previews the dimension itself.
    return { first, second, preview: makeDim(first, second, dimOffset(first, second, world)) }
  }

  onPointerUp(
    _ctx: ToolContext,
    state: DimToolState,
    world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<DimToolState> {
    const { first, second } = state
    if (!first || !second) return { state }
    const offset = dimOffset(first, second, world)
    // A degenerate measurement (coincident points) places nothing.
    if (first.x === second.x && first.y === second.y) return { state: {} }
    return { state: {}, commit: { kind: 'add', entity: makeDim(first, second, offset) } }
  }

  onKey(state: DimToolState, ev: KeyboardEvent): DimToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

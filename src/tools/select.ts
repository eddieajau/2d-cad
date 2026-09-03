/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

export type SelectToolState = ToolState

/**
 * Idle mode: no gesture of its own. Selection (hit testing, Delete, Escape)
 * is canvas UI state, so the canvas handles those interactions directly and
 * this tool simply occupies the registry.
 */
export class SelectTool implements Tool<SelectToolState> {
  readonly id: ToolId = 'select'

  init(): SelectToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, state: SelectToolState, _world: WorldPoint, _ev: PointerEvent): SelectToolState {
    return state
  }

  onPointerMove(_ctx: ToolContext, state: SelectToolState, _world: WorldPoint, _ev: PointerEvent): SelectToolState {
    return state
  }

  onPointerUp(
    _ctx: ToolContext,
    state: SelectToolState,
    _world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<SelectToolState> {
    return { state }
  }
}

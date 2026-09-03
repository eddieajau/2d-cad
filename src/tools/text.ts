/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, type TextEntity } from '../document.js'
import type { WorldPoint } from '../viewport.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

/** Default font size for new text, in world units. */
export const TEXT_DEFAULT_SIZE = 12

export interface TextToolState extends ToolState {
  /** Anchor point fixed by the placing click; the canvas edits text here. */
  readonly placing?: WorldPoint
}

/**
 * Click to place, then the canvas element opens its inline input over the
 * anchor. The tool never touches the DOM: the canvas feeds the committed
 * value (or `null` on cancel) back through `onTextCommit`.
 */
export class TextTool implements Tool<TextToolState> {
  readonly id: ToolId = 'text'

  init(): TextToolState {
    return {}
  }

  onPointerDown(_ctx: ToolContext, _state: TextToolState, world: WorldPoint, _ev: PointerEvent): TextToolState {
    return { placing: world }
  }

  // The anchor is fixed by the click; moves do nothing until entry completes.
  onPointerMove(_ctx: ToolContext, state: TextToolState, _world: WorldPoint, _ev: PointerEvent): TextToolState {
    return state
  }

  onPointerUp(
    _ctx: ToolContext,
    state: TextToolState,
    _world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<TextToolState> {
    return { state }
  }

  onTextCommit(state: TextToolState, value: string | null): ToolPointerResult<TextToolState> {
    const placing = state.placing
    // Cancel or a blank entry places nothing.
    if (!placing || value === null || value.trim() === '') return { state: {} }
    const entity: TextEntity = {
      id: createEntityId(),
      type: 'text',
      x: placing.x,
      y: placing.y,
      text: value,
      size: TEXT_DEFAULT_SIZE,
    }
    return { state: {}, commit: { kind: 'add', entity } }
  }

  onKey(state: TextToolState, ev: KeyboardEvent): TextToolState {
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DrawingDocument, Entity } from '../document.js'
import type { Viewport, WorldPoint } from '../viewport.js'

export type ToolId = 'select' | 'line' | 'rect' | 'circle'

/** Snapshot of the drawing session handed to a tool with every event. */
export interface ToolContext {
  readonly doc: DrawingDocument
  readonly viewport: Viewport
}

export interface ToolState {
  /** Entity drawn on top of the scene while the tool is mid-gesture. */
  readonly preview?: Entity
}

export interface ToolPointerResult<S extends ToolState> {
  state: S
  /** Entity to add to the document, if the gesture completed. */
  commit?: Entity
}

/**
 * A tool is a stateless state machine: every handler takes the current state
 * and returns the next. The element owns the state; tools never reach back
 * into the UI.
 */
export interface Tool<S extends ToolState = ToolState> {
  readonly id: ToolId
  init(): S
  onPointerDown(ctx: ToolContext, state: S, world: WorldPoint, ev: PointerEvent): S
  onPointerMove(ctx: ToolContext, state: S, world: WorldPoint, ev: PointerEvent): S
  onPointerUp(ctx: ToolContext, state: S, world: WorldPoint, ev: PointerEvent): ToolPointerResult<S>
  /** Optional keyboard hook; Escape-to-cancel is the expected use. */
  onKey?(state: S, ev: KeyboardEvent): S
}

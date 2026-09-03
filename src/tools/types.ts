/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DrawingDocument, Entity, EntityId } from '../document.js'
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

/**
 * A single document operation handed back on gesture completion. `add`
 * creates a new entity; `update` replaces the entity with the same id.
 * Keeping commits as discrete ops lets undo (ticket 8) wrap each one.
 */
export type ToolCommit =
  | { readonly kind: 'add'; readonly entity: Entity }
  | { readonly kind: 'update'; readonly entity: Entity }

export interface ToolPointerResult<S extends ToolState> {
  state: S
  /** Document operation to apply, if the gesture completed. */
  commit?: ToolCommit
  /** Entity to make the active selection after applying the commit (copies). */
  select?: EntityId
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

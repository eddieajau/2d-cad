/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DrawingDocument, Entity, EntityDraft, EntityId } from '../document.js'
import type { Viewport, WorldPoint } from '../viewport.js'

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'text' | 'dim' | 'offset'

/** Snapshot of the drawing session handed to a tool with every event. */
export interface ToolContext {
  readonly doc: DrawingDocument
  readonly viewport: Viewport
  /**
   * Rect tool page state: the thickness (mm) the palette's context row
   * holds. Every tool sees it; only the rect tool consumes it.
   */
  readonly rectThickness: number
}

export interface ToolState {
  /** Entity drawn on top of the scene while the tool is mid-gesture. */
  readonly preview?: EntityDraft
}

/**
 * A single document operation handed back on gesture completion. `add`
 * creates a new entity (a draft — `addEntity` defaults its layer to the
 * active layer); `update` replaces the entity with the same id. Keeping
 * commits as discrete ops lets undo (ticket 8) wrap each one.
 */
export type ToolCommit =
  | { readonly kind: 'add'; readonly entity: EntityDraft }
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
  /**
   * Optional text-entry hook for tools that need inline text input. The
   * canvas element owns the `<input>` and feeds the committed value here —
   * `null` signals a cancelled entry. Only the text tool implements it.
   */
  onTextCommit?(state: S, value: string | null): ToolPointerResult<S>
  /**
   * Optional numeric-entry hook for tools that take typed dx/dy input from
   * the palette's context row (millimetres, negatives allowed). The canvas
   * element feeds the committed values here on Enter; `link` is the
   * palette's Link toggle — when on, the commit may attach a positional
   * reference to the source instead of baking coordinates. Only the offset
   * tool implements it.
   */
  onOffsetCommit?(state: S, dx: number, dy: number, link?: boolean): ToolPointerResult<S>
  /**
   * Optional live numeric-entry hook: called on every keystroke in the
   * palette's dx/dy inputs with the parsed values (`null` when a field is
   * empty or invalid, releasing the typed preview). Only the offset tool
   * implements it.
   */
  onOffsetEntry?(state: S, dx: number | null, dy: number | null): S
}

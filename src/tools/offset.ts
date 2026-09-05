/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { createEntityId, translateEntity, type Entity, type EntityDraft, type EntityId } from '../document.js'
import { nearestAnchor, type EntityAnchor } from '../geometry.js'
import { hitTest } from '../hit-test.js'
import type { WorldPoint } from '../viewport.js'
import { SELECT_TOLERANCE_PX } from './select.js'
import type { Tool, ToolContext, ToolId, ToolPointerResult, ToolState } from './types.js'

/** The picked source entity and the reference anchor chosen from the click. */
export interface OffsetSource {
  readonly entity: Entity
  readonly anchor: { readonly corner: EntityAnchor; readonly point: WorldPoint }
  /** Fixed id for the ghost preview and the committed clone. */
  readonly ghostId: EntityId
}

export interface OffsetToolState extends ToolState {
  /** Set once a source entity is clicked; the flow is active while present. */
  readonly source?: OffsetSource
  /** Working delta from the anchor to the pointer, driving the ghost preview. */
  readonly delta?: WorldPoint
  /**
   * Typed dx/dy while both entry fields hold values: the preview is pinned
   * at the typed position and pointer moves are ignored until the entry is
   * cleared or committed.
   */
  readonly typed?: WorldPoint
}

/** The offset copy: the source translated by (dx, dy) under a fresh id. */
function offsetClone(source: OffsetSource, dx: number, dy: number): EntityDraft {
  return { ...translateEntity(source.entity, dx, dy), id: source.ghostId }
}

/**
 * The classic drafting offset, digitised: click a source entity (rect,
 * circle, or line) — the anchor nearest the click becomes the reference
 * point — then moving previews a ghost copy whose delta follows the pointer.
 * Exact entry commits on Enter with the dx/dy typed into the palette's
 * context row: while both fields hold values the preview pins to the typed
 * position and the pointer is ignored, so what you see is what Enter
 * commits. With the palette's Link toggle on, the commit carries a
 * reference to the source's anchor; otherwise it is a plain translated
 * clone. A zero delta commits an explicit in-place stamp.
 */
export class OffsetTool implements Tool<OffsetToolState> {
  readonly id: ToolId = 'offset'

  init(): OffsetToolState {
    return {}
  }

  onPointerDown(ctx: ToolContext, state: OffsetToolState, world: WorldPoint, _ev: PointerEvent): OffsetToolState {
    const tolerance = SELECT_TOLERANCE_PX / ctx.viewport.scale
    const hit = hitTest(ctx.doc, world, tolerance)
    const anchor = hit !== null ? nearestAnchor(hit, world) : null
    // A miss (or a non-offsettable entity like text or dim) leaves the flow
    // as it was: idle stays idle, an active flow keeps its source.
    if (hit === null || anchor === null) return state
    return { source: { entity: hit, anchor, ghostId: createEntityId() } }
  }

  onPointerMove(_ctx: ToolContext, state: OffsetToolState, world: WorldPoint, _ev: PointerEvent): OffsetToolState {
    const { source } = state
    // While the typed entry holds, the preview is pinned — the pointer
    // cannot drag the ghost away from what Enter will commit.
    if (!source || state.typed) return state
    const delta = { x: world.x - source.anchor.point.x, y: world.y - source.anchor.point.y }
    return { source, delta, preview: offsetClone(source, delta.x, delta.y) }
  }

  // The pointer never commits — exact entry (or Escape) ends the flow.
  onPointerUp(
    _ctx: ToolContext,
    state: OffsetToolState,
    _world: WorldPoint,
    _ev: PointerEvent
  ): ToolPointerResult<OffsetToolState> {
    return { state }
  }

  onOffsetCommit(state: OffsetToolState, dx: number, dy: number, link = false): ToolPointerResult<OffsetToolState> {
    const { source } = state
    if (!source) return { state }
    const clone = offsetClone(source, dx, dy)
    // Link on: the clone carries a reference to the source's picked anchor
    // instead of baked coordinates, so moving the source drags the clone.
    // The ref points at the source's stored coordinates (refs never chain).
    const entity = link ? { ...clone, ref: { id: source.entity.id, corner: source.anchor.corner, dx, dy } } : clone
    return { state: {}, commit: { kind: 'add', entity }, select: source.ghostId }
  }

  onOffsetEntry(state: OffsetToolState, dx: number | null, dy: number | null): OffsetToolState {
    const { source } = state
    if (!source) return state
    // Both fields holding values pins the preview at the typed position;
    // anything else releases the pin back to pointer tracking.
    if (dx === null || dy === null) return state.typed ? { source } : state
    const typed = { x: dx, y: dy }
    return { source, typed, preview: offsetClone(source, dx, dy) }
  }

  onKey(state: OffsetToolState, ev: KeyboardEvent): OffsetToolState {
    // Backs out one step: preview (with the entry inputs showing) is left
    // for the entry inputs' own Escape; this unwinds to source selection.
    if (ev.key === 'Escape') return this.init()
    return state
  }
}

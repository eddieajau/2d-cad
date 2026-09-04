/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, createDocument, type DrawingDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { OffsetTool, type OffsetToolState } from './offset.js'
import type { ToolContext } from './types.js'

function makeCtx(doc: DrawingDocument): ToolContext {
  return {
    doc,
    viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
    wallThickness: 270,
  }
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')
const escape = new KeyboardEvent('keydown', { key: 'Escape' })

/** A 270 wall envelope at the origin — the ticket's site-plan case. */
function docWithWall(): DrawingDocument {
  return addEntity(createDocument(), {
    id: 'src',
    type: 'wall',
    x: 0,
    y: 0,
    w: 12000,
    h: 9000,
    thickness: 270,
    alignment: 'outer',
  })
}

describe('OffsetTool', () => {
  it('a source click picks the entity and its nearest anchor', () => {
    const tool = new OffsetTool()
    const state = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)

    expect(state.source?.entity.id).toBe('src')
    expect(state.source?.anchor).toEqual({ corner: 'sw', point: { x: 0, y: 0 } })
    expect(typeof state.source?.ghostId).toBe('string')
  })

  it('a miss or a non-offsettable entity leaves the flow as it was', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(addEntity(createDocument(), { id: 't1', type: 'text', x: 0, y: 0, text: 'note', size: 300 }))

    expect(tool.onPointerDown(ctx, tool.init(), { x: 10, y: 10 }, down)).toEqual({})

    // With a flow active, a stray click keeps the picked source.
    let state: OffsetToolState = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)
    state = tool.onPointerDown(ctx, state, { x: 10, y: 10 }, down)
    expect(state.source?.entity.id).toBe('src')
  })

  it('moving previews a ghost clone tracking the pointer from the anchor', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)
    const ghostId = state.source!.ghostId

    state = tool.onPointerMove(ctx, state, { x: -6000, y: -1500 }, move)
    expect(state.delta).toEqual({ x: -6000, y: -1500 })
    expect(state.preview).toEqual({
      id: ghostId,
      type: 'wall',
      layerId: 'layer-0',
      x: -6000,
      y: -1500,
      w: 12000,
      h: 9000,
      thickness: 270,
      alignment: 'outer',
    })
  })

  it('pointerup never commits — exact entry ends the flow', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)
    state = tool.onPointerMove(ctx, state, { x: 500, y: 500 }, move)

    expect(tool.onPointerUp(ctx, state, { x: 500, y: 500 }, up).commit).toBeUndefined()
  })

  it('typed dx/dy commits a clone at source anchor + (dx, dy) and selects it', () => {
    const tool = new OffsetTool()
    let state = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)
    const ghostId = state.source!.ghostId

    const result = tool.onOffsetCommit(state, -6000, -1500)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: {
        id: ghostId,
        type: 'wall',
        layerId: 'layer-0',
        x: -6000,
        y: -1500,
        w: 12000,
        h: 9000,
        thickness: 270,
        alignment: 'outer',
      },
    })
    expect(result.select).toBe(ghostId)
    expect(result.state).toEqual({})
  })

  it('typed entry commits even when the pointer preview shows something else', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)
    state = tool.onPointerMove(ctx, state, { x: 9000, y: 9000 }, move)

    const result = tool.onOffsetCommit(state, -6000, -1500)
    expect(result.commit).toMatchObject({ entity: { x: -6000, y: -1500 } })
  })

  it('Link on commits a ref-carrying clone anchored to the source', () => {
    const tool = new OffsetTool()
    const state = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)
    const ghostId = state.source!.ghostId

    const result = tool.onOffsetCommit(state, -6000, -1500, true)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: {
        id: ghostId,
        type: 'wall',
        layerId: 'layer-0',
        x: -6000,
        y: -1500,
        w: 12000,
        h: 9000,
        thickness: 270,
        alignment: 'outer',
        ref: { id: 'src', corner: 'sw', dx: -6000, dy: -1500 },
      },
    })
    expect(result.select).toBe(ghostId)
  })

  it('Link off commits plain coordinates (the default)', () => {
    const tool = new OffsetTool()
    const state = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)

    const result = tool.onOffsetCommit(state, -6000, -1500)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: expect.not.objectContaining({ ref: expect.anything() }),
    })
  })

  it('a zero-delta commit is allowed as an explicit in-place stamp', () => {
    const tool = new OffsetTool()
    const state = tool.onPointerDown(makeCtx(docWithWall()), tool.init(), { x: 100, y: 100 }, down)

    expect(tool.onOffsetCommit(state, 0, 0).commit).toMatchObject({ entity: { x: 0, y: 0 } })
  })

  it('typed entry without a source commits nothing', () => {
    const tool = new OffsetTool()
    expect(tool.onOffsetCommit(tool.init(), 10, 10)).toEqual({ state: {} })
  })

  it('typing both values pins the preview and freezes pointer tracking', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)

    state = tool.onOffsetEntry(state, -6000, -1500)
    expect(state.typed).toEqual({ x: -6000, y: -1500 })
    expect(state.preview).toMatchObject({ x: -6000, y: -1500, w: 12000, h: 9000 })

    // The pointer cannot drag the pinned preview away from the typed spot.
    expect(tool.onPointerMove(ctx, state, { x: 999, y: 999 }, move)).toBe(state)
  })

  it('clearing either field releases the pin back to pointer tracking', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)
    state = tool.onOffsetEntry(state, -6000, -1500)

    state = tool.onOffsetEntry(state, -6000, null)
    expect(state.typed).toBeUndefined()
    expect(state.preview).toBeUndefined()

    state = tool.onPointerMove(ctx, state, { x: -6000, y: -1500 }, move)
    expect(state.preview).toMatchObject({ x: -6000, y: -1500 })
  })

  it('live entry without a source changes nothing', () => {
    const tool = new OffsetTool()
    expect(tool.onOffsetEntry(tool.init(), -6000, -1500)).toEqual({})
  })

  it('Escape unwinds preview back to source selection, then stays idle', () => {
    const tool = new OffsetTool()
    const ctx = makeCtx(docWithWall())
    let state = tool.onPointerDown(ctx, tool.init(), { x: 100, y: 100 }, down)
    state = tool.onPointerMove(ctx, state, { x: 500, y: 500 }, move)

    state = tool.onKey(state, escape)
    expect(state).toEqual({})

    // And a second Escape in the idle state is a no-op.
    expect(tool.onKey(state, escape)).toEqual({})
  })
})

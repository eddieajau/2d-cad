/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, createDocument, type DrawingDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { SelectTool, type SelectToolState } from './select.js'
import type { ToolContext } from './types.js'

function makeCtx(doc: DrawingDocument): ToolContext {
  return { doc, viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport }
}

const line = { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 0 } as const

function docWithLine(): DrawingDocument {
  return addEntity(createDocument(), line)
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')
const altUp = new PointerEvent('pointerup', { altKey: true })
const altMove = new PointerEvent('pointermove', { altKey: true })

describe('SelectTool', () => {
  it('starts idle with no drag', () => {
    const tool = new SelectTool()
    expect(tool.init()).toEqual({})
  })

  it('begins a drag when pointerdown hits an entity', () => {
    const tool = new SelectTool()
    const state = tool.onPointerDown(makeCtx(docWithLine()), tool.init(), { x: 20, y: 0 }, down)
    expect(state.drag).toMatchObject({ id: 'e1', dx: 0, dy: 0, copy: false })
    expect(state.drag?.entity).toEqual(line)
  })

  it('stays idle when pointerdown misses every entity', () => {
    const tool = new SelectTool()
    const state = tool.onPointerDown(makeCtx(docWithLine()), tool.init(), { x: 20, y: 100 }, down)
    expect(state).toEqual({})
  })

  it('previews the entity translated by the drag offset (same id)', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 30, y: 10 }, move)

    expect(state.preview).toEqual({ ...line, x1: 10, y1: 10, x2: 50, y2: 10 })
    expect(state.drag).toMatchObject({ dx: 10, dy: 10, copy: false })
  })

  it('commits exactly one update on a plain drag', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 30, y: 10 }, move)

    const result = tool.onPointerUp(ctx, state, { x: 30, y: 10 }, up)
    expect(result.commit).toEqual({
      kind: 'update',
      entity: { ...line, x1: 10, y1: 10, x2: 50, y2: 10 },
    })
    expect(result.select).toBeUndefined()
    expect(result.state).toEqual({})
  })

  it('previews a fixed-id clone ghost during an alt drag', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 30, y: 10 }, altMove)

    expect(state.preview).toEqual({ ...line, id: state.drag!.ghostId, x1: 10, y1: 10, x2: 50, y2: 10 })
    expect(state.preview!.id).not.toBe('e1')
    expect(state.drag?.copy).toBe(true)
  })

  it('commits an add of a translated clone on alt-drag and reselects it', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 30, y: 10 }, move)

    // Alt only needs to be held at drop time.
    const result = tool.onPointerUp(ctx, state, { x: 30, y: 10 }, altUp)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: { ...line, id: state.drag!.ghostId, x1: 10, y1: 10, x2: 50, y2: 10 },
    })
    expect(result.select).toBe(state.drag!.ghostId)
    expect(result.state).toEqual({})
  })

  it('leaves the document with zero delta on Escape during a drag', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 30, y: 10 }, move)
    expect(state.preview).toBeDefined()

    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})

    // The caller never receives a commit, so the document is untouched.
    const result = tool.onPointerUp(ctx, state, { x: 30, y: 10 }, up)
    expect(result.commit).toBeUndefined()
  })

  it('ignores keys other than Escape', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    let state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)

    const after = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(after).toEqual(state)
  })

  it('treats a zero-offset pointerup as a click with no commit', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    const state: SelectToolState = tool.onPointerDown(ctx, tool.init(), { x: 20, y: 0 }, down)

    const result = tool.onPointerUp(ctx, state, { x: 20, y: 0 }, up)
    expect(result.commit).toBeUndefined()
    expect(result.state).toEqual({})
  })

  it('never commits without a drag', () => {
    const tool = new SelectTool()
    const ctx = makeCtx(docWithLine())
    expect(tool.onPointerMove(ctx, tool.init(), { x: 5, y: 5 }, move)).toEqual({})
    expect(tool.onPointerUp(ctx, tool.init(), { x: 5, y: 5 }, up)).toEqual({ state: {} })
  })
})

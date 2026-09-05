/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { DimTool } from './dim.js'
import type { ToolContext } from './types.js'

const ctx: ToolContext = {
  doc: createDocument(),
  viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

/** Drive the tool through click 1 (first point) and click 2 (second point). */
function placeBothPoints(tool: DimTool): ReturnType<DimTool['init']> {
  let state = tool.init()
  state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
  state = tool.onPointerUp(ctx, state, { x: 0, y: 0 }, up).state
  state = tool.onPointerDown(ctx, state, { x: 40, y: 0 }, down)
  return state
}

describe('DimTool', () => {
  it('starts idle', () => {
    expect(new DimTool().init()).toEqual({})
  })

  it('the first click sets the first measured point', () => {
    const tool = new DimTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 2 }, down)
    expect(state.first).toEqual({ x: 1, y: 2 })
    expect(state.second).toBeUndefined()
    expect(tool.onPointerUp(ctx, state, { x: 1, y: 2 }, up).commit).toBeUndefined()
  })

  it('previews a rubber band while placing the second point', () => {
    const tool = new DimTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)

    state = tool.onPointerMove(ctx, state, { x: 5, y: 3 }, move)
    expect(state.preview).toMatchObject({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 3 })
  })

  it('previews the dimension with the pointer-set offset during the drag', () => {
    const tool = new DimTool()
    const state = placeBothPoints(tool)

    const next = tool.onPointerMove(ctx, state, { x: 20, y: 6 }, move)
    expect(next.preview).toMatchObject({
      type: 'dim',
      x1: 0,
      y1: 0,
      x2: 40,
      y2: 0,
      offset: 6,
    })
  })

  it('committing on pointerup uses the drag offset and resets', () => {
    const tool = new DimTool()
    let state = placeBothPoints(tool)
    state = tool.onPointerMove(ctx, state, { x: 20, y: 6 }, move)

    const result = tool.onPointerUp(ctx, state, { x: 20, y: 6 }, up)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: {
        id: expect.any(String),
        type: 'dim',
        x1: 0,
        y1: 0,
        x2: 40,
        y2: 0,
        offset: 6,
      },
    })
    expect(result.state).toEqual({})
  })

  it('a negative-side drag gives a negative offset', () => {
    const tool = new DimTool()
    let state = placeBothPoints(tool)
    state = tool.onPointerMove(ctx, state, { x: 20, y: -3 }, move)
    const result = tool.onPointerUp(ctx, state, { x: 20, y: -3 }, up)
    expect(result.commit?.entity).toMatchObject({ offset: -3 })
  })

  it('a click on the second point commits with zero offset', () => {
    const tool = new DimTool()
    const state = placeBothPoints(tool)
    const result = tool.onPointerUp(ctx, state, { x: 20, y: 0 }, up)
    expect(result.commit?.entity).toMatchObject({ type: 'dim', offset: 0 })
    expect(result.state).toEqual({})
  })

  it('drops a degenerate measurement of two coincident points', () => {
    const tool = new DimTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 3 }, down)
    state = tool.onPointerDown(ctx, state, { x: 3, y: 3 }, down)
    const result = tool.onPointerUp(ctx, state, { x: 3, y: 8 }, up)
    expect(result.commit).toBeUndefined()
    expect(result.state).toEqual({})
  })

  it('ignores ups before both points are placed', () => {
    const tool = new DimTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)
    const result = tool.onPointerUp(ctx, state, { x: 9, y: 9 }, up)
    expect(result.commit).toBeUndefined()
    expect(result.state.first).toEqual({ x: 1, y: 1 })
  })

  it('Escape resets to idle from any phase', () => {
    const tool = new DimTool()
    let state = placeBothPoints(tool)
    state = tool.onPointerMove(ctx, state, { x: 20, y: 6 }, move)
    expect(state.preview).toBeDefined()

    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})

    const result = tool.onPointerUp(ctx, state, { x: 9, y: 9 }, up)
    expect(result.commit).toBeUndefined()
  })
})

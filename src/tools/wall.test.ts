/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import type { ToolContext } from './types.js'
import { WallTool } from './wall.js'

function makeCtx(wallThickness: number): ToolContext {
  return {
    doc: createDocument(),
    viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
    wallThickness,
  }
}

const ctx = makeCtx(270)
const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

describe('WallTool', () => {
  it('down→move→up commits a wall with the context thickness and outer alignment', () => {
    const tool = new WallTool()
    let state = tool.init()

    state = tool.onPointerDown(ctx, state, { x: 5, y: 5 }, down)
    state = tool.onPointerMove(ctx, state, { x: 1, y: 2 }, move)
    expect(state.preview).toMatchObject({
      type: 'wall',
      x: 1,
      y: 2,
      w: 4,
      h: 3,
      thickness: 270,
      alignment: 'outer',
    })

    const result = tool.onPointerUp(ctx, state, { x: 1, y: 2 }, up)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: { id: expect.any(String), type: 'wall', x: 1, y: 2, w: 4, h: 3, thickness: 270, alignment: 'outer' },
    })
    expect(result.state).toEqual({})
  })

  it('commits the current thickness setting, not a fixed default', () => {
    const tool = new WallTool()
    let state = tool.init()
    state = tool.onPointerDown(makeCtx(110), state, { x: 0, y: 0 }, down)

    const result = tool.onPointerUp(makeCtx(110), state, { x: 10, y: 8 }, up)
    expect(result.commit).toMatchObject({ entity: { type: 'wall', thickness: 110 } })
  })

  it('previews a wall that tracks the pointer during the drag', () => {
    const tool = new WallTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)

    state = tool.onPointerMove(ctx, state, { x: -2, y: 3 }, move)
    expect(state.preview).toMatchObject({ x: -2, y: 0, w: 2, h: 3 })
  })

  it('drops a degenerate zero-size drag', () => {
    const tool = new WallTool()
    let state = tool.init()

    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
    expect(tool.onPointerUp(ctx, state, { x: 0, y: 7 }, up).commit).toBeUndefined()

    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
    expect(tool.onPointerUp(ctx, state, { x: 7, y: 0 }, up).commit).toBeUndefined()
  })

  it('ignores moves and ups outside a gesture', () => {
    const tool = new WallTool()
    const state = tool.init()

    expect(tool.onPointerMove(ctx, state, { x: 5, y: 5 }, move)).toEqual({})
    expect(tool.onPointerUp(ctx, state, { x: 5, y: 5 }, up)).toEqual({ state: {} })
  })

  it('Escape cancels an in-progress gesture back to the initial state', () => {
    const tool = new WallTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)
    state = tool.onPointerMove(ctx, state, { x: 2, y: 2 }, move)

    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})

    const result = tool.onPointerUp(ctx, state, { x: 9, y: 9 }, up)
    expect(result.commit).toBeUndefined()
  })
})

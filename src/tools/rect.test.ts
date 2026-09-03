/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { RectTool } from './rect.js'
import type { ToolContext } from './types.js'

const ctx: ToolContext = {
  doc: createDocument(),
  viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

describe('RectTool', () => {
  it('down→move→up commits a corner-to-corner rect with normalised geometry', () => {
    const tool = new RectTool()
    let state = tool.init()

    state = tool.onPointerDown(ctx, state, { x: 5, y: 5 }, down)
    state = tool.onPointerMove(ctx, state, { x: 1, y: 2 }, move)
    expect(state.preview).toMatchObject({ type: 'rect', x: 1, y: 2, w: 4, h: 3 })

    const result = tool.onPointerUp(ctx, state, { x: 1, y: 2 }, up)
    expect(result.commit).toEqual({ id: expect.any(String), type: 'rect', x: 1, y: 2, w: 4, h: 3 })
    expect(result.state).toEqual({})
  })

  it('previews a rect that tracks the pointer during the drag', () => {
    const tool = new RectTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)

    state = tool.onPointerMove(ctx, state, { x: 4, y: 0 }, move)
    expect(state.preview).toMatchObject({ x: 0, y: 0, w: 4, h: 0 })

    state = tool.onPointerMove(ctx, state, { x: -2, y: 3 }, move)
    expect(state.preview).toMatchObject({ x: -2, y: 0, w: 2, h: 3 })
  })

  it('ignores moves and ups outside a gesture', () => {
    const tool = new RectTool()
    const state = tool.init()

    expect(tool.onPointerMove(ctx, state, { x: 5, y: 5 }, move)).toEqual({})
    expect(tool.onPointerUp(ctx, state, { x: 5, y: 5 }, up)).toEqual({ state: {} })
  })

  it('drops a degenerate zero-size drag', () => {
    const tool = new RectTool()
    let state = tool.init()

    // Zero width.
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
    expect(tool.onPointerUp(ctx, state, { x: 0, y: 7 }, up).commit).toBeUndefined()

    // Zero height.
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
    expect(tool.onPointerUp(ctx, state, { x: 7, y: 0 }, up).commit).toBeUndefined()
  })

  it('Escape cancels an in-progress gesture back to the initial state', () => {
    const tool = new RectTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)
    state = tool.onPointerMove(ctx, state, { x: 2, y: 2 }, move)
    expect(state.preview).toBeDefined()

    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})

    const result = tool.onPointerUp(ctx, state, { x: 9, y: 9 }, up)
    expect(result.commit).toBeUndefined()
  })

  it('leaves state alone for keys other than Escape', () => {
    const tool = new RectTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)

    const after = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(after).toEqual(state)
  })
})

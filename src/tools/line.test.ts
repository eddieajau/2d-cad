/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { LineTool, type LineToolState } from './line.js'
import type { ToolContext } from './types.js'

const ctx: ToolContext = {
  doc: createDocument(),
  rectThickness: 0,
  viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

describe('LineTool', () => {
  it('starts idle with no anchor or preview', () => {
    const tool = new LineTool()
    expect(tool.init()).toEqual({})
  })

  it('down→move→up commits a line matching the rubber band', () => {
    const tool = new LineTool()
    let state = tool.init()

    state = tool.onPointerDown(ctx, state, { x: 1, y: 2 }, down)
    state = tool.onPointerMove(ctx, state, { x: 4, y: 6 }, move)
    const result = tool.onPointerUp(ctx, state, { x: 4, y: 6 }, up)

    expect(result.commit).toEqual({
      kind: 'add',
      entity: {
        id: expect.any(String),
        type: 'line',
        x1: 1,
        y1: 2,
        x2: 4,
        y2: 6,
      },
    })
    expect(result.state).toEqual({})
  })

  it('previews a line that tracks the pointer during the drag', () => {
    const tool = new LineTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)

    state = tool.onPointerMove(ctx, state, { x: 5, y: 0 }, move)
    expect(state.preview).toMatchObject({ type: 'line', x2: 5, y2: 0 })

    state = tool.onPointerMove(ctx, state, { x: 5, y: 7 }, move)
    expect(state.preview).toMatchObject({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 7 })
  })

  it('ignores moves and ups outside a gesture', () => {
    const tool = new LineTool()
    const state = tool.init()

    expect(tool.onPointerMove(ctx, state, { x: 5, y: 5 }, move)).toEqual({})
    expect(tool.onPointerUp(ctx, state, { x: 5, y: 5 }, up)).toEqual({ state: {} })
  })

  it('drops a click without drag (degenerate zero-length line)', () => {
    const tool = new LineTool()
    let state: LineToolState = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 3 }, down)
    const result = tool.onPointerUp(ctx, state, { x: 3, y: 3 }, up)

    expect(result.commit).toBeUndefined()
  })

  it('Escape cancels an in-progress gesture back to the initial state', () => {
    const tool = new LineTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)
    state = tool.onPointerMove(ctx, state, { x: 2, y: 2 }, move)
    expect(state.preview).toBeDefined()

    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})

    // Committed geometry is unaffected by a cancelled gesture.
    const result = tool.onPointerUp(ctx, state, { x: 9, y: 9 }, up)
    expect(result.commit).toBeUndefined()
  })

  it('leaves state alone for keys other than Escape', () => {
    const tool = new LineTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)

    const after = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(after).toEqual(state)
  })
})

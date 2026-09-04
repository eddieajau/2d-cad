/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { CircleTool } from './circle.js'
import type { ToolContext } from './types.js'

const ctx: ToolContext = {
  doc: createDocument(),
  viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
  wallThickness: 270,
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

describe('CircleTool', () => {
  it('down→move→up commits a circle whose radius spans the drag', () => {
    const tool = new CircleTool()
    let state = tool.init()

    state = tool.onPointerDown(ctx, state, { x: 0, y: 0 }, down)
    state = tool.onPointerMove(ctx, state, { x: 3, y: 4 }, move)
    expect(state.preview).toMatchObject({ type: 'circle', cx: 0, cy: 0, r: 5 })

    const result = tool.onPointerUp(ctx, state, { x: 3, y: 4 }, up)
    expect(result.commit).toEqual({
      kind: 'add',
      entity: { id: expect.any(String), type: 'circle', cx: 0, cy: 0, r: 5 },
    })
    expect(result.state).toEqual({})
  })

  it('previews a circle whose radius tracks the pointer', () => {
    const tool = new CircleTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 10, y: 10 }, down)

    state = tool.onPointerMove(ctx, state, { x: 13, y: 10 }, move)
    expect(state.preview).toMatchObject({ cx: 10, cy: 10, r: 3 })

    state = tool.onPointerMove(ctx, state, { x: 10, y: 5 }, move)
    expect(state.preview).toMatchObject({ cx: 10, cy: 10, r: 5 })
  })

  it('ignores moves and ups outside a gesture', () => {
    const tool = new CircleTool()
    const state = tool.init()

    expect(tool.onPointerMove(ctx, state, { x: 5, y: 5 }, move)).toEqual({})
    expect(tool.onPointerUp(ctx, state, { x: 5, y: 5 }, up)).toEqual({ state: {} })
  })

  it('drops a click without drag (zero radius)', () => {
    const tool = new CircleTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 3 }, down)

    const result = tool.onPointerUp(ctx, state, { x: 3, y: 3 }, up)
    expect(result.commit).toBeUndefined()
  })

  it('Escape cancels an in-progress gesture back to the initial state', () => {
    const tool = new CircleTool()
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
    const tool = new CircleTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 1, y: 1 }, down)

    const after = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(after).toEqual(state)
  })
})

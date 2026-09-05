/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { createDocument } from '../document.js'
import type { Viewport } from '../viewport.js'
import { TEXT_DEFAULT_SIZE, TextTool } from './text.js'
import type { ToolContext } from './types.js'

const ctx: ToolContext = {
  doc: createDocument(),
  viewport: { offsetX: 0, offsetY: 0, scale: 1 } satisfies Viewport,
}

const down = new PointerEvent('pointerdown')
const move = new PointerEvent('pointermove')
const up = new PointerEvent('pointerup')

describe('TextTool', () => {
  it('starts idle', () => {
    expect(new TextTool().init()).toEqual({})
  })

  it('a click fixes the placing anchor', () => {
    const tool = new TextTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 4 }, down)
    expect(state.placing).toEqual({ x: 3, y: 4 })

    // The gesture ends on the click; the anchor stays until entry completes.
    const result = tool.onPointerUp(ctx, state, { x: 3, y: 4 }, up)
    expect(result.commit).toBeUndefined()
    expect(result.state.placing).toEqual({ x: 3, y: 4 })
  })

  it('commits a text entity at the anchor with the default size', () => {
    const tool = new TextTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 4 }, down)

    const result = tool.onTextCommit(state, 'note')
    expect(result.commit).toEqual({
      kind: 'add',
      entity: {
        id: expect.any(String),
        type: 'text',
        x: 3,
        y: 4,
        text: 'note',
        size: TEXT_DEFAULT_SIZE,
      },
    })
    expect(result.state).toEqual({})
  })

  it('drops blank entries without committing', () => {
    const tool = new TextTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 4 }, down)

    expect(tool.onTextCommit(state, '').commit).toBeUndefined()
    expect(tool.onTextCommit(state, '   ').commit).toBeUndefined()
    // Blank entries still close the entry session.
    expect(tool.onTextCommit(state, '').state).toEqual({})
  })

  it('a null value cancels without committing', () => {
    const tool = new TextTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 4 }, down)

    const result = tool.onTextCommit(state, null)
    expect(result.commit).toBeUndefined()
    expect(result.state).toEqual({})
  })

  it('commit without a placing click does nothing', () => {
    const tool = new TextTool()
    const result = tool.onTextCommit(tool.init(), 'note')
    expect(result.commit).toBeUndefined()
    expect(result.state).toEqual({})
  })

  it('ignores moves outside a gesture', () => {
    const tool = new TextTool()
    const state = tool.init()
    expect(tool.onPointerMove(ctx, state, { x: 5, y: 5 }, move)).toEqual(state)
  })

  it('Escape resets to idle', () => {
    const tool = new TextTool()
    let state = tool.init()
    state = tool.onPointerDown(ctx, state, { x: 3, y: 4 }, down)
    state = tool.onKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(state).toEqual({})
  })
})

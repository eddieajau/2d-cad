/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { addEntity, createDocument } from './document.js'
import { canRedo, canUndo, commit, createHistory, current, redo, undo } from './history.js'

const base = createDocument()
const d1 = addEntity(base, { id: 'e1', type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 })
const d2 = addEntity(d1, { id: 'e2', type: 'circle', cx: 0, cy: 0, r: 1 })

describe('createHistory', () => {
  it('seeds the stack with the initial document', () => {
    const h = createHistory(base)
    expect(h.stack).toEqual([base])
    expect(h.index).toBe(0)
    expect(current(h)).toBe(base)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})

describe('commit', () => {
  it('appends the next document and advances the index', () => {
    let h = createHistory(base)
    h = commit(h, d1)
    h = commit(h, d2)
    expect(h.stack).toEqual([base, d1, d2])
    expect(h.index).toBe(2)
    expect(current(h)).toBe(d2)
  })

  it('truncates the redo tail when committing after undo', () => {
    let history = createHistory(base)
    history = commit(history, d1)
    history = undo(history)
    history = commit(history, d2)

    expect(history.stack).toEqual([base, d2])
    expect(history.index).toBe(1)
    expect(current(history)).toBe(d2)
    expect(canRedo(history)).toBe(false)
  })

  it('does not mutate the input history', () => {
    const h = createHistory(base)
    const next = commit(h, d1)

    expect(next).not.toBe(h)
    expect(h.stack).toEqual([base])
    expect(h.index).toBe(0)
    expect(current(h)).toBe(base)
  })
})

describe('undo/redo', () => {
  it('walks back and forward through the stack', () => {
    let h = createHistory(base)
    h = commit(h, d1)
    h = commit(h, d2)

    h = undo(h)
    expect(current(h)).toBe(d1)
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(true)

    h = undo(h)
    expect(current(h)).toBe(base)
    expect(canUndo(h)).toBe(false)

    h = redo(h)
    h = redo(h)
    expect(current(h)).toBe(d2)
    expect(canRedo(h)).toBe(false)
  })

  it('are no-ops at the boundaries, returning the same History', () => {
    let h = createHistory(base)
    expect(undo(h)).toBe(h)

    h = commit(h, d1)
    expect(redo(h)).toBe(h)
  })

  it('do not mutate the input history', () => {
    let h = createHistory(base)
    h = commit(h, d1)
    const before = h
    const undone = undo(h)

    expect(undone.index).toBe(0)
    expect(before.index).toBe(1)
    expect(undone.stack).toBe(h.stack)
  })
})

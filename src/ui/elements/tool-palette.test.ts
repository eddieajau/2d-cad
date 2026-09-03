/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it } from 'vitest'

import './tool-palette.js'
import type { ToolId } from '../../tools/types.js'
import type { ToolPalette } from './tool-palette.js'

function makePalette(tools = 'line,rect,circle', active = 'line'): ToolPalette {
  const el = document.createElement('tool-palette')
  el.setAttribute('tools', tools)
  el.setAttribute('active', active)
  document.body.appendChild(el)
  return el
}

function selects(el: ToolPalette): ToolId[] {
  const picked: ToolId[] = []
  el.addEventListener('tool-palette:select', event => picked.push((event as CustomEvent<{ tool: ToolId }>).detail.tool))
  return picked
}

describe('tool-palette', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders a labelled button per tool', () => {
    const el = makePalette()
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-tool]')]
    expect(buttons.map(b => b.dataset.tool)).toEqual(['line', 'rect', 'circle'])
    expect(buttons.map(b => b.textContent!.trim())).toEqual(['Line', 'Rect', 'Circle'])
    el.remove()
  })

  it('marks the active tool with aria-pressed and tracks the attribute', () => {
    const el = makePalette('line,rect,circle', 'line')
    expect(el.querySelector('button[data-tool="line"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('button[data-tool="rect"]')?.getAttribute('aria-pressed')).toBe('false')

    el.setAttribute('active', 'rect')
    expect(el.querySelector('button[data-tool="line"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(el.querySelector('button[data-tool="rect"]')?.getAttribute('aria-pressed')).toBe('true')
    el.remove()
  })

  it('dispatches tool-palette:select on click', () => {
    const el = makePalette()
    const picked = selects(el)

    el.querySelector<HTMLButtonElement>('button[data-tool="circle"]')!.click()

    expect(picked).toEqual(['circle'])
    el.remove()
  })

  it('dispatches tool-palette:select on keyboard activation', () => {
    const el = makePalette()
    const picked = selects(el)
    const button = el.querySelector<HTMLButtonElement>('button[data-tool="rect"]')!
    button.focus()

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))

    expect(picked).toEqual(['rect', 'rect'])
    el.remove()
  })

  it('switches tools with the l/r/c shortcuts', () => {
    const el = makePalette()
    const picked = selects(el)

    const press = (key: string): void => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    press('r')
    press('l')
    press('c')

    expect(picked).toEqual(['rect', 'line', 'circle'])
    el.remove()
  })

  it('ignores shortcuts while a form control has focus', () => {
    const el = makePalette()
    const picked = selects(el)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))

    expect(picked).toEqual([])
    el.remove()
  })

  it('ignores shortcuts for tools not in the palette', () => {
    const el = makePalette('line')
    const picked = selects(el)

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))

    expect(picked).toEqual([])
    el.remove()
  })

  it('cleans up its document shortcut listener on disconnect', () => {
    const el = makePalette()
    const picked = selects(el)
    el.remove()

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(picked).toEqual([])
  })

  it('filters unknown names out of the tools attribute', () => {
    const el = makePalette('line,bogus,circle')
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-tool]')]
    expect(buttons.map(b => b.dataset.tool)).toEqual(['line', 'circle'])
    el.remove()
  })
})

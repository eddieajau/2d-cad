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

function thicknessInput(el: ToolPalette): HTMLInputElement {
  return el.querySelector<HTMLInputElement>('.wall-thickness input')!
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

  it('shows the thickness input only while the wall tool is active', () => {
    const el = makePalette('line,wall', 'line')
    const label = el.querySelector<HTMLElement>('.wall-thickness')!
    expect(label.hidden).toBe(true)

    el.setAttribute('active', 'wall')
    expect(label.hidden).toBe(false)
    expect(thicknessInput(el).value).toBe('270')
    el.remove()
  })

  it('dispatches tool-palette:thickness when the thickness input changes', () => {
    const el = makePalette('wall', 'wall')
    const pushed: number[] = []
    el.addEventListener('tool-palette:thickness', event => {
      pushed.push((event as CustomEvent<{ thickness: number }>).detail.thickness)
    })

    const input = thicknessInput(el)
    input.value = '110'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(pushed).toEqual([110])
    el.remove()
  })

  it('ignores thickness input values that are not usable thicknesses', () => {
    const el = makePalette('wall', 'wall')
    const pushed: number[] = []
    el.addEventListener('tool-palette:thickness', event => {
      pushed.push((event as CustomEvent<{ thickness: number }>).detail.thickness)
    })

    const input = thicknessInput(el)
    for (const value of ['', '-10', 'abc']) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    expect(pushed).toEqual([])
    el.remove()
  })

  it('switches tools with the w shortcut', () => {
    const el = makePalette('wall', 'line')
    const picked = selects(el)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))
    expect(picked).toEqual(['wall'])
    el.remove()
  })

  it('shows the dx/dy inputs only while the offset tool is active', () => {
    const el = makePalette('line,offset', 'line')
    const row = el.querySelector<HTMLElement>('.offset-entry')!
    expect(row.hidden).toBe(true)

    el.setAttribute('active', 'offset')
    expect(row.hidden).toBe(false)
    expect(el.querySelector<HTMLInputElement>('.offset-dx')).not.toBeNull()
    expect(el.querySelector<HTMLInputElement>('.offset-dy')).not.toBeNull()
    // The wrapped labels name the inputs for keyboard/AT users.
    expect(row.textContent).toContain('dx mm')
    expect(row.textContent).toContain('dy mm')
    el.remove()
  })

  it('Enter dispatches tool-palette:offset with the typed values and clears the inputs', () => {
    const el = makePalette('offset', 'offset')
    const committed: { dx: number; dy: number; link: boolean }[] = []
    el.addEventListener('tool-palette:offset', event =>
      committed.push((event as CustomEvent<{ dx: number; dy: number; link: boolean }>).detail)
    )

    const dx = el.querySelector<HTMLInputElement>('.offset-dx')!
    const dy = el.querySelector<HTMLInputElement>('.offset-dy')!
    dx.value = '-6000'
    dy.value = '-1500'
    dx.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(committed).toEqual([{ dx: -6000, dy: -1500, link: false }])
    expect(dx.value).toBe('')
    expect(dy.value).toBe('')
    el.remove()
  })

  it('the Link toggle rides along in the commit detail', () => {
    const el = makePalette('offset', 'offset')
    const committed: { link: boolean }[] = []
    el.addEventListener('tool-palette:offset', event =>
      committed.push((event as CustomEvent<{ link: boolean }>).detail)
    )

    const link = el.querySelector<HTMLInputElement>('.offset-link input')!
    expect(link.type).toBe('checkbox')
    const dx = el.querySelector<HTMLInputElement>('.offset-dx')!
    const dy = el.querySelector<HTMLInputElement>('.offset-dy')!

    dx.value = '2000'
    dy.value = '0'
    dx.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(committed[0]).toMatchObject({ link: false })

    link.checked = true
    dx.value = '2000'
    dy.value = '0'
    dx.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(committed[1]).toMatchObject({ link: true })
    el.remove()
  })

  it('Enter with missing or invalid values commits nothing', () => {
    const el = makePalette('offset', 'offset')
    const committed: unknown[] = []
    el.addEventListener('tool-palette:offset', event => committed.push((event as CustomEvent).detail))

    const dx = el.querySelector<HTMLInputElement>('.offset-dx')!
    const dy = el.querySelector<HTMLInputElement>('.offset-dy')!
    for (const [a, b] of [
      ['', ''],
      ['-6000', ''],
      ['-6000', 'abc'],
    ] as const) {
      dx.value = a
      dy.value = b
      dx.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    expect(committed).toEqual([])
    el.remove()
  })

  it('input in the dx/dy fields emits tool-palette:offset-entry with parsed values', () => {
    const el = makePalette('offset', 'offset')
    const entries: { dx: number | null; dy: number | null }[] = []
    el.addEventListener('tool-palette:offset-entry', event =>
      entries.push((event as CustomEvent<{ dx: number | null; dy: number | null }>).detail)
    )

    const dx = el.querySelector<HTMLInputElement>('.offset-dx')!
    const dy = el.querySelector<HTMLInputElement>('.offset-dy')!
    dx.value = '-6000'
    dx.dispatchEvent(new Event('input', { bubbles: true }))
    dy.value = '-1500'
    dy.dispatchEvent(new Event('input', { bubbles: true }))
    dy.value = 'abc'
    dy.dispatchEvent(new Event('input', { bubbles: true }))

    expect(entries).toEqual([
      { dx: -6000, dy: null },
      { dx: -6000, dy: -1500 },
      { dx: -6000, dy: null },
    ])
    el.remove()
  })

  it('Escape in an offset input clears the inputs and dispatches tool-palette:escape', () => {
    const el = makePalette('offset', 'offset')
    const escapes: unknown[] = []
    const entries: unknown[] = []
    el.addEventListener('tool-palette:escape', () => escapes.push(null))
    el.addEventListener('tool-palette:offset-entry', event => entries.push((event as CustomEvent).detail))

    const dx = el.querySelector<HTMLInputElement>('.offset-dx')!
    const dy = el.querySelector<HTMLInputElement>('.offset-dy')!
    dx.value = '-6000'
    dy.value = '-1500'
    dx.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(escapes).toHaveLength(1)
    // The cleared fields also release the canvas tool's typed preview pin.
    expect(entries).toEqual([{ dx: null, dy: null }])
    expect(dx.value).toBe('')
    expect(dy.value).toBe('')
    el.remove()
  })
})

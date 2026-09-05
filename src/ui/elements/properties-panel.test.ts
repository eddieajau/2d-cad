/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Entity } from '../../document.js'
import './properties-panel.js'
import type { PropertiesPanel, PropertiesPanelChange } from './properties-panel.js'

const LINE: Entity = { id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 20 }
const RECT: Entity = { id: 'e2', type: 'rect', layerId: 'layer-0', x: 10, y: 20, w: 100, h: 50 }
const CIRCLE: Entity = { id: 'e3', type: 'circle', layerId: 'layer-0', cx: 5, cy: 6, r: 12 }
const WALL: Entity = {
  id: 'e4',
  type: 'wall',
  layerId: 'layer-0',
  x: 0,
  y: 0,
  w: 4000,
  h: 3000,
  thickness: 270,
  alignment: 'outer',
}
const TEXT: Entity = { id: 'e5', type: 'text', layerId: 'layer-0', x: 1, y: 2, text: 'Driveway', size: 200 }
const DIM: Entity = { id: 'e6', type: 'dim', layerId: 'layer-0', x1: 0, y1: 0, x2: 100, y2: 0, offset: 15 }
const LINKED_RECT: Entity = {
  ...RECT,
  id: 'e7',
  ref: { id: 'e4', corner: 'nw', dx: 10, dy: -5 },
}

function makePanel(): PropertiesPanel {
  const el = document.createElement('properties-panel')
  document.body.appendChild(el)
  return el
}

function keys(panel: PropertiesPanel): string[] {
  return [...panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.prop-input')].map(
    input => input.dataset.key ?? ''
  )
}

function field(panel: PropertiesPanel, key: string): HTMLInputElement {
  const input = panel.querySelector<HTMLInputElement>(`.prop-input[data-key="${key}"]`)
  if (input === null) throw new Error(`no field for ${key}`)
  return input
}

function commitWithEnter(panel: PropertiesPanel, input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

function commitWithBlur(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

function pressEscape(input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('properties-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the empty state for null', () => {
    const el = makePanel()
    el.setEntity(null)
    expect(el.querySelector('.prop-empty')?.textContent).toBe('Nothing selected')
    expect(el.querySelector('.prop-input')).toBeNull()
    el.remove()
  })

  it('renders the colour section via <entity-colour>', () => {
    const el = makePanel()
    el.setEntity(LINE)
    expect(el.querySelector('entity-colour')).not.toBeNull()
    el.setEntity(null)
    expect(el.querySelector('entity-colour')).not.toBeNull()
    el.remove()
  })

  it('renders per-type rows with current values', () => {
    const el = makePanel()

    el.setEntity(LINE)
    expect(keys(el)).toEqual(['x1', 'y1', 'x2', 'y2'])
    expect(field(el, 'x2').value).toBe('40')

    el.setEntity(RECT)
    expect(keys(el)).toEqual(['x', 'y', 'w', 'h'])
    expect(field(el, 'h').value).toBe('50')

    el.setEntity(CIRCLE)
    expect(keys(el)).toEqual(['cx', 'cy', 'r'])
    expect(field(el, 'r').value).toBe('12')

    el.setEntity(WALL)
    expect(keys(el)).toEqual(['x', 'y', 'w', 'h', 'thickness', 'alignment'])
    expect(field(el, 'thickness').value).toBe('270')
    const alignment = el.querySelector<HTMLSelectElement>('.prop-input[data-key="alignment"]')!
    expect(alignment.value).toBe('outer')

    el.setEntity(TEXT)
    expect(keys(el)).toEqual(['text', 'x', 'y', 'size'])
    expect(field(el, 'text').value).toBe('Driveway')
    expect(field(el, 'size').value).toBe('200')

    el.setEntity(DIM)
    expect(keys(el)).toEqual(['x1', 'y1', 'x2', 'y2', 'offset'])
    expect(field(el, 'offset').value).toBe('15')

    el.remove()
  })

  it('labels every input and keeps the alignment options fixed', () => {
    const el = makePanel()
    el.setEntity(WALL)
    const labels = [...el.querySelectorAll('label.prop-field')].map(label => label.textContent ?? '')
    for (const label of labels) expect(label.trim()).not.toBe('')
    const alignment = el.querySelector<HTMLSelectElement>('.prop-input[data-key="alignment"]')!
    expect([...alignment.options].map(option => option.value)).toEqual(['outer', 'centre', 'inner'])
    el.remove()
  })

  it('emits the typed patch on Enter and canonicalises the field', () => {
    const el = makePanel()
    el.setEntity(LINE)
    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )

    const x1 = field(el, 'x1')
    x1.value = '5'
    commitWithEnter(el, x1)

    expect(events).toEqual([{ id: 'e1', patch: { x1: 5 } }])
    expect(x1.value).toBe('5')
    el.remove()
  })

  it('commits on blur only when the value changed', () => {
    const el = makePanel()
    el.setEntity(RECT)
    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )

    const w = field(el, 'w')
    w.value = '120'
    commitWithBlur(w)
    expect(events).toEqual([{ id: 'e2', patch: { w: 120 } }])

    // An untouched blur (or an emptied field) emits nothing.
    commitWithBlur(w)
    w.value = ''
    commitWithBlur(w)
    expect(events).toHaveLength(1)
    expect(w.value).toBe('120')
    el.remove()
  })

  it('emits the text content as a string patch', () => {
    const el = makePanel()
    el.setEntity(TEXT)
    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )

    const content = field(el, 'text')
    content.value = 'Patio'
    commitWithEnter(el, content)

    expect(events).toEqual([{ id: 'e5', patch: { text: 'Patio' } }])
    el.remove()
  })

  it('emits the alignment select on change', () => {
    const el = makePanel()
    el.setEntity(WALL)
    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )

    const alignment = el.querySelector<HTMLSelectElement>('.prop-input[data-key="alignment"]')!
    alignment.value = 'centre'
    alignment.dispatchEvent(new Event('change', { bubbles: true }))

    expect(events).toEqual([{ id: 'e4', patch: { alignment: 'centre' } }])
    el.remove()
  })

  it('Escape reverts the field and emits nothing', () => {
    const el = makePanel()
    el.setEntity(LINE)
    el.addEventListener('properties-panel:change', () => expect.unreachable())

    const x1 = field(el, 'x1')
    x1.value = '99'
    pressEscape(x1)

    expect(x1.value).toBe('0')
    el.remove()
  })

  it('rejects invalid values with a field-level message and no event', () => {
    const el = makePanel()
    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )

    el.setEntity(CIRCLE)
    const r = field(el, 'r')
    r.value = '-1'
    commitWithEnter(el, r)
    expect(events).toEqual([])
    const radiusError = r.closest('label')!.querySelector<HTMLElement>('.prop-error')!
    expect(radiusError.hidden).toBe(false)
    expect(radiusError.textContent).toMatch(/negative/i)

    // A later valid edit clears the message.
    r.value = '30'
    commitWithEnter(el, r)
    expect(events).toEqual([{ id: 'e3', patch: { r: 30 } }])
    expect(radiusError.hidden).toBe(true)

    el.setEntity(WALL)
    const w = field(el, 'w')
    w.value = '0'
    commitWithEnter(el, w)
    expect(events).toHaveLength(1)
    expect(w.closest('label')!.querySelector<HTMLElement>('.prop-error')!.hidden).toBe(false)
    expect(events.at(-1)).toEqual({ id: 'e3', patch: { r: 30 } })

    el.remove()
  })

  it('linked entities edit the ref dx/dy instead of stored coordinates', () => {
    const el = makePanel()
    el.setEntity(LINKED_RECT)
    // Position rows become the ref's dx/dy; the size rows stay editable.
    expect(keys(el)).toEqual(['dx', 'dy', 'w', 'h'])
    const labels = [...el.querySelectorAll('label.prop-field')].map(label => label.textContent ?? '')
    expect(labels.some(label => label.includes('from anchor'))).toBe(true)
    expect(el.querySelector('.prop-input[data-key="x"]')).toBeNull()

    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )
    const dx = field(el, 'dx')
    expect(dx.value).toBe('10')
    dx.value = '30'
    commitWithEnter(el, dx)

    expect(events).toEqual([{ id: 'e7', patch: { dx: 30 } }])
    el.remove()
  })

  it('unlinked refable entities show Link… which emits pick-parent', () => {
    const el = makePanel()
    el.setEntity(RECT)
    const link = el.querySelector<HTMLButtonElement>('button[data-link="pick"]')
    expect(link?.textContent).toBe('Link…')

    const picked: Event[] = []
    el.addEventListener('properties-panel:pick-parent', event => picked.push(event))
    link!.click()

    expect(picked).toHaveLength(1)
    el.remove()
  })

  it('linked entities show the parent summary and Unlink emits ref removal', () => {
    const el = makePanel()
    el.setEntity(LINKED_RECT)
    expect(el.querySelector('.prop-link-summary')?.textContent).toBe('e4 · NW corner')
    expect(el.querySelector('button[data-link="pick"]')).toBeNull()

    const events: PropertiesPanelChange[] = []
    el.addEventListener('properties-panel:change', event =>
      events.push((event as CustomEvent<PropertiesPanelChange>).detail)
    )
    el.querySelector<HTMLButtonElement>('button[data-link="unlink"]')!.click()

    expect(events).toEqual([{ id: 'e7', patch: { ref: undefined } }])
    el.remove()
  })

  it('text and dim have no link section', () => {
    const el = makePanel()
    el.setEntity(TEXT)
    expect(el.querySelector('.prop-link')).toBeNull()
    el.setEntity(DIM)
    expect(el.querySelector('.prop-link')).toBeNull()
    el.remove()
  })
})

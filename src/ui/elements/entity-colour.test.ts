/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Entity } from '../../document.js'
import './entity-colour.js'
import type { EntityColour, EntityColourChange } from './entity-colour.js'

const LINE: Entity = { id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 10, y2: 5 }

function makePanel(): EntityColour {
  const el = document.createElement('entity-colour')
  document.body.appendChild(el)
  return el
}

describe('entity-colour', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('disables both controls when nothing is selected', () => {
    const el = makePanel()
    el.setSelection(null, '#1f2430')
    expect(el.querySelector<HTMLInputElement>('.entity-colour-swatch')!.disabled).toBe(true)
    expect(el.querySelector<HTMLButtonElement>('.entity-colour-clear')!.disabled).toBe(true)
    el.remove()
  })

  it('shows the effective colour: the override when present, else the layer colour', () => {
    const el = makePanel()
    el.setSelection({ ...LINE, colour: '#ff0000' }, '#00aa00')
    expect(el.querySelector<HTMLInputElement>('.entity-colour-swatch')!.value).toBe('#ff0000')
    expect(el.querySelector<HTMLInputElement>('.entity-colour-swatch')!.disabled).toBe(false)

    el.setSelection(LINE, '#00aa00')
    expect(el.querySelector<HTMLInputElement>('.entity-colour-swatch')!.value).toBe('#00aa00')
    el.remove()
  })

  it('emits the picked colour with the selected entity id', () => {
    const el = makePanel()
    el.setSelection(LINE, '#1f2430')
    const events: EntityColourChange[] = []
    el.addEventListener('entity-colour:change', event => events.push((event as CustomEvent<EntityColourChange>).detail))

    const swatch = el.querySelector<HTMLInputElement>('.entity-colour-swatch')!
    swatch.value = '#b45309'
    swatch.dispatchEvent(new Event('change', { bubbles: true }))

    expect(events).toEqual([{ id: 'e1', colour: '#b45309' }])
    el.remove()
  })

  it('emits null from the clear-override button', () => {
    const el = makePanel()
    el.setSelection({ ...LINE, colour: '#ff0000' }, '#1f2430')
    const events: EntityColourChange[] = []
    el.addEventListener('entity-colour:change', event => events.push((event as CustomEvent<EntityColourChange>).detail))

    el.querySelector<HTMLButtonElement>('.entity-colour-clear')!.click()

    expect(events).toEqual([{ id: 'e1', colour: null }])
    el.remove()
  })

  it('emits nothing while disabled', () => {
    const el = makePanel()
    el.setSelection(null, '#1f2430')
    el.addEventListener('entity-colour:change', () => expect.unreachable())

    el.querySelector<HTMLInputElement>('.entity-colour-swatch')!.dispatchEvent(new Event('change', { bubbles: true }))
    el.querySelector<HTMLButtonElement>('.entity-colour-clear')!.click()
    el.remove()
  })
})

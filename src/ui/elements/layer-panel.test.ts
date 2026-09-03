/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Layer } from '../../document.js'
import './layer-panel.js'
import type { LayerPanel, LayerPanelChange } from './layer-panel.js'

const LAYERS: readonly Layer[] = [
  { id: 'layer-0', name: 'Default', visible: true, locked: false },
  { id: 'layer-1', name: 'Survey', visible: false, locked: true },
]

function makePanel(layers: readonly Layer[] = LAYERS, active = 'layer-0'): LayerPanel {
  const el = document.createElement('layer-panel')
  document.body.appendChild(el)
  el.setLayers(layers, active)
  return el
}

function rowOf(el: LayerPanel, layerId: string): HTMLLIElement {
  return el.querySelector<HTMLLIElement>(`.layer-row[data-layer-id="${layerId}"]`)!
}

describe('layer-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders one row per layer with name, radio, and toggles', () => {
    const el = makePanel()
    const rows = [...el.querySelectorAll<HTMLLIElement>('.layer-row')]
    expect(rows.map(row => row.dataset.layerId)).toEqual(['layer-0', 'layer-1'])
    expect(rowOf(el, 'layer-0').querySelector('.layer-name')?.textContent).toBe('Default')
    expect(rowOf(el, 'layer-1').querySelector('.layer-name')?.textContent).toBe('Survey')
    el.remove()
  })

  it('tracks visibility and lock state in aria-pressed', () => {
    const el = makePanel()
    expect(rowOf(el, 'layer-0').querySelector('.layer-visible')?.getAttribute('aria-pressed')).toBe('true')
    expect(rowOf(el, 'layer-0').querySelector('.layer-lock')?.getAttribute('aria-pressed')).toBe('false')
    expect(rowOf(el, 'layer-1').querySelector('.layer-visible')?.getAttribute('aria-pressed')).toBe('false')
    expect(rowOf(el, 'layer-1').querySelector('.layer-lock')?.getAttribute('aria-pressed')).toBe('true')
    el.remove()
  })

  it('marks exactly one layer active with radio semantics', () => {
    const el = makePanel()
    const group = el.querySelector('[role="radiogroup"]')
    expect(group).not.toBeNull()
    const radios = [...el.querySelectorAll<HTMLButtonElement>('.layer-active[role="radio"]')]
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['true', 'false'])

    el.setLayers(LAYERS, 'layer-1')
    expect(rowOf(el, 'layer-1').querySelector('.layer-active')?.getAttribute('aria-checked')).toBe('true')
    expect(rowOf(el, 'layer-0').querySelector('.layer-active')?.getAttribute('aria-checked')).toBe('false')
    el.remove()
  })

  it('escapes layer names into the markup', () => {
    const el = makePanel([{ id: 'l1', name: '<b>&"x', visible: true, locked: false }])
    // The raw name survives as text (no injected <b> element), quotes and all.
    expect(el.querySelector('b')).toBeNull()
    expect(el.querySelector('.layer-name')?.textContent).toBe('<b>&"x')
    el.remove()
  })

  it('emits visibility and lock toggle ops from the row buttons', () => {
    const el = makePanel()
    const events: LayerPanelChange[] = []
    el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

    rowOf(el, 'layer-0').querySelector<HTMLButtonElement>('.layer-visible')!.click()
    rowOf(el, 'layer-0').querySelector<HTMLButtonElement>('.layer-lock')!.click()

    expect(events).toEqual([
      { op: 'visibility', layerId: 'layer-0', value: false },
      { op: 'lock', layerId: 'layer-0', value: true },
    ])
    el.remove()
  })

  it('emits an activate op from the radio button', () => {
    const el = makePanel()
    const events: LayerPanelChange[] = []
    el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

    rowOf(el, 'layer-1').querySelector<HTMLButtonElement>('.layer-active')!.click()

    expect(events).toEqual([{ op: 'activate', layerId: 'layer-1' }])
    el.remove()
  })

  it('emits an add op with a proposed name', () => {
    const el = makePanel()
    const events: LayerPanelChange[] = []
    el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

    el.querySelector<HTMLButtonElement>('.layer-add')!.click()

    expect(events).toEqual([{ op: 'add', layerId: '', value: 'Layer 3' }])
    el.remove()
  })

  it('emits a remove op unless it is the last layer', () => {
    const el = makePanel()
    expect(rowOf(el, 'layer-0').querySelector<HTMLButtonElement>('.layer-remove')!.disabled).toBe(false)

    const events: LayerPanelChange[] = []
    el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))
    rowOf(el, 'layer-1').querySelector<HTMLButtonElement>('.layer-remove')!.click()
    expect(events).toEqual([{ op: 'remove', layerId: 'layer-1' }])

    const single = makePanel([LAYERS[0]!])
    expect(rowOf(single, 'layer-0').querySelector<HTMLButtonElement>('.layer-remove')!.disabled).toBe(true)
    single.addEventListener('layer-panel:change', () => expect.unreachable())
    rowOf(single, 'layer-0').querySelector<HTMLButtonElement>('.layer-remove')!.click()

    el.remove()
    single.remove()
  })

  describe('inline rename', () => {
    function startRename(el: LayerPanel, layerId: string): HTMLInputElement {
      rowOf(el, layerId).querySelector<HTMLButtonElement>('.layer-name')!.click()
      return rowOf(el, layerId).querySelector<HTMLInputElement>('input.layer-rename')!
    }

    it('swaps the name button for a focused input', () => {
      const el = makePanel()
      const input = startRename(el, 'layer-0')
      expect(input).not.toBeNull()
      expect(input.value).toBe('Default')
      expect(document.activeElement).toBe(input)
      el.remove()
    })

    it('Enter commits a rename op with the trimmed value', () => {
      const el = makePanel()
      const events: LayerPanelChange[] = []
      el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

      const input = startRename(el, 'layer-0')
      input.value = '  Main hall  '
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      expect(events).toEqual([{ op: 'rename', layerId: 'layer-0', value: 'Main hall' }])
      expect(el.querySelector('input.layer-rename')).toBeNull()
      el.remove()
    })

    it('Escape cancels the rename without emitting', () => {
      const el = makePanel()
      const events: LayerPanelChange[] = []
      el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

      const input = startRename(el, 'layer-0')
      input.value = 'Renamed'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

      expect(events).toEqual([])
      expect(el.querySelector('input.layer-rename')).toBeNull()
      expect(rowOf(el, 'layer-0').querySelector('.layer-name')?.textContent).toBe('Default')
      el.remove()
    })

    it('blur commits, and an unchanged or blank value emits nothing', () => {
      const el = makePanel()
      const events: LayerPanelChange[] = []
      el.addEventListener('layer-panel:change', event => events.push((event as CustomEvent<LayerPanelChange>).detail))

      startRename(el, 'layer-0').dispatchEvent(new Event('blur'))
      expect(events).toEqual([])

      const input = startRename(el, 'layer-0')
      input.value = '   '
      input.dispatchEvent(new Event('blur'))
      expect(events).toEqual([])

      const input2 = startRename(el, 'layer-0')
      input2.value = 'Main hall'
      input2.dispatchEvent(new Event('blur'))
      expect(events).toEqual([{ op: 'rename', layerId: 'layer-0', value: 'Main hall' }])

      el.remove()
    })
  })
})

/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import './status-bar.js'
import { StatusBar } from './status-bar.js'

function makeBar(): StatusBar {
  const el = document.createElement('status-bar')
  document.body.appendChild(el)
  return el
}

describe('status-bar', () => {
  it('renders polite live regions for coordinates and selection', () => {
    const el = makeBar()
    expect(el.querySelector('.status-coords')?.getAttribute('aria-live')).toBe('polite')
    expect(el.querySelector('.status-selection')?.getAttribute('aria-live')).toBe('polite')
    el.remove()
  })

  it('setPosition formats fixed-decimal world coordinates', () => {
    const el = makeBar()
    el.setPosition({ x: 12, y: -5 })
    expect(el.querySelector('.status-coords')?.textContent).toBe('x: 12.00, y: -5.00')
    el.remove()
  })

  it('setSnap toggles the snap label', () => {
    const el = makeBar()
    el.setSnap('grid')
    expect(el.querySelector('.status-snap')?.textContent).toBe('Snap: on (G)')
    el.setSnap('off')
    expect(el.querySelector('.status-snap')?.textContent).toBe('Snap: off (G)')
    el.remove()
  })

  it('setSelection shows the selected entity id or the empty state', () => {
    const el = makeBar()
    el.setSelection({ id: 'e3' })
    expect(el.querySelector('.status-selection')?.textContent).toBe('Selected: e3')
    el.setSelection(null)
    expect(el.querySelector('.status-selection')?.textContent).toBe('No selection')
    el.remove()
  })

  it('setSelection marks linked entities and thicknesses', () => {
    const el = makeBar()
    el.setSelection({ id: 'e4', thickness: 270, linked: true })
    expect(el.querySelector('.status-selection')?.textContent).toBe('Selected: e4 — thickness 270.00 mm — ↗ linked')
    el.setSelection({ id: 'e5', linked: true })
    expect(el.querySelector('.status-selection')?.textContent).toBe('Selected: e5 — ↗ linked')
    el.remove()
  })

  it('setHint shows and clears a transient refusal message', () => {
    const el = makeBar()
    el.setHint('That layer is locked')
    expect(el.querySelector('.status-hint')?.textContent).toBe('That layer is locked')
    el.setHint(null)
    expect(el.querySelector('.status-hint')?.textContent).toBe('')
    el.remove()
  })

  it('re-renders with current state when reconnected', () => {
    const el = makeBar()
    el.setPosition({ x: 1.5, y: 2 })
    el.setSnap('grid')
    el.setSelection({ id: 'e7' })
    el.remove()
    document.body.appendChild(el)
    expect(el.querySelector('.status-coords')?.textContent).toBe('x: 1.50, y: 2.00')
    expect(el.querySelector('.status-snap')?.textContent).toBe('Snap: on (G)')
    expect(el.querySelector('.status-selection')?.textContent).toBe('Selected: e7')
    el.remove()
  })
})

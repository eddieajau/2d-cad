/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import { CadCanvas } from '../pages/canvas/index.js'
import type { ToolPalette } from './tool-palette.js'
import './app-shell.js'

describe('app-shell', () => {
  it('renders the brand, the tool palette, and the canvas page', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    expect(el.querySelector('.brand')?.textContent).toBe('2D CAD')
    expect(el.querySelector('tool-palette')).not.toBeNull()
    expect(el.querySelector('cad-canvas')).toBeInstanceOf(CadCanvas)

    el.remove()
  })

  it('routes palette selections to the canvas and back to the palette', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    const palette = el.querySelector('tool-palette') as ToolPalette
    palette.querySelector<HTMLButtonElement>('button[data-tool="rect"]')!.click()

    const canvas = el.querySelector('cad-canvas')!
    expect(canvas.getTool()).toBe('rect')
    expect(palette.getAttribute('active')).toBe('rect')

    el.remove()
  })
})

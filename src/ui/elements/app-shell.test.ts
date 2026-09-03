/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import './app-shell.js'

describe('app-shell', () => {
  it('renders the brand and hello message', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    expect(el.querySelector('.brand')?.textContent).toBe('2D CAD')
    expect(el.querySelector('.hello')?.textContent).toBe('Hello, world')

    el.remove()
  })
})

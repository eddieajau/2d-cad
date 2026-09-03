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

  it('routes the select tool through the palette', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    const palette = el.querySelector('tool-palette') as ToolPalette
    palette.querySelector<HTMLButtonElement>('button[data-tool="select"]')!.click()

    const canvas = el.querySelector('cad-canvas')!
    expect(canvas.getTool()).toBe('select')
    expect(palette.getAttribute('active')).toBe('select')

    el.remove()
  })

  describe('undo/redo', () => {
    function makeShell(): { shell: HTMLElement; canvas: CadCanvas } {
      const shell = document.createElement('app-shell')
      document.body.appendChild(shell)
      const canvas = shell.querySelector('cad-canvas')!
      const inner = canvas.querySelector('canvas')!
      inner.setPointerCapture = () => {}
      inner.releasePointerCapture = () => {}
      canvas.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      return { shell, canvas }
    }

    function pointer(canvas: CadCanvas, type: string, clientX: number, clientY: number): void {
      canvas.querySelector('canvas')!.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true }))
    }

    function shortcut(key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): void {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }))
    }

    it('reverses commits and deletes; redo reapplies them', () => {
      const { shell, canvas } = makeShell()

      // Commit a line.
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      expect(canvas.getDocument().entities).toHaveLength(1)

      // Delete it.
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      pointer(canvas, 'pointerup', 20, 0)
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      expect(canvas.getDocument().entities).toHaveLength(0)

      // Undo the delete…
      shortcut('z', { ctrlKey: true })
      expect(canvas.getDocument().entities).toHaveLength(1)
      // …and the original commit.
      shortcut('z', { ctrlKey: true })
      expect(canvas.getDocument().entities).toHaveLength(0)

      // Redo reapplies both.
      shortcut('z', { ctrlKey: true, shiftKey: true })
      expect(canvas.getDocument().entities).toHaveLength(1)
      shortcut('y', { ctrlKey: true })
      expect(canvas.getDocument().entities).toHaveLength(0)

      shell.remove()
    })

    it('editing after undo discards the redo tail', () => {
      const { shell, canvas } = makeShell()

      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      pointer(canvas, 'pointerup', 20, 0)
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      shortcut('z', { metaKey: true })
      expect(canvas.getDocument().entities).toHaveLength(1)

      // A fresh commit replaces the redo tail.
      canvas.setTool('line')
      pointer(canvas, 'pointerdown', 10, 10)
      pointer(canvas, 'pointerup', 50, 10)
      expect(canvas.getDocument().entities).toHaveLength(2)

      // Redo is a no-op now.
      shortcut('z', { metaKey: true, shiftKey: true })
      expect(canvas.getDocument().entities).toHaveLength(2)

      shell.remove()
    })

    it('clears a selection left dangling by a history walk', () => {
      const { shell, canvas } = makeShell()

      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      const lineId = canvas.getDocument().entities[0]!.id
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      pointer(canvas, 'pointerup', 20, 0)
      expect(canvas.getSelection()).toBe(lineId)

      // Undo removes the (uncommitted) line that the selection points at…
      shortcut('z', { ctrlKey: true })
      expect(canvas.getSelection()).toBeNull()

      // …and redo brings the line back.
      shortcut('z', { ctrlKey: true, shiftKey: true })
      expect(canvas.getDocument().entities).toHaveLength(1)

      shell.remove()
    })

    it('ignores undo/redo shortcuts while a form control has focus', () => {
      const { shell, canvas } = makeShell()

      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)

      const input = document.createElement('input')
      document.body.appendChild(input)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))

      expect(canvas.getDocument().entities).toHaveLength(1)

      input.remove()
      shell.remove()
    })
  })
})

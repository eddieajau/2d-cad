/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CadCanvas } from '../pages/canvas/index.js'
import type { LayerPanelChange } from './layer-panel.js'
import type { ToolPalette } from './tool-palette.js'
import './app-shell.js'

const { renderSceneMock } = vi.hoisted(() => ({ renderSceneMock: vi.fn() }))
// Mock only the scene renderer (happy-dom's 2D context is null) so mediator
// tests can inspect what the canvas would draw.
vi.mock('../../render.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../render.js')>()),
  renderScene: renderSceneMock,
}))

beforeEach(() => {
  localStorage.clear()
  renderSceneMock.mockClear()
})

afterEach(() => {
  localStorage.clear()
})

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

describe('app-shell', () => {
  it('renders the brand, the tool palette, and the canvas page', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    expect(el.querySelector('.brand')?.textContent).toBe('2D CAD')
    expect(el.querySelector('tool-palette')).not.toBeNull()
    expect(el.querySelector('layer-panel')).not.toBeNull()
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

  describe('status bar', () => {
    it('pushes pointer, snap, and selection readouts into the status bar', () => {
      const shell = document.createElement('app-shell')
      document.body.appendChild(shell)
      const canvas = shell.querySelector('cad-canvas')!
      const inner = canvas.querySelector('canvas')!
      inner.setPointerCapture = () => {}
      inner.releasePointerCapture = () => {}
      canvas.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })
      const bar = shell.querySelector('status-bar')!

      // The canvas's snap mode is seeded on connect (default: off).
      expect(bar.querySelector('.status-snap')?.textContent).toBe('Snap: off (G)')

      // Pointer events flow through as world coordinates.
      inner.dispatchEvent(new PointerEvent('pointermove', { clientX: 12, clientY: 7, bubbles: true }))
      expect(bar.querySelector('.status-coords')?.textContent).toBe('x: 12.00, y: -7.00')

      // The G toggle is reflected in the snap label.
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      expect(bar.querySelector('.status-snap')?.textContent).toBe('Snap: on (G)')

      // Commit a line, then select it.
      inner.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }))
      inner.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY: 0, bubbles: true }))
      canvas.setTool('select')
      inner.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 0, bubbles: true }))
      expect(bar.querySelector('.status-selection')?.textContent).toMatch(/^Selected: e\d+$/)

      shell.remove()
    })
  })

  describe('layer panel', () => {
    /** A shell whose canvas can reach the (mocked) renderer. */
    function makeDrawableShell(): { shell: HTMLElement; canvas: CadCanvas } {
      const { shell, canvas } = makeShell()
      const inner = canvas.querySelector('canvas')!
      inner.getContext = (() => ({}) as unknown) as typeof inner.getContext
      return { shell, canvas }
    }

    function emitChange(panel: Element, detail: LayerPanelChange): void {
      panel.dispatchEvent(new CustomEvent('layer-panel:change', { detail, bubbles: true, composed: true }))
    }

    it('seeds the panel and maps add ops onto the document through the history', () => {
      const { shell, canvas } = makeDrawableShell()
      const panel = shell.querySelector('layer-panel')!
      expect(panel.querySelectorAll('.layer-row')).toHaveLength(1)

      emitChange(panel, { op: 'add', layerId: '', value: 'Office' })
      expect(canvas.getDocument().layers.map(layer => layer.name)).toEqual(['Default', 'Office'])

      // Layer changes are undoable like any edit.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
      expect(canvas.getDocument().layers).toHaveLength(1)

      shell.remove()
    })

    it('a visibility op hides the layer from hit-testing and rendering', async () => {
      const { shell, canvas } = makeDrawableShell()

      // Commit a line through (0,0)–(40,0) and select it.
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      expect(canvas.getSelection()).not.toBeNull()

      emitChange(shell.querySelector('layer-panel')!, { op: 'visibility', layerId: 'layer-0', value: false })

      // Hidden entities can no longer be picked…
      pointer(canvas, 'pointerdown', 20, 0)
      expect(canvas.getSelection()).toBeNull()

      // …and vanish from renderScene calls.
      await new Promise(resolve => requestAnimationFrame(resolve))
      const lastCall = renderSceneMock.mock.calls.at(-1)!
      expect(lastCall[1].layers[0].visible).toBe(false)

      shell.remove()
    })

    it('a lock op makes the layer uneditable and surfaces a status-bar hint', () => {
      const { shell, canvas } = makeDrawableShell()

      emitChange(shell.querySelector('layer-panel')!, { op: 'lock', layerId: 'layer-0', value: true })
      expect(canvas.getDocument().layers[0]?.locked).toBe(true)

      // Locked entities are unselectable, so they cannot be moved or deleted.
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      expect(canvas.getSelection()).toBeNull()

      // A refused edit announces itself through the status bar.
      canvas.dispatchEvent(new CustomEvent('cad-canvas:blocked', { detail: { reason: 'locked' }, bubbles: true }))
      expect(shell.querySelector('.status-hint')?.textContent).toBe('That layer is locked')

      shell.remove()
    })
  })

  describe('undo/redo', () => {
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

  describe('actions', () => {
    it('emits app-shell:action from the New/Open/Save buttons', () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const { shell } = makeShell()

      const actions: string[] = []
      shell.addEventListener('app-shell:action', event => {
        actions.push((event as CustomEvent<string>).detail)
      })
      for (const action of ['new', 'open', 'save']) {
        shell.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.click()
      }

      expect(actions).toEqual(['new', 'open', 'save'])

      click.mockRestore()
      shell.remove()
    })

    it('restores the autosaved document on connect', () => {
      localStorage.setItem(
        '2d-cad:v2',
        JSON.stringify({ entities: [{ id: 'e1', type: 'circle', cx: 10, cy: 5, r: 3 }] })
      )

      const { shell, canvas } = makeShell()

      expect(canvas.getDocument().entities).toHaveLength(1)
      expect(canvas.getDocument().entities[0]?.type).toBe('circle')

      shell.remove()
    })

    it('Save downloads the current document', () => {
      const createElement = vi.spyOn(document, 'createElement')
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const { shell, canvas } = makeShell()
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)

      shell.querySelector<HTMLButtonElement>('button[data-action="save"]')!.click()

      const index = createElement.mock.calls.findIndex(([tag]) => tag === 'a')
      const anchor = createElement.mock.results[index]!.value as HTMLAnchorElement
      expect(anchor.download).toMatch(/^drawing-\d{8}\.json$/)

      createElement.mockRestore()
      click.mockRestore()
      shell.remove()
    })

    it('New resets the document without prompting when everything is saved', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { shell, canvas } = makeShell()
        pointer(canvas, 'pointerdown', 0, 0)
        pointer(canvas, 'pointerup', 40, 0)
        // Flush the debounced autosave so nothing is pending.
        vi.advanceTimersByTime(1000)
        expect(canvas.getDocument().entities).toHaveLength(1)

        shell.querySelector<HTMLButtonElement>('button[data-action="new"]')!.click()

        expect(canvas.getDocument().entities).toHaveLength(0)
        expect(confirmSpy).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
        vi.restoreAllMocks()
      }
    })
  })

  describe('autosave', () => {
    it('debounces saveLocal after a commit', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { shell, canvas } = makeShell()

        pointer(canvas, 'pointerdown', 0, 0)
        pointer(canvas, 'pointerup', 40, 0)
        expect(localStorage.getItem('2d-cad:v2')).toBeNull()

        vi.advanceTimersByTime(999)
        expect(localStorage.getItem('2d-cad:v2')).toBeNull()

        vi.advanceTimersByTime(1)
        const stored = localStorage.getItem('2d-cad:v2')
        expect(stored).not.toBeNull()
        expect(JSON.parse(stored!).entities).toHaveLength(1)

        shell.remove()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

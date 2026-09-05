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

/** A shell whose canvas can reach the (mocked) renderer. */
function makeDrawableShell(): { shell: HTMLElement; canvas: CadCanvas } {
  const { shell, canvas } = makeShell()
  const inner = canvas.querySelector('canvas')!
  inner.getContext = (() => ({}) as unknown) as typeof inner.getContext
  return { shell, canvas }
}

describe('app-shell', () => {
  it('renders the brand, the side-panel sections, and the canvas page', () => {
    const el = document.createElement('app-shell')
    document.body.appendChild(el)

    expect(el.querySelector('.brand')?.textContent).toBe('2D CAD')
    expect(el.querySelector('cad-canvas')).toBeInstanceOf(CadCanvas)

    // The panel column is a named complementary landmark with a section per
    // heading, and every control panel stacks inside it.
    const panel = el.querySelector<HTMLElement>('.side-panel')!
    expect(panel.getAttribute('role')).toBe('complementary')
    expect(panel.getAttribute('aria-label')).toBe('Panels')
    expect([...panel.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual([
      'Tools',
      'Properties',
      'Layers',
    ])
    expect(panel.querySelector('tool-palette')).not.toBeNull()
    // Colour folds into the properties panel's own section.
    expect(panel.querySelector('properties-panel entity-colour')).not.toBeNull()
    expect(panel.querySelector('layer-panel')).not.toBeNull()

    // The canvas page sits outside the panel column.
    expect(panel.querySelector('cad-canvas')).toBeNull()
    expect(el.querySelector('.app-main')?.contains(el.querySelector('cad-canvas'))).toBe(true)

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

  describe('properties panel', () => {
    it('maps a thickness patch onto updateEntity through the history', () => {
      const { shell, canvas } = makeDrawableShell()

      // Commit a hairline rect, then thicken it from the properties panel.
      canvas.setTool('rect')
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 4000, 3000)
      const rect = canvas.getDocument().entities[0]
      expect(rect?.type).toBe('rect')

      shell.querySelector('properties-panel')!.dispatchEvent(
        new CustomEvent('properties-panel:change', {
          detail: { id: rect!.id, patch: { thickness: 110 } },
          bubbles: true,
          composed: true,
        })
      )
      const edited = canvas.getDocument().entities[0]
      expect(edited?.type === 'rect' && edited.thickness).toBe(110)

      // Property edits are undoable like any other.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
      const restored = canvas.getDocument().entities[0]
      expect(restored?.type === 'rect' && restored.thickness).toBeUndefined()

      shell.remove()
    })

    it('a dx patch on a linked entity moves the ref, not the stored coords', () => {
      const { shell, canvas } = makeDrawableShell()
      // A linked rect: ref at its parent's nw anchor plus (10, -5).
      canvas.setDocument({
        ...canvas.getDocument(),
        entities: [
          {
            id: 'e9',
            type: 'rect',
            layerId: 'layer-0',
            x: 10,
            y: -5,
            w: 100,
            h: 50,
            ref: { id: 'e1', corner: 'nw', dx: 10, dy: -5 },
          },
        ],
      })

      shell.querySelector('properties-panel')!.dispatchEvent(
        new CustomEvent('properties-panel:change', {
          detail: { id: 'e9', patch: { dx: 30 } },
          bubbles: true,
          composed: true,
        })
      )
      const rect = canvas.getDocument().entities[0]
      expect(rect?.type === 'rect' && rect.ref?.dx).toBe(30)
      expect(rect?.type === 'rect' && rect.x).toBe(10)

      shell.remove()
    })

    it('pushes the resolved selected entity into the panel', () => {
      const { shell, canvas } = makeDrawableShell()

      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      canvas.setTool('select')
      pointer(canvas, 'pointerdown', 20, 0)
      pointer(canvas, 'pointerup', 20, 0)

      const panel = shell.querySelector('properties-panel')!
      expect(panel.querySelector('.prop-empty')).toBeNull()
      expect(panel.querySelector('.prop-input[data-key="x1"]')).not.toBeNull()

      // Clicking empty space reverts to the empty state.
      pointer(canvas, 'pointerdown', 500, 500)
      expect(panel.querySelector('.prop-empty')?.textContent).toBe('Nothing selected')

      shell.remove()
    })
  })

  describe('reference linking', () => {
    /**
     * Two rects drawn through the canvas so they sit in the shell's
     * history: parent (0,0)–(500,-300), child (600,-400)–(700,-500)
     * (world is y-up, so screen deltas negate).
     */
    function makeLinkScene(): { shell: HTMLElement; canvas: CadCanvas; parentId: string; childId: string } {
      const { shell, canvas } = makeDrawableShell()
      canvas.setTool('rect')
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 500, 300)
      pointer(canvas, 'pointerdown', 600, 400)
      pointer(canvas, 'pointerup', 700, 500)
      canvas.setTool('select')
      const [parent, child] = canvas.getDocument().entities
      return { shell, canvas, parentId: parent!.id, childId: child!.id }
    }

    function pickParent(shell: HTMLElement): void {
      shell.querySelector('properties-panel')!.querySelector<HTMLButtonElement>('button[data-link="pick"]')!.click()
    }

    it('the pick flow writes the ref capturing the current placement', () => {
      const { shell, canvas, parentId, childId } = makeLinkScene()
      const bar = shell.querySelector('status-bar')!

      // Select the child, then arm the pick via the panel's Link… button.
      pointer(canvas, 'pointerdown', 650, 450)
      pointer(canvas, 'pointerup', 650, 450)
      expect(canvas.getSelection()).toBe(childId)
      pickParent(shell)

      expect(bar.querySelector('.status-hint')?.textContent).toBe('Click the entity to link to')
      expect(canvas.style.cursor).toBe('crosshair')

      // Click just inside the parent near its NW corner (0, 0).
      pointer(canvas, 'pointerdown', 5, 5)

      const child = canvas.getDocument().entities.find(entity => entity.id === childId)
      // Child's NW anchor (600,-400) minus the parent's NW (0, 0).
      expect(child?.type === 'rect' && child.ref).toEqual({ id: parentId, corner: 'nw', dx: 600, dy: -400 })
      // The pick did not disturb the selection, and the hint is spent.
      expect(canvas.getSelection()).toBe(childId)
      expect(bar.querySelector('.status-hint')?.textContent).toBe('')
      // The panel flipped to the linked view.
      const panel = shell.querySelector('properties-panel')!
      expect(panel.querySelector('.prop-link-summary')?.textContent).toContain(parentId)
      expect(panel.querySelector('button[data-link="unlink"]')).not.toBeNull()

      shell.remove()
    })

    it('picking the selected entity as its own parent is rejected with a hint', () => {
      const { shell, canvas, childId } = makeLinkScene()
      const bar = shell.querySelector('status-bar')!

      pointer(canvas, 'pointerdown', 650, 450)
      pointer(canvas, 'pointerup', 650, 450)
      pickParent(shell)

      // Click on the child itself.
      pointer(canvas, 'pointerdown', 650, 450)

      const child = canvas.getDocument().entities.find(entity => entity.id === childId)
      expect(child?.type === 'rect' && child.ref).toBeUndefined()
      expect(bar.querySelector('.status-hint')?.textContent).toBe('An entity cannot link to itself')

      shell.remove()
    })

    it('Escape on the canvas cancels the pick and clears the hint', () => {
      const { shell, canvas, childId } = makeLinkScene()
      const bar = shell.querySelector('status-bar')!

      pointer(canvas, 'pointerdown', 650, 450)
      pointer(canvas, 'pointerup', 650, 450)
      pickParent(shell)

      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(bar.querySelector('.status-hint')?.textContent).toBe('')
      expect(canvas.style.cursor).toBe('')
      const child = canvas.getDocument().entities.find(entity => entity.id === childId)
      expect(child?.type === 'rect' && child.ref).toBeUndefined()

      shell.remove()
    })

    it('Unlink removes the ref, re-pushes the panel, and is undoable', () => {
      const { shell, canvas, parentId, childId } = makeLinkScene()

      // Link the child to the parent's NW corner through the pick flow, so
      // the link itself sits in the history for the undo assertion.
      pointer(canvas, 'pointerdown', 650, 450)
      pointer(canvas, 'pointerup', 650, 450)
      pickParent(shell)
      pointer(canvas, 'pointerdown', 5, 5)

      const panel = shell.querySelector('properties-panel')!
      expect(panel.querySelector('.prop-link-summary')?.textContent).toContain(parentId)
      panel.querySelector<HTMLButtonElement>('button[data-link="unlink"]')!.click()

      const child = canvas.getDocument().entities.find(entity => entity.id === childId)
      expect(child?.type === 'rect' && child.ref).toBeUndefined()
      // The panel re-pushed to the unlinked view.
      expect(panel.querySelector('button[data-link="pick"]')).not.toBeNull()
      expect(panel.querySelector('.prop-input[data-key="x"]')).not.toBeNull()

      // Unlinking is undoable like any edit.
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
      const restored = canvas.getDocument().entities.find(entity => entity.id === childId)
      expect(restored?.type === 'rect' && restored.ref).toEqual({ id: parentId, corner: 'nw', dx: 600, dy: -400 })

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
    it('emits app-shell:action from the New/Open/Save/Fit buttons', () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const { shell } = makeShell()

      const actions: string[] = []
      shell.addEventListener('app-shell:action', event => {
        actions.push((event as CustomEvent<string>).detail)
      })
      for (const action of ['new', 'open', 'save', 'fit']) {
        shell.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.click()
      }

      expect(actions).toEqual(['new', 'open', 'save', 'fit'])

      click.mockRestore()
      shell.remove()
    })

    it('Fit frames the document on the canvas at the largest fitting zoom', () => {
      const { shell, canvas } = makeShell()
      Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true })
      Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true })

      // Commit a line through world (0,0)–(40,0); the shell starts zoomed in.
      pointer(canvas, 'pointerdown', 0, 0)
      pointer(canvas, 'pointerup', 40, 0)
      canvas.setViewport({ offsetX: 0, offsetY: 0, scale: 1 })

      shell.querySelector<HTMLButtonElement>('button[data-action="fit"]')!.click()

      const vp = canvas.getViewport()
      // The line's width governs: 320/40 = 8; centred with a 40px margin.
      expect(vp.scale).toBeCloseTo(8)
      expect(vp.offsetX).toBeCloseTo(40)
      expect(vp.offsetY).toBeCloseTo(150)

      shell.remove()
    })

    it('Open frames the loaded document', async () => {
      const fitSpy = vi.spyOn(CadCanvas.prototype, 'fitToExtents')
      const { shell } = makeShell()
      const file = new File(
        [JSON.stringify({ entities: [{ id: 'e1', type: 'line', x1: 1000, y1: 1000, x2: 1100, y2: 1050 }] })],
        'drawing.json',
        { type: 'application/json' }
      )
      const input = shell.querySelector<HTMLInputElement>('.file-input')!
      Object.defineProperty(input, 'files', { value: [file], configurable: true })

      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(fitSpy).toHaveBeenCalledTimes(1)

      fitSpy.mockRestore()
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

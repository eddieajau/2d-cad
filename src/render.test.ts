/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import {
  addEntity,
  addLayer,
  createDocument,
  DEFAULT_COLOUR,
  updateLayer,
  type DrawingDocument,
  type Entity,
} from './document.js'
import {
  documentBounds,
  drawCircle,
  drawDim,
  drawLine,
  drawRect,
  drawText,
  formatLength,
  gridInterval,
  renderGrid,
  renderScene,
  resolveColour,
  type RenderOptions,
} from './render.js'
import type { Viewport } from './viewport.js'

interface Call {
  method: string
  args: unknown[]
}

function createCtxStub(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const target: Record<string | symbol, unknown> = {}
  const stub = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop]
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
      }
    },
    set(t, prop, value) {
      t[prop] = value
      calls.push({ method: `set:${String(prop)}`, args: [value] })
      return true
    },
  })
  return { ctx: stub as unknown as CanvasRenderingContext2D, calls }
}

// Offset chosen so world y ∈ [0, 300] is visible (y-up world).
const viewport: Viewport = { offsetX: 0, offsetY: 300, scale: 1 }

const options: RenderOptions = {
  width: 400,
  height: 300,
  theme: {
    gridMinor: '#a0a0a0',
    gridMajor: '#666666',
    gridAxis: '#444444',
    gridLabel: '#333333',
    ink: '#000000',
    selection: '#ff8800',
  },
}

const line = { id: 'e1', type: 'line', layerId: 'layer-0', x1: 10, y1: 10, x2: 50, y2: 30 } as const
const circle = { id: 'e2', type: 'circle', layerId: 'layer-0', cx: 100, cy: 100, r: 20 } as const
const rect = { id: 'e3', type: 'rect', layerId: 'layer-0', x: 20, y: 20, w: 30, h: 10 } as const

function docWith(...entities: Entity[]): DrawingDocument {
  let doc = createDocument()
  for (const entity of entities) doc = addEntity(doc, entity)
  return doc
}

describe('gridInterval', () => {
  it('never gets denser than the minimum pixel spacing', () => {
    expect(gridInterval(1)).toEqual({ minor: 10, major: 100 })
    expect(gridInterval(0.5)).toEqual({ minor: 100, major: 1000 })
    expect(gridInterval(10)).toEqual({ minor: 1, major: 10 })
  })
})

describe('formatLength', () => {
  it('renders sub-metre lengths in millimetres', () => {
    expect(formatLength(40)).toBe('40 mm')
    expect(formatLength(999.5)).toBe('999.5 mm')
  })

  it('renders metre-scale lengths in metres, trimming trailing zeros', () => {
    expect(formatLength(1000)).toBe('1 m')
    expect(formatLength(12340)).toBe('12.34 m')
    expect(formatLength(5000)).toBe('5 m')
  })
})

describe('resolveColour', () => {
  it('prefers an entity colour override over the layer colour', () => {
    const doc = docWith({ ...line, colour: '#ff0000' })
    expect(resolveColour(doc, doc.entities[0]!, options.theme.ink)).toBe('#ff0000')
  })

  it('uses the layer colour when the entity has no override', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = updateLayer(doc, survey, { colour: '#00aa00' })
    doc = addEntity(doc, { ...line, layerId: survey })
    expect(resolveColour(doc, doc.entities[0]!, options.theme.ink)).toBe('#00aa00')
  })

  it('falls back to the theme ink for an unknown layer', () => {
    expect(resolveColour(createDocument(), { ...line, layerId: 'ghost' }, options.theme.ink)).toBe(options.theme.ink)
  })

  it('falls back to the theme ink for a layerless preview', () => {
    const { layerId: _layerId, ...layerless } = line
    expect(resolveColour(createDocument(), layerless, options.theme.ink)).toBe(options.theme.ink)
  })
})

describe('renderScene', () => {
  it('clears the canvas before drawing the scene', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, createDocument(), viewport, options)
    expect(calls[0]).toEqual({ method: 'clearRect', args: [0, 0, options.width, options.height] })
  })

  it('dispatches one draw per entity type', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line, circle, rect), viewport, options)

    // line (10,10)→(50,30) at scale 1, y flipped: ends at screen (50,270)
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    expect(calls.some(c => c.method === 'arc')).toBe(true)
    expect(calls.some(c => c.method === 'strokeRect' && c.args[0] === 20 && c.args[1] === 270)).toBe(true)
  })

  it('renders text and dim entities with the resolved layer colour', () => {
    const { ctx, calls } = createCtxStub()
    const text = { id: 't1', type: 'text', layerId: 'layer-0', x: 10, y: 10, text: 'note', size: 12 } as const
    const dim = { id: 'd1', type: 'dim', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 0, offset: 5 } as const
    renderScene(ctx, docWith(text, dim), viewport, options)

    // The seed layer carries the default ink, so its entities draw with it.
    expect(calls).toContainEqual({ method: 'set:fillStyle', args: [DEFAULT_COLOUR] })
    expect(calls.some(c => c.method === 'fillText' && c.args[0] === 'note')).toBe(true)
    expect(calls.some(c => c.method === 'fillText' && c.args[0] === '40 mm')).toBe(true)
  })

  it('draws each entity with its resolved colour, override over layer', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = updateLayer(doc, survey, { colour: '#00aa00' })
    doc = addEntity(doc, { ...line, layerId: survey, colour: '#ff0000' })
    doc = addEntity(doc, { ...circle, layerId: survey })

    const { ctx, calls } = createCtxStub()
    renderScene(ctx, doc, viewport, options)

    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: ['#ff0000'] })
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: ['#00aa00'] })
  })

  it('draws an entity on an unknown layer with the fallback ink', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith({ ...line, layerId: 'ghost' }), viewport, options)
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.ink] })
  })

  it('lets the selection highlight win over an entity colour override', () => {
    const { ctx, calls } = createCtxStub()
    const override = { ...line, colour: '#ff0000' }
    renderScene(ctx, docWith(override), viewport, { ...options, selectedId: line.id })

    // The override paints the committed pass…
    const lastOverride = calls.map(c => c.method === 'set:strokeStyle' && c.args[0] === '#ff0000').lastIndexOf(true)
    // …but the highlight afterwards carries the selection style, not the colour.
    const selection = calls.findIndex(
      (c, index) => index > lastOverride && c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection
    )
    expect(selection).toBeGreaterThan(lastOverride)
  })

  it('highlights a selected text entity with the selection fill', () => {
    const { ctx, calls } = createCtxStub()
    const text = { id: 't1', type: 'text', layerId: 'layer-0', x: 10, y: 10, text: 'note', size: 12 } as const
    renderScene(ctx, docWith(text), viewport, { ...options, selectedId: 't1' })

    expect(calls).toContainEqual({ method: 'set:fillStyle', args: [options.theme.selection] })
  })

  it('culls entities outside the visible world rect', () => {
    const offscreenRect = { id: 'e4', type: 'rect', layerId: 'layer-0', x: 2000, y: 2000, w: 100, h: 100 } as const
    const offscreenCircle = { id: 'e5', type: 'circle', layerId: 'layer-0', cx: -500, cy: 0, r: 10 } as const
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(offscreenRect, offscreenCircle), viewport, options)

    expect(calls.some(c => c.method === 'arc')).toBe(false)
    expect(calls.some(c => c.method === 'strokeRect')).toBe(false)
  })

  it('skips entities on invisible layers, including a stale selection', () => {
    let doc = addLayer(createDocument(), 'Hidden')
    const hiddenId = doc.layers[1]!.id
    doc = addEntity(doc, { ...line, layerId: hiddenId })
    doc = updateLayer(doc, hiddenId, { visible: false })

    const { ctx, calls } = createCtxStub()
    renderScene(ctx, doc, viewport, { ...options, selectedId: line.id })

    // The hidden entity's geometry never reaches the screen…
    expect(calls).not.toContainEqual({ method: 'lineTo', args: [50, 270] })
    expect(calls).not.toContainEqual({ method: 'lineTo', args: [10, 270] })
    // …and a stale selection on the hidden layer is not highlighted.
    expect(calls.some(c => c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection)).toBe(false)
  })

  it('draws entities inside the visible world rect', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(circle), viewport, options)
    expect(calls.some(c => c.method === 'arc')).toBe(true)
  })

  it('adapts the grid interval to the scale', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options)
    const verticalStarts = calls.filter(c => c.method === 'moveTo' && c.args[1] === 0).map(c => c.args[0])
    expect(verticalStarts[0]).toBe(0)
    expect(verticalStarts[1]).toBe(10)

    const zoomedOut: Viewport = { offsetX: 0, offsetY: 0, scale: 0.5 }
    const zoomed = createCtxStub()
    renderGrid(zoomed.ctx, zoomedOut, options)
    const starts = zoomed.calls.filter(c => c.method === 'moveTo' && c.args[1] === 0).map(c => c.args[0])
    // minor = 100 world units at scale 0.5 → 50 px spacing
    expect(starts[1]).toBe(50)
  })

  it('labels major grid lines with world coordinates', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options)
    const labels = calls.filter(c => c.method === 'fillText').map(c => c.args[0])
    expect(labels).toContain('100')
    expect(labels).toContain('300')
  })

  it('styles minor, major, and axis grid marks distinctly', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options)
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.gridMinor] })
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.gridMajor] })
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.gridAxis] })
    // Labels carry their own (legible) colour, not a faint grid tone.
    expect(calls).toContainEqual({ method: 'set:fillStyle', args: [options.theme.gridLabel] })
  })

  it('fades the outgoing finer grid in near a decade step', () => {
    // scale 7: minor = 10 (70 px), fine = 1 (7 px) → halfway through the fade.
    const zoomed: Viewport = { offsetX: 0, offsetY: 0, scale: 7 }
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, zoomed, options)
    const alphas = calls.filter(c => c.method === 'set:globalAlpha').map(c => c.args[0])
    expect(alphas).toContain(0.75)
    // Alpha is restored before the axes and labels are drawn.
    expect(alphas[alphas.length - 1]).toBe(1)
  })

  it('skips the faded fine grid when well away from a decade step', () => {
    const { ctx, calls } = createCtxStub()
    renderGrid(ctx, viewport, options) // scale 1: fine spacing is 1 px
    expect(calls.some(c => c.method === 'set:globalAlpha')).toBe(false)
  })

  it('draws the preview dashed on top of committed geometry', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(), viewport, { ...options, preview: line })

    // The preview line (10,10)→(50,30) is drawn flipped to screen (50,270)…
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    // …with a dash pattern, then save/restore resets the dash afterwards.
    expect(calls).toContainEqual({ method: 'setLineDash', args: [[9, 3]] })
    expect(calls[calls.length - 1]).toEqual({ method: 'restore', args: [] })
  })

  it('does not touch dash state when no preview is given', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, options)
    expect(calls.some(c => c.method === 'setLineDash')).toBe(false)
  })

  it('redraws the selected entity with the selection style', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id })

    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'set:lineWidth', args: [2] })
    // The highlight is wrapped in save/restore like the preview.
    expect(calls[calls.length - 1]).toEqual({ method: 'restore', args: [] })
  })

  it('does not apply the selection style when nothing is selected', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: null })
    expect(calls.some(c => c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection)).toBe(false)
  })

  it('ignores a selectedId missing from the document', () => {
    const { ctx, calls } = createCtxStub()
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: 'missing' })
    expect(calls.some(c => c.method === 'set:strokeStyle' && c.args[0] === options.theme.selection)).toBe(false)
  })

  it('draws a dragged selection at the preview offset, not its committed position', () => {
    const { ctx, calls } = createCtxStub()
    const moved = { ...line, x1: 20, y1: 10, x2: 60, y2: 30 }
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id, preview: moved })

    // Selection style at the dragged position…
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [60, 270] })
    // …committed geometry is skipped, and no dashed ghost is drawn.
    expect(calls).not.toContainEqual({ method: 'lineTo', args: [50, 270] })
    expect(calls.some(c => c.method === 'setLineDash')).toBe(false)
  })

  it('draws a copy drag as the highlighted original plus a dashed clone ghost', () => {
    const { ctx, calls } = createCtxStub()
    const ghost = { ...line, id: 'ghost', x1: 20, y1: 10, x2: 60, y2: 30 }
    renderScene(ctx, docWith(line), viewport, { ...options, selectedId: line.id, preview: ghost })

    // Original keeps the selection style at its committed position…
    expect(calls).toContainEqual({ method: 'set:strokeStyle', args: [options.theme.selection] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [50, 270] })
    // …and the clone is previewed dashed at the dragged position.
    expect(calls).toContainEqual({ method: 'setLineDash', args: [[9, 3]] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [60, 270] })
  })
})

describe('thickness rendering', () => {
  it('renders a thickness-0 rect exactly as the hairline strokeRect', () => {
    const { ctx, calls } = createCtxStub()
    drawRect(ctx, { id: 'r1', type: 'rect', x: 0, y: 0, w: 30, h: 10 }, viewport)
    expect(calls).toContainEqual({ method: 'strokeRect', args: [0, 290, 30, 10] })
    expect(calls.some(c => c.method === 'fill')).toBe(false)
  })

  it('renders a thick rect as an even-odd band with both faces stroked', () => {
    const { ctx, calls } = createCtxStub()
    drawRect(ctx, { id: 'r1', type: 'rect', x: 0, y: 0, w: 30, h: 10, thickness: 3 }, viewport)
    // Outer face (0,0)–(30,10) and inner face (3,3)–(27,7), world y flipped.
    expect(calls).toContainEqual({ method: 'rect', args: [0, 290, 30, 10] })
    expect(calls).toContainEqual({ method: 'rect', args: [3, 293, 24, 4] })
    expect(calls).toContainEqual({ method: 'fill', args: ['evenodd'] })
    expect(calls).toContainEqual({ method: 'strokeRect', args: [0, 290, 30, 10] })
    expect(calls).toContainEqual({ method: 'strokeRect', args: [3, 293, 24, 4] })
  })

  it('clamps a closed rect void to a 1 mm inner face, centred', () => {
    const { ctx, calls } = createCtxStub()
    drawRect(ctx, { id: 'r1', type: 'rect', x: 0, y: 0, w: 4, h: 4, thickness: 10 }, viewport)
    // Inner face (1.5,1.5)–(2.5,2.5) in world; the band still fills even-odd.
    expect(calls).toContainEqual({ method: 'rect', args: [1.5, 297.5, 1, 1] })
    expect(calls).toContainEqual({ method: 'fill', args: ['evenodd'] })
  })

  it('renders a thick circle as an annulus: outer and inner arcs, even-odd fill', () => {
    const { ctx, calls } = createCtxStub()
    drawCircle(ctx, { id: 'c1', type: 'circle', cx: 100, cy: 100, r: 20, thickness: 5 }, viewport)
    const arcs = calls.filter(c => c.method === 'arc')
    expect(arcs).toHaveLength(2)
    expect(arcs[0]).toEqual({ method: 'arc', args: [100, 200, 20, 0, 2 * Math.PI] })
    expect(arcs[1]).toEqual({ method: 'arc', args: [100, 200, 15, 0, 2 * Math.PI] })
    expect(calls).toContainEqual({ method: 'fill', args: ['evenodd'] })
  })

  it('renders a thickness-0 circle as the single hairline arc', () => {
    const { ctx, calls } = createCtxStub()
    drawCircle(ctx, { id: 'c1', type: 'circle', cx: 100, cy: 100, r: 20 }, viewport)
    expect(calls.filter(c => c.method === 'arc')).toHaveLength(1)
    expect(calls.some(c => c.method === 'fill')).toBe(false)
  })

  it('renders a thick line as a centred ribbon at the world width', () => {
    const { ctx, calls } = createCtxStub()
    drawLine(ctx, { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 0, thickness: 4 }, viewport)
    expect(calls).toContainEqual({ method: 'set:lineWidth', args: [4] })
    // The stroke happens inside save/restore so the caller's width survives.
    const set = calls.findIndex(c => c.method === 'set:lineWidth' && c.args[0] === 4)
    expect(calls[set - 1]).toEqual({ method: 'save', args: [] })
    expect(calls[calls.length - 1]).toEqual({ method: 'restore', args: [] })
  })

  it('keeps thick entities bounded by their envelope', () => {
    const thick = { id: 'e9', type: 'rect', layerId: 'layer-0', x: 0, y: 0, w: 100, h: 100, thickness: 270 } as const
    expect(documentBounds(docWith(thick))).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })
})

describe('drawText', () => {
  it('scales the font by the viewport and fills at the anchor', () => {
    const { ctx, calls } = createCtxStub()
    drawText(ctx, { id: 't1', type: 'text', x: 10, y: 20, text: 'note', size: 12 }, viewport)
    expect(calls).toContainEqual({ method: 'set:font', args: ['12px sans-serif'] })
    expect(calls).toContainEqual({ method: 'fillText', args: ['note', 10, 280] })
  })

  it('zooms the font with the viewport scale', () => {
    const { ctx, calls } = createCtxStub()
    drawText(ctx, { id: 't1', type: 'text', x: 0, y: 0, text: 'A', size: 12 }, { offsetX: 0, offsetY: 0, scale: 2 })
    expect(calls).toContainEqual({ method: 'set:font', args: ['24px sans-serif'] })
  })
})

describe('drawDim', () => {
  // Measured (0,0)→(40,0), dimension line offset +5 → (0,5)→(40,5).
  const dim = { id: 'd1', type: 'dim', x1: 0, y1: 0, x2: 40, y2: 0, offset: 5 } as const

  it('labels the measured world length, centred on the dimension line', () => {
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, viewport)
    const label = calls.find(c => c.method === 'fillText')
    expect(label).toEqual({ method: 'fillText', args: ['40 mm', 20, expect.any(Number)] })
    expect(label!.args[2] as number).toBeLessThan(295) // above the dimension line (y=295)
  })

  it('draws the dimension line, extension lines, and arrowheads', () => {
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, viewport)
    // Dimension line runs between the offset endpoints.
    expect(calls).toContainEqual({ method: 'moveTo', args: [0, 295] })
    expect(calls).toContainEqual({ method: 'lineTo', args: [40, 295] })
    // Extension lines start at the measured points.
    expect(calls).toContainEqual({ method: 'moveTo', args: [0, 300] })
    expect(calls).toContainEqual({ method: 'moveTo', args: [40, 300] })
    // Two arrowheads: filled triangles.
    const fills = calls.filter(c => c.method === 'fill')
    expect(fills).toHaveLength(2)
  })

  it('measures correctly at any zoom (world-space length, screen-space furniture)', () => {
    const zoomed: Viewport = { offsetX: 100, offsetY: 500, scale: 0.25 }
    const { ctx, calls } = createCtxStub()
    drawDim(ctx, dim, zoomed)
    // The label still reads the world length 40, at the smaller screen size.
    const label = calls.find(c => c.method === 'fillText')
    expect(label!.args[0]).toBe('40 mm')
    expect(calls).toContainEqual({ method: 'set:font', args: ['10px sans-serif'] })
  })
})

describe('documentBounds', () => {
  it('is null for an empty document', () => {
    expect(documentBounds(createDocument())).toBeNull()
  })

  it('unions the bounds of every entity', () => {
    const bounds = documentBounds(docWith(line, circle))
    expect(bounds).toEqual({ minX: 10, minY: 10, maxX: 120, maxY: 120 })
  })

  it('measures referenced entities where they resolve, not where they are stored', () => {
    // The child is stored at the origin but resolves to the parent's ne
    // corner + (50, 0), i.e. (100,50)–(150,100).
    const parent = { id: 'parent', type: 'rect', layerId: 'layer-0', x: 0, y: 0, w: 100, h: 100 } as const
    const child = {
      id: 'child',
      type: 'rect',
      layerId: 'layer-0',
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      ref: { id: 'parent', corner: 'ne', dx: 50, dy: 0 },
    } as const
    expect(documentBounds(docWith(parent, child))).toEqual({ minX: 0, minY: 0, maxX: 150, maxY: 100 })
  })
})

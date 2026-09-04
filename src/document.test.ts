/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import {
  addEntity,
  addLayer,
  createDocument,
  createEntityId,
  DEFAULT_COLOUR,
  deserializeDocument,
  DocumentParseError,
  entitiesOnLayer,
  getEntity,
  isEditable,
  layerById,
  removeEntity,
  removeLayer,
  serializeDocument,
  setActiveLayer,
  translateEntity,
  updateEntity,
  updateLayer,
  type CircleEntity,
  type DimEntity,
  type LineEntity,
  type RectEntity,
  type TextEntity,
  type WallEntity,
} from './document.js'

const line: LineEntity = {
  id: 'e1',
  type: 'line',
  layerId: 'layer-0',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 5,
}

const circle: CircleEntity = {
  id: 'e2',
  type: 'circle',
  layerId: 'layer-0',
  cx: 4,
  cy: 4,
  r: 2,
}

describe('createEntityId', () => {
  it('generates unique ids', () => {
    const a = createEntityId()
    const b = createEntityId()
    expect(a).not.toBe(b)
  })
})

describe('createDocument', () => {
  it('creates an empty document with a default active layer', () => {
    expect(createDocument()).toEqual({
      entities: [],
      layers: [{ id: 'layer-0', name: 'Default', visible: true, locked: false, colour: DEFAULT_COLOUR }],
      activeLayerId: 'layer-0',
    })
  })
})

describe('addEntity', () => {
  it('appends the entity and does not mutate the input', () => {
    const doc = createDocument()
    const next = addEntity(doc, line)
    expect(next.entities).toEqual([line])
    expect(doc.entities).toEqual([])
  })

  it('defaults a layerless draft onto the active layer', () => {
    let doc = addLayer(createDocument(), 'Survey')
    doc = setActiveLayer(doc, doc.layers[1]!.id)
    doc = addEntity(doc, { id: 'e9', type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 })
    expect(doc.entities[0]!.layerId).toBe(doc.activeLayerId)
  })

  it('keeps an explicit layerId and the same object reference', () => {
    const survey = addLayer(createDocument(), 'Survey').layers[1]!.id
    const entity: LineEntity = { ...line, layerId: survey }
    const doc = addEntity(createDocument(), entity)
    expect(getEntity(doc, 'e1')).toBe(entity)
    expect(doc.entities[0]).toEqual({ ...line, layerId: survey })
  })
})

describe('getEntity', () => {
  it('returns the matching entity', () => {
    const doc = addEntity(createDocument(), line)
    expect(getEntity(doc, 'e1')).toBe(line)
  })

  it('returns undefined for an unknown id', () => {
    expect(getEntity(createDocument(), 'nope')).toBeUndefined()
  })
})

describe('updateEntity', () => {
  it('returns a new document with the patch applied and does not mutate the input', () => {
    const doc = addEntity(createDocument(), line)
    const next = updateEntity(doc, 'e1', { x2: 20 })
    expect(getEntity(next, 'e1')).toEqual({ ...line, x2: 20 })
    expect(doc.entities).toEqual([line])
  })

  it('leaves other entities untouched', () => {
    const doc = addEntity(addEntity(createDocument(), line), circle)
    const next = updateEntity(doc, 'e1', { x2: 20 })
    expect(getEntity(next, 'e2')).toBe(circle)
  })

  it('returns an equivalent document for an unknown id', () => {
    const doc = addEntity(createDocument(), line)
    const next = updateEntity(doc, 'nope', { x2: 20 })
    expect(next.entities).toEqual([line])
  })
})

describe('removeEntity', () => {
  it('removes the entity and does not mutate the input', () => {
    const doc = addEntity(addEntity(createDocument(), line), circle)
    const next = removeEntity(doc, 'e1')
    expect(next.entities).toEqual([circle])
    expect(doc.entities).toEqual([line, circle])
  })

  it('returns an equivalent document for an unknown id', () => {
    const doc = addEntity(createDocument(), line)
    const next = removeEntity(doc, 'nope')
    expect(next.entities).toEqual([line])
  })
})

describe('translateEntity', () => {
  const rect: RectEntity = { id: 'e3', type: 'rect', layerId: 'layer-0', x: 1, y: 2, w: 3, h: 4 }
  const text: TextEntity = { id: 'e4', type: 'text', layerId: 'layer-0', x: 1, y: 2, text: 'note', size: 12 }
  const dim: DimEntity = { id: 'e5', type: 'dim', layerId: 'layer-0', x1: 0, y1: 0, x2: 10, y2: 0, offset: 3 }

  it('translates a line and does not mutate the input', () => {
    const moved = translateEntity(line, 10, -5)
    expect(moved).toEqual({ ...line, x1: 10, y1: -5, x2: 20, y2: 0 })
    expect(line).toEqual({ id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 10, y2: 5 })
  })

  it('translates a circle', () => {
    expect(translateEntity(circle, 1, 2)).toEqual({ ...circle, cx: 5, cy: 6 })
  })

  it('translates a rect', () => {
    expect(translateEntity(rect, -3, 7)).toEqual({ ...rect, x: -2, y: 9 })
  })

  it('translates a text anchor', () => {
    expect(translateEntity(text, 2, 4)).toEqual({ ...text, x: 3, y: 6 })
  })

  it('translates a dim without touching its offset', () => {
    expect(translateEntity(dim, 5, -1)).toEqual({ ...dim, x1: 5, y1: -1, x2: 15, y2: -1 })
  })

  it('translates a wall envelope without touching thickness or alignment', () => {
    const wall: WallEntity = {
      id: 'e6',
      type: 'wall',
      layerId: 'layer-0',
      x: 0,
      y: 0,
      w: 10,
      h: 4,
      thickness: 270,
      alignment: 'outer',
    }
    const moved = translateEntity(wall, 5, -2)
    expect(moved).toEqual({ ...wall, x: 5, y: -2 })
  })
})

describe('serialize/deserialize round-trip', () => {
  it('round-trips a document', () => {
    const doc = addEntity(addEntity(createDocument(), line), circle)
    const restored = deserializeDocument(serializeDocument(doc))
    expect(restored).toEqual(doc)
  })

  it('round-trips text and dim entities', () => {
    const text: TextEntity = { id: 'e4', type: 'text', layerId: 'layer-0', x: 1, y: 2, text: 'note', size: 12 }
    const dim: DimEntity = { id: 'e5', type: 'dim', layerId: 'layer-0', x1: 0, y1: 0, x2: 10, y2: 0, offset: 3 }
    const doc = addEntity(addEntity(createDocument(), text), dim)
    const restored = deserializeDocument(serializeDocument(doc))
    expect(restored).toEqual(doc)
  })

  it('round-trips a wall with thickness and alignment', () => {
    const wall: WallEntity = {
      id: 'e6',
      type: 'wall',
      layerId: 'layer-0',
      x: 0,
      y: 0,
      w: 8000,
      h: 6000,
      thickness: 270,
      alignment: 'centre',
    }
    const doc = addEntity(createDocument(), wall)
    expect(deserializeDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('round-trips a document with multiple layers', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = addEntity(doc, { ...line, layerId: survey })
    doc = setActiveLayer(doc, survey)
    doc = updateLayer(doc, 'layer-0', { visible: false, locked: true })
    expect(deserializeDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('round-trips layer and entity colours', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = updateLayer(doc, survey, { colour: '#7c5cbf' })
    doc = addEntity(doc, { ...line, colour: '#b45309' })
    const restored = deserializeDocument(serializeDocument(doc))
    expect(layerById(restored, survey)?.colour).toBe('#7c5cbf')
    expect(restored.entities[0]?.colour).toBe('#b45309')
  })

  it('omits the colour key for entities without an override', () => {
    const doc = addEntity(createDocument(), line)
    const parsed = JSON.parse(serializeDocument(doc)) as { entities: Array<Record<string, unknown>> }
    expect(Object.hasOwn(parsed.entities[0]!, 'colour')).toBe(false)
  })
})

describe('deserializeDocument', () => {
  it('throws DocumentParseError on invalid JSON', () => {
    expect(() => deserializeDocument('{not json')).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError when entities is missing', () => {
    expect(() => deserializeDocument('{}')).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on an unknown entity type', () => {
    const json = JSON.stringify({ entities: [{ id: 'e1', type: 'arc' }] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on non-finite or missing numbers', () => {
    const nonFinite = JSON.stringify({
      entities: [{ id: 'e1', type: 'line', x1: 0, y1: 0, x2: Infinity, y2: 5 }],
    })
    expect(() => deserializeDocument(nonFinite)).toThrow(DocumentParseError)

    const missing = JSON.stringify({ entities: [{ id: 'e1', type: 'circle', cx: 1, cy: 2 }] })
    expect(() => deserializeDocument(missing)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a non-object entity', () => {
    const json = JSON.stringify({ entities: ['line'] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a text entity without a string "text"', () => {
    const json = JSON.stringify({ entities: [{ id: 'e1', type: 'text', x: 0, y: 0, size: 12 }] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a text entity with non-finite values', () => {
    const json = JSON.stringify({ entities: [{ id: 'e1', type: 'text', x: 0, y: 0, text: 'hi', size: NaN }] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a dim entity with missing values', () => {
    const json = JSON.stringify({ entities: [{ id: 'e1', type: 'dim', x1: 0, y1: 0, x2: 10, y2: 0 }] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a wall with missing values or a bad alignment', () => {
    const missing = JSON.stringify({ entities: [{ id: 'e1', type: 'wall', x: 0, y: 0, w: 10, h: 4, thickness: 270 }] })
    expect(() => deserializeDocument(missing)).toThrow(DocumentParseError)

    const badAlignment = JSON.stringify({
      entities: [{ id: 'e1', type: 'wall', x: 0, y: 0, w: 10, h: 4, thickness: 270, alignment: 'sideways' }],
    })
    expect(() => deserializeDocument(badAlignment)).toThrow(DocumentParseError)
  })

  it('throws DocumentParseError on a malformed layer', () => {
    const badName = JSON.stringify({ layers: [{ id: 'layer-1' }], entities: [] })
    expect(() => deserializeDocument(badName)).toThrow(DocumentParseError)

    const badFlags = JSON.stringify({
      layers: [{ id: 'layer-1', name: 'X', visible: 'yes', locked: false }],
      entities: [],
    })
    expect(() => deserializeDocument(badFlags)).toThrow(DocumentParseError)

    const badColour = JSON.stringify({
      layers: [{ id: 'layer-1', name: 'X', visible: true, locked: false, colour: 12 }],
      entities: [],
    })
    expect(() => deserializeDocument(badColour)).toThrow(DocumentParseError)
  })

  it('defaults a legacy layer colour to the default ink', () => {
    const json = JSON.stringify({
      layers: [{ id: 'layer-1', name: 'X', visible: true, locked: false }],
      entities: [],
    })
    expect(deserializeDocument(json).layers[0]?.colour).toBe(DEFAULT_COLOUR)
  })

  it('throws DocumentParseError on a non-string entity colour', () => {
    const json = JSON.stringify({ entities: [{ ...line, colour: true }] })
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError)
  })
})

describe('legacy documents without layers', () => {
  it('synthesises the default layer and assigns every entity to it', () => {
    const json = JSON.stringify({
      entities: [{ id: 'e1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 5 }],
    })
    expect(deserializeDocument(json)).toEqual(addEntity(createDocument(), line))
  })
})

describe('layer operations', () => {
  it('addLayer appends a visible, unlocked layer without mutating the input', () => {
    const doc = createDocument()
    const next = addLayer(doc, 'Survey')
    expect(next.layers).toEqual([
      { id: 'layer-0', name: 'Default', visible: true, locked: false, colour: DEFAULT_COLOUR },
      { id: 'layer-1', name: 'Survey', visible: true, locked: false, colour: DEFAULT_COLOUR },
    ])
    expect(doc.layers).toHaveLength(1)
  })

  it('updateLayer patches visibility and lock immutably', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const id = doc.layers[1]!.id
    const next = updateLayer(doc, id, { visible: false, locked: true })
    expect(layerById(next, id)).toMatchObject({ visible: false, locked: true })
    expect(layerById(doc, id)).toMatchObject({ visible: true, locked: false })
  })

  it('updateLayer ignores unknown ids', () => {
    const doc = createDocument()
    expect(updateLayer(doc, 'nope', { visible: false })).toEqual(doc)
  })

  it('removeLayer reassigns its entities to the active layer', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = addEntity(doc, { ...line, layerId: survey })
    const next = removeLayer(doc, survey)
    expect(next.layers).toEqual(doc.layers.slice(0, 1))
    expect(entitiesOnLayer(next, 'layer-0')).toEqual([{ ...line, layerId: 'layer-0' }])
    expect(doc.entities[0]!.layerId).toBe(survey)
  })

  it('removeLayer on the active layer makes the first remaining layer active', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = setActiveLayer(doc, survey)
    doc = addEntity(doc, { id: 'e9', type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, layerId: survey })
    const next = removeLayer(doc, survey)
    expect(next.activeLayerId).toBe('layer-0')
    expect(entitiesOnLayer(next, 'layer-0')).toHaveLength(1)
  })

  it('removeLayer refuses to remove the last layer', () => {
    const doc = addEntity(createDocument(), line)
    expect(removeLayer(doc, 'layer-0')).toBe(doc)
  })

  it('removeLayer ignores unknown ids', () => {
    const doc = createDocument()
    expect(removeLayer(doc, 'nope')).toBe(doc)
  })

  it('setActiveLayer switches the active layer and ignores unknown ids', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = setActiveLayer(doc, survey)
    expect(doc.activeLayerId).toBe(survey)
    expect(setActiveLayer(doc, 'nope')).toBe(doc)
  })

  it('entitiesOnLayer filters by layer id', () => {
    let doc = addLayer(createDocument(), 'Survey')
    const survey = doc.layers[1]!.id
    doc = addEntity(addEntity(doc, line), { ...circle, layerId: survey })
    expect(entitiesOnLayer(doc, 'layer-0')).toEqual([line])
    expect(entitiesOnLayer(doc, survey)).toEqual([{ ...circle, layerId: survey }])
  })

  it('isEditable refuses entities on locked or missing layers', () => {
    let doc = addLayer(createDocument(), 'Locked')
    const locked = doc.layers[1]!.id
    doc = updateLayer(doc, locked, { locked: true })
    doc = addEntity(doc, { ...line, layerId: locked })
    expect(isEditable(doc, doc.entities[0]!)).toBe(false)
    expect(isEditable(doc, line)).toBe(true)
    expect(isEditable(doc, { ...line, layerId: 'ghost' })).toBe(false)
  })
})

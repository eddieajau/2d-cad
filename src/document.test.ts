/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { describe, expect, it } from 'vitest'

import {
  addEntity,
  createDocument,
  createEntityId,
  deserializeDocument,
  DocumentParseError,
  getEntity,
  removeEntity,
  serializeDocument,
  updateEntity,
  type CircleEntity,
  type LineEntity,
} from './document.js'

const line: LineEntity = {
  id: 'e1',
  type: 'line',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 5,
}

const circle: CircleEntity = {
  id: 'e2',
  type: 'circle',
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
  it('creates an empty document', () => {
    expect(createDocument()).toEqual({ entities: [] })
  })
})

describe('addEntity', () => {
  it('appends the entity and does not mutate the input', () => {
    const doc = createDocument()
    const next = addEntity(doc, line)
    expect(next.entities).toEqual([line])
    expect(doc.entities).toEqual([])
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

describe('serialize/deserialize round-trip', () => {
  it('round-trips a document', () => {
    const doc = addEntity(addEntity(createDocument(), line), circle)
    const restored = deserializeDocument(serializeDocument(doc))
    expect(restored).toEqual(doc)
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
})

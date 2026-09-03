/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

export type EntityId = string

export interface LineEntity {
  id: EntityId
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CircleEntity {
  id: EntityId
  type: 'circle'
  cx: number
  cy: number
  r: number
}

export interface RectEntity {
  id: EntityId
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
}

export type Entity = LineEntity | CircleEntity | RectEntity

export interface DrawingDocument {
  readonly entities: readonly Entity[]
}

/** Thrown when JSON input cannot be parsed into a {@link DrawingDocument}. */
export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentParseError'
  }
}

// Counter-based ids keep generation deterministic and cheap to test.
let nextId = 1

export function createEntityId(): EntityId {
  return `e${nextId++}`
}

export function createDocument(): DrawingDocument {
  return { entities: [] }
}

export function getEntity(doc: DrawingDocument, id: EntityId): Entity | undefined {
  return doc.entities.find(entity => entity.id === id)
}

export function addEntity(doc: DrawingDocument, entity: Entity): DrawingDocument {
  return { entities: [...doc.entities, entity] }
}

export function updateEntity(
  doc: DrawingDocument,
  id: EntityId,
  patch: Partial<Omit<Entity, 'id' | 'type'>>
): DrawingDocument {
  return {
    entities: doc.entities.map(entity => (entity.id === id ? ({ ...entity, ...patch } as Entity) : entity)),
  }
}

/** A copy of `entity` translated by (dx, dy); the input is never mutated. */
export function translateEntity(entity: Entity, dx: number, dy: number): Entity {
  switch (entity.type) {
    case 'line':
      return { ...entity, x1: entity.x1 + dx, y1: entity.y1 + dy, x2: entity.x2 + dx, y2: entity.y2 + dy }
    case 'circle':
      return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy }
    case 'rect':
      return { ...entity, x: entity.x + dx, y: entity.y + dy }
  }
}

export function removeEntity(doc: DrawingDocument, id: EntityId): DrawingDocument {
  return { entities: doc.entities.filter(entity => entity.id !== id) }
}

function isFiniteRecord(value: object, keys: readonly string[]): boolean {
  return keys.every(key => {
    const num = (value as Record<string, unknown>)[key]
    return typeof num === 'number' && Number.isFinite(num)
  })
}

function parseEntity(value: unknown): Entity {
  if (typeof value !== 'object' || value === null) {
    throw new DocumentParseError('Entity must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') {
    throw new DocumentParseError('Entity must have a string "id"')
  }
  switch (record.type) {
    case 'line':
      if (!isFiniteRecord(record, ['x1', 'y1', 'x2', 'y2'])) {
        throw new DocumentParseError('Line entity has missing or non-finite coordinates')
      }
      return value as LineEntity
    case 'circle':
      if (!isFiniteRecord(record, ['cx', 'cy', 'r'])) {
        throw new DocumentParseError('Circle entity has missing or non-finite values')
      }
      return value as CircleEntity
    case 'rect':
      if (!isFiniteRecord(record, ['x', 'y', 'w', 'h'])) {
        throw new DocumentParseError('Rect entity has missing or non-finite values')
      }
      return value as RectEntity
    default:
      throw new DocumentParseError(`Unknown entity type: ${String(record.type)}`)
  }
}

export function serializeDocument(doc: DrawingDocument): string {
  return JSON.stringify({ entities: doc.entities })
}

export function deserializeDocument(json: string): DrawingDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new DocumentParseError('Invalid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as DrawingDocument).entities)) {
    throw new DocumentParseError('Document must be an object with an "entities" array')
  }
  return { entities: (parsed as { entities: unknown[] }).entities.map(parseEntity) }
}

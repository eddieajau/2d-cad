/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { anchorPoint } from './geometry.js'

export type EntityId = string

/** The layer every document is seeded with; legacy files load onto it. */
export const DEFAULT_LAYER_ID: EntityId = 'layer-0'

/**
 * The ink every document starts with. Matches the light theme's
 * `--canvas-ink` so seed layers read as ink on the default canvas.
 */
export const DEFAULT_COLOUR = '#1f2430'

export interface Layer {
  id: EntityId
  name: string
  visible: boolean
  locked: boolean
  /** Hex fill for entities that do not override their own colour. */
  colour: string
}

export interface LineEntity {
  id: EntityId
  type: 'line'
  layerId: EntityId
  x1: number
  y1: number
  x2: number
  y2: number
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
  /** Optional positional reference; the ref's parent anchor wins on resolve. */
  ref?: EntityRef
}

export interface CircleEntity {
  id: EntityId
  type: 'circle'
  layerId: EntityId
  cx: number
  cy: number
  r: number
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
  /** Optional positional reference; the ref's parent anchor wins on resolve. */
  ref?: EntityRef
}

export interface RectEntity {
  id: EntityId
  type: 'rect'
  layerId: EntityId
  x: number
  y: number
  w: number
  h: number
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
  /** Optional positional reference; the ref's parent anchor wins on resolve. */
  ref?: EntityRef
}

export interface TextEntity {
  id: EntityId
  type: 'text'
  layerId: EntityId
  /** Baseline-left anchor point. */
  x: number
  y: number
  text: string
  /** Font size in world units. */
  size: number
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
}

export interface DimEntity {
  id: EntityId
  type: 'dim'
  layerId: EntityId
  /** The two measured points. */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Signed perpendicular distance of the dimension line (left positive). */
  offset: number
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
}

/**
 * Which face of the wall the envelope (`x/y/w/h`) is: the wall band grows
 * from that face toward the opposite side. `'outer'` (the default when
 * drawing) means the drawn rectangle is the building's outer face and the
 * thickness extends inward.
 */
export type WallAlignment = 'outer' | 'centre' | 'inner'

/**
 * The named anchor a reference hangs off — a rect/wall corner, a circle
 * cardinal point, or a line endpoint. The names are exactly what
 * `anchorPoint` (geometry.ts) resolves, so one vocabulary serves drawing
 * anchors and reference positioning.
 */
export type AnchorCorner = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w' | 'start' | 'end'

const ANCHOR_CORNERS: readonly AnchorCorner[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w', 'start', 'end']

/**
 * A positional reference: this entity sits at the parent's `corner` anchor
 * plus (dx, dy), wherever the parent goes. One parent per entity — refs
 * never chain (see `resolveEntity`).
 */
export interface EntityRef {
  id: EntityId
  corner: AnchorCorner
  dx: number
  dy: number
}

export interface WallEntity {
  id: EntityId
  type: 'wall'
  layerId: EntityId
  x: number
  y: number
  w: number
  h: number
  /** Physical band thickness in millimetres (world units). */
  thickness: number
  alignment: WallAlignment
  /** Optional per-entity colour override; absent means "use the layer's". */
  colour?: string
  /** Optional positional reference; the ref's parent anchor wins on resolve. */
  ref?: EntityRef
}

export type Entity = LineEntity | CircleEntity | RectEntity | TextEntity | DimEntity | WallEntity

/** Omit, distributed over unions so each member keeps its own keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * An entity as handed to {@link addEntity}: `layerId` is optional and
 * defaults to the document's active layer.
 */
export type EntityDraft = DistributiveOmit<Entity, 'layerId'> & { layerId?: EntityId }

export interface DrawingDocument {
  readonly entities: readonly Entity[]
  readonly layers: readonly Layer[]
  readonly activeLayerId: EntityId
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
  return {
    entities: [],
    layers: [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false, colour: DEFAULT_COLOUR }],
    activeLayerId: DEFAULT_LAYER_ID,
  }
}

export function getEntity(doc: DrawingDocument, id: EntityId): Entity | undefined {
  return doc.entities.find(entity => entity.id === id)
}

export function addEntity(doc: DrawingDocument, entity: EntityDraft): DrawingDocument {
  // An entity naming its layer passes through untouched (same reference);
  // otherwise the active layer is the default home for a new entity.
  if (entity.layerId !== undefined) {
    return { ...doc, entities: [...doc.entities, entity as Entity] }
  }
  const complete = { ...entity, layerId: doc.activeLayerId } as Entity
  return { ...doc, entities: [...doc.entities, complete] }
}

export function updateEntity(
  doc: DrawingDocument,
  id: EntityId,
  patch: Partial<DistributiveOmit<Entity, 'id' | 'type'>>
): DrawingDocument {
  return {
    ...doc,
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
    case 'text':
      return { ...entity, x: entity.x + dx, y: entity.y + dy }
    case 'dim':
      return {
        ...entity,
        x1: entity.x1 + dx,
        y1: entity.y1 + dy,
        x2: entity.x2 + dx,
        y2: entity.y2 + dy,
      }
    case 'wall':
      return { ...entity, x: entity.x + dx, y: entity.y + dy }
  }
}

/**
 * The entity as it should be seen: when it carries a resolvable reference,
 * its position is recomputed from the parent's stored anchor plus the ref
 * delta; otherwise it is returned unchanged. Concrete coordinates stay on
 * the entity — they are the fallback when the parent is dangling (deleted),
 * so a deleted boundary leaves the building where it was, never NaN.
 *
 * Single level by design: the parent's *stored* coordinates are used, so a
 * ref pointing at a referenced entity does not chain resolutions.
 */
export function resolveEntity(doc: DrawingDocument, entity: Entity): Entity {
  const ref = 'ref' in entity ? entity.ref : undefined
  if (ref === undefined || ref.id === entity.id) return entity
  const parent = getEntity(doc, ref.id)
  if (parent === undefined) return entity
  const target = anchorPoint(parent, ref.corner)
  const current = anchorPoint(entity, ref.corner)
  if (target === null || current === null) return entity
  return translateEntity(entity, target.x + ref.dx - current.x, target.y + ref.dy - current.y)
}

/**
 * Every entity resolved against the stored document — the single pure
 * function per draw/hit-test/tool-input pass that applies references. Refs
 * never chain: each entity resolves against stored coordinates only.
 */
export function resolveDocument(doc: DrawingDocument): DrawingDocument {
  return { ...doc, entities: doc.entities.map(entity => resolveEntity(doc, entity)) }
}

export function removeEntity(doc: DrawingDocument, id: EntityId): DrawingDocument {
  return {
    ...doc,
    // Entities referencing the removed one are unlinked: their last
    // resolved position is baked into the stored coordinates, so deleting
    // a boundary freezes the things that referenced it in place.
    entities: doc.entities
      .filter(entity => entity.id !== id)
      .map(entity => {
        if (!('ref' in entity) || entity.ref?.id !== id) return entity
        return { ...resolveEntity(doc, entity), ref: undefined }
      }),
  }
}

/**
 * The next layer id, derived from the document (max numeric suffix + 1) so
 * `addLayer` is deterministic regardless of when it is called.
 */
function nextLayerIdFor(doc: DrawingDocument): EntityId {
  const max = doc.layers.reduce((n, layer) => {
    const match = /^layer-(\d+)$/.exec(layer.id)
    return match !== null ? Math.max(n, Number(match[1])) : n
  }, 0)
  return `layer-${max + 1}`
}

export function layerById(doc: DrawingDocument, id: EntityId): Layer | undefined {
  return doc.layers.find(layer => layer.id === id)
}

export function addLayer(doc: DrawingDocument, name: string): DrawingDocument {
  const layer: Layer = { id: nextLayerIdFor(doc), name, visible: true, locked: false, colour: DEFAULT_COLOUR }
  return { ...doc, layers: [...doc.layers, layer] }
}

export function updateLayer(doc: DrawingDocument, id: EntityId, patch: Partial<Omit<Layer, 'id'>>): DrawingDocument {
  return {
    ...doc,
    layers: doc.layers.map(layer => (layer.id === id ? { ...layer, ...patch } : layer)),
  }
}

/**
 * Removes a layer and reassigns its entities to the active layer — the one
 * rule for orphaned entities, so a layer removal can never drop geometry.
 * Removing the active layer makes the first remaining layer active. Removing
 * the last layer is refused: the document always has at least one layer.
 */
export function removeLayer(doc: DrawingDocument, id: EntityId): DrawingDocument {
  if (doc.layers.length <= 1 || layerById(doc, id) === undefined) return doc
  const layers = doc.layers.filter(layer => layer.id !== id)
  // Entities land on the resulting active layer: the current one, unless it
  // is the layer being removed — then the first remaining layer takes over.
  const activeLayerId = doc.activeLayerId === id ? layers[0]!.id : doc.activeLayerId
  return {
    ...doc,
    layers,
    activeLayerId,
    entities: doc.entities.map(entity => (entity.layerId === id ? { ...entity, layerId: activeLayerId } : entity)),
  }
}

export function setActiveLayer(doc: DrawingDocument, id: EntityId): DrawingDocument {
  if (layerById(doc, id) === undefined) return doc
  return { ...doc, activeLayerId: id }
}

export function entitiesOnLayer(doc: DrawingDocument, layerId: EntityId): Entity[] {
  return doc.entities.filter(entity => entity.layerId === layerId)
}

/**
 * Whether `entity` may be edited: its layer must exist and be unlocked.
 * Consumers (hit testing, tools, the canvas page) call this at the point an
 * edit would begin or commit — the model itself never blocks.
 */
export function isEditable(doc: DrawingDocument, entity: Entity): boolean {
  const layer = layerById(doc, entity.layerId)
  return layer !== undefined && !layer.locked
}

function isFiniteRecord(value: object, keys: readonly string[]): boolean {
  return keys.every(key => {
    const num = (value as Record<string, unknown>)[key]
    return typeof num === 'number' && Number.isFinite(num)
  })
}

function parseRef(value: unknown): EntityRef {
  if (typeof value !== 'object' || value === null) {
    throw new DocumentParseError('Entity "ref" must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') {
    throw new DocumentParseError('Entity "ref" must have a string "id"')
  }
  if (typeof record.corner !== 'string' || !ANCHOR_CORNERS.includes(record.corner as AnchorCorner)) {
    throw new DocumentParseError('Entity "ref" must have a valid anchor "corner"')
  }
  if (!isFiniteRecord(record, ['dx', 'dy'])) {
    throw new DocumentParseError('Entity "ref" has missing or non-finite dx/dy')
  }
  return value as EntityRef
}

function parseEntity(value: unknown): EntityDraft {
  if (typeof value !== 'object' || value === null) {
    throw new DocumentParseError('Entity must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') {
    throw new DocumentParseError('Entity must have a string "id"')
  }
  if (record.layerId !== undefined && typeof record.layerId !== 'string') {
    throw new DocumentParseError('Entity "layerId" must be a string')
  }
  if (record.colour !== undefined && typeof record.colour !== 'string') {
    throw new DocumentParseError('Entity "colour" must be a string')
  }
  if (record.ref !== undefined) parseRef(record.ref)
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
    case 'text':
      if (!isFiniteRecord(record, ['x', 'y', 'size'])) {
        throw new DocumentParseError('Text entity has missing or non-finite values')
      }
      if (typeof record.text !== 'string') {
        throw new DocumentParseError('Text entity must have a string "text"')
      }
      return value as TextEntity
    case 'dim':
      if (!isFiniteRecord(record, ['x1', 'y1', 'x2', 'y2', 'offset'])) {
        throw new DocumentParseError('Dim entity has missing or non-finite values')
      }
      return value as DimEntity
    case 'wall': {
      if (!isFiniteRecord(record, ['x', 'y', 'w', 'h', 'thickness'])) {
        throw new DocumentParseError('Wall entity has missing or non-finite values')
      }
      if (record.alignment !== 'outer' && record.alignment !== 'centre' && record.alignment !== 'inner') {
        throw new DocumentParseError('Wall entity must have an "alignment" of outer, centre, or inner')
      }
      return value as WallEntity
    }
    default:
      throw new DocumentParseError(`Unknown entity type: ${String(record.type)}`)
  }
}

function parseLayer(value: unknown): Layer {
  if (typeof value !== 'object' || value === null) {
    throw new DocumentParseError('Layer must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') {
    throw new DocumentParseError('Layer must have string "id" and "name"')
  }
  if (typeof record.visible !== 'boolean' || typeof record.locked !== 'boolean') {
    throw new DocumentParseError('Layer must have boolean "visible" and "locked"')
  }
  if (record.colour !== undefined && typeof record.colour !== 'string') {
    throw new DocumentParseError('Layer "colour" must be a string')
  }
  // Layers from before colours existed load with the default ink.
  return { colour: DEFAULT_COLOUR, ...record } as Layer
}

export function serializeDocument(doc: DrawingDocument): string {
  return JSON.stringify({ layers: doc.layers, activeLayerId: doc.activeLayerId, entities: doc.entities })
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
  const record = parsed as { entities: unknown[]; layers?: unknown[]; activeLayerId?: unknown }

  // Documents from before layers existed carry no layer table: synthesise
  // the default layer and put every entity on it — no migration script.
  const layers = Array.isArray(record.layers) && record.layers.length > 0 ? record.layers.map(parseLayer) : null
  const activeLayerId =
    layers?.some(layer => layer.id === record.activeLayerId) === true
      ? (record.activeLayerId as EntityId)
      : (layers?.[0]?.id ?? DEFAULT_LAYER_ID)
  const entities = record.entities.map(entity => {
    const draft = parseEntity(entity)
    return draft.layerId === undefined ? { ...draft, layerId: activeLayerId } : draft
  })

  return {
    entities: entities as Entity[],
    layers: layers ?? [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false, colour: DEFAULT_COLOUR }],
    activeLayerId,
  }
}

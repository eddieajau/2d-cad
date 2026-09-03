/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type {
  DrawingDocument,
  Entity,
  EntityId,
  LineEntity,
  CircleEntity,
  RectEntity,
  TextEntity,
  DimEntity,
} from './document.js'
import { dimLine, textBounds } from './geometry.js'
import { visibleWorldRect, worldToScreen, type Viewport, type WorldPoint, type WorldRect } from './viewport.js'

export interface RenderTheme {
  readonly gridMinor: string
  readonly gridMajor: string
  readonly gridAxis: string
  readonly gridLabel: string
  readonly ink: string
  readonly selection: string
}

export interface RenderOptions {
  readonly width: number
  readonly height: number
  readonly theme: RenderTheme
  /** In-progress tool geometry, drawn dashed on top of the scene. */
  readonly preview?: Entity
  /** Entity to redraw with the selection style, if present in the document. */
  readonly selectedId?: EntityId | null
}

/** Dash:gap ratio of 3:1 keeps the preview clearly distinct from committed ink. */
const PREVIEW_DASH = [9, 3]

/** Smallest on-screen grid spacing, in pixels. */
const MIN_GRID_PX = 8

/**
 * The outgoing finer grid fades over its last halving of on-screen spacing
 * (MIN_GRID_PX/2 → MIN_GRID_PX) instead of popping away at the decade step.
 */
const FADE_RANGE_PX = MIN_GRID_PX / 2

/** Screen-constant sizes for dimension furniture, in pixels. */
const DIM_OVERSHOOT_PX = 4
const DIM_ARROW_PX = 8
const DIM_LABEL_GAP_PX = 4

/**
 * Grid intervals for the current scale: the smallest power of ten whose
 * on-screen spacing is at least {@link MIN_GRID_PX}, with majors every
 * ten minors.
 */
export function gridInterval(scale: number): { minor: number; major: number } {
  const decade = Math.ceil(Math.log10(MIN_GRID_PX / scale))
  const minor = 10 ** decade
  return { minor, major: minor * 10 }
}

function formatCoord(value: number): string {
  return String(Number(value.toPrecision(12)))
}

/**
 * The measured length of a linear dimension, formatted in millimetres
 * (1 world unit = 1 mm): sub-metre lengths stay in mm, otherwise metres.
 */
export function formatLength(length: number): string {
  if (length < 1000) return `${formatCoord(length)} mm`
  return `${formatCoord(length / 1000)} m`
}

function lineBounds(e: LineEntity): WorldRect {
  return {
    minX: Math.min(e.x1, e.x2),
    minY: Math.min(e.y1, e.y2),
    maxX: Math.max(e.x1, e.x2),
    maxY: Math.max(e.y1, e.y2),
  }
}

function circleBounds(e: CircleEntity): WorldRect {
  return { minX: e.cx - e.r, minY: e.cy - e.r, maxX: e.cx + e.r, maxY: e.cy + e.r }
}

function rectBounds(e: RectEntity): WorldRect {
  return {
    minX: Math.min(e.x, e.x + e.w),
    minY: Math.min(e.y, e.y + e.h),
    maxX: Math.max(e.x, e.x + e.w),
    maxY: Math.max(e.y, e.y + e.h),
  }
}

function dimBounds(e: DimEntity): WorldRect {
  const { a, b } = dimLine(e)
  return {
    minX: Math.min(e.x1, e.x2, a.x, b.x),
    minY: Math.min(e.y1, e.y2, a.y, b.y),
    maxX: Math.max(e.x1, e.x2, a.x, b.x),
    maxY: Math.max(e.y1, e.y2, a.y, b.y),
  }
}

export function entityBounds(entity: Entity): WorldRect {
  switch (entity.type) {
    case 'line':
      return lineBounds(entity)
    case 'circle':
      return circleBounds(entity)
    case 'rect':
      return rectBounds(entity)
    case 'text':
      return textBounds(entity)
    case 'dim':
      return dimBounds(entity)
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: Entity, v: Viewport): void {
  switch (entity.type) {
    case 'line':
      drawLine(ctx, entity, v)
      break
    case 'circle':
      drawCircle(ctx, entity, v)
      break
    case 'rect':
      drawRect(ctx, entity, v)
      break
    case 'text':
      drawText(ctx, entity, v)
      break
    case 'dim':
      drawDim(ctx, entity, v)
      break
  }
}

function intersects(a: WorldRect, b: WorldRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function drawLine(ctx: CanvasRenderingContext2D, e: LineEntity, v: Viewport): void {
  const a = worldToScreen(v, e.x1, e.y1)
  const b = worldToScreen(v, e.x2, e.y2)
  ctx.beginPath()
  ctx.moveTo(a.sx, a.sy)
  ctx.lineTo(b.sx, b.sy)
  ctx.stroke()
}

export function drawCircle(ctx: CanvasRenderingContext2D, e: CircleEntity, v: Viewport): void {
  const c = worldToScreen(v, e.cx, e.cy)
  ctx.beginPath()
  ctx.arc(c.sx, c.sy, e.r * v.scale, 0, 2 * Math.PI)
  ctx.stroke()
}

export function drawRect(ctx: CanvasRenderingContext2D, e: RectEntity, v: Viewport): void {
  const origin = worldToScreen(v, e.x, e.y + e.h)
  ctx.strokeRect(origin.sx, origin.sy, e.w * v.scale, e.h * v.scale)
}

/**
 * Text drawn at its world anchor: the entity's size is in world units, so
 * the on-screen font size is `size * scale` — the text scales with zoom,
 * keeping a constant footprint in world space.
 */
export function drawText(ctx: CanvasRenderingContext2D, e: TextEntity, v: Viewport): void {
  const anchor = worldToScreen(v, e.x, e.y)
  ctx.font = `${e.size * v.scale}px sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(e.text, anchor.sx, anchor.sy)
}

/** A filled triangular arrowhead at `tip`, pointing outward along `dir`. */
function drawArrow(ctx: CanvasRenderingContext2D, tip: WorldPoint, dir: WorldPoint): void {
  const px = -dir.y
  const py = dir.x
  const baseX = tip.x - dir.x * DIM_ARROW_PX
  const baseY = tip.y - dir.y * DIM_ARROW_PX
  const halfWidth = DIM_ARROW_PX * 0.3
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(baseX + px * halfWidth, baseY + py * halfWidth)
  ctx.lineTo(baseX - px * halfWidth, baseY - py * halfWidth)
  ctx.closePath()
  ctx.fill()
}

/**
 * Linear dimension: extension lines from the measured points past the
 * dimension line, the dimension line itself with outward arrowheads, and a
 * centred length label. Furniture sizes are screen-constant (px-based) so
 * the dimension reads the same at any zoom; the label carries the measured
 * world length.
 */
export function drawDim(ctx: CanvasRenderingContext2D, e: DimEntity, v: Viewport): void {
  const { a, b } = dimLine(e)
  const da = worldToScreen(v, a.x, a.y)
  const db = worldToScreen(v, b.x, b.y)
  const p1 = worldToScreen(v, e.x1, e.y1)
  const p2 = worldToScreen(v, e.x2, e.y2)

  // Extension lines, overshooting the dimension line slightly.
  const drawExtension = (from: { sx: number; sy: number }, to: { sx: number; sy: number }): void => {
    const dx = to.sx - from.sx
    const dy = to.sy - from.sy
    const length = Math.hypot(dx, dy)
    if (length === 0) return
    ctx.beginPath()
    ctx.moveTo(from.sx, from.sy)
    ctx.lineTo(to.sx + (dx / length) * DIM_OVERSHOOT_PX, to.sy + (dy / length) * DIM_OVERSHOOT_PX)
    ctx.stroke()
  }
  drawExtension(p1, da)
  drawExtension(p2, db)

  // Dimension line with outward arrowheads at both ends.
  ctx.beginPath()
  ctx.moveTo(da.sx, da.sy)
  ctx.lineTo(db.sx, db.sy)
  ctx.stroke()
  const length = Math.hypot(db.sx - da.sx, db.sy - da.sy)
  if (length > 0) {
    const inward = { x: (db.sx - da.sx) / length, y: (db.sy - da.sy) / length }
    drawArrow(ctx, { x: da.sx, y: da.sy }, { x: -inward.x, y: -inward.y })
    drawArrow(ctx, { x: db.sx, y: db.sy }, inward)
  }

  // Length label, centred on the dimension line and nudged to its far side
  // (away from the measured geometry) along the screen-space normal.
  const mid = { sx: (da.sx + db.sx) / 2, sy: (da.sy + db.sy) / 2 }
  if (length > 0) {
    const nx = -(db.sy - da.sy) / length
    const ny = (db.sx - da.sx) / length
    // The measured line's normal (da - p1 direction) decides which side is "far".
    const away = (da.sx - p1.sx) * nx + (da.sy - p1.sy) * ny
    const sign = away >= 0 ? 1 : -1
    ctx.font = '10px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(
      formatLength(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)),
      mid.sx + nx * sign * (DIM_LABEL_GAP_PX + DIM_ARROW_PX),
      mid.sy + ny * sign * (DIM_LABEL_GAP_PX + DIM_ARROW_PX)
    )
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
}

export function renderGrid(ctx: CanvasRenderingContext2D, v: Viewport, opts: RenderOptions): void {
  const { width, height, theme } = opts
  const rect = visibleWorldRect(v, width, height)
  const { minor, major } = gridInterval(v.scale)

  const drawLineSet = (
    from: number,
    to: number,
    interval: number,
    screenPos: (world: number) => number,
    isVertical: boolean,
    /** Skip lines that coincide with the next coarser grid (already drawn). */
    skipMajor = false
  ): void => {
    const majorStep = interval * 10
    for (let k = Math.ceil(from / interval); k <= Math.floor(to / interval); k++) {
      const isMajor = k % majorStep === 0
      if (skipMajor && isMajor) continue
      const pos = screenPos(k * interval)
      ctx.strokeStyle = isMajor ? theme.gridMajor : theme.gridMinor
      ctx.beginPath()
      if (isVertical) {
        ctx.moveTo(pos, 0)
        ctx.lineTo(pos, height)
      } else {
        ctx.moveTo(0, pos)
        ctx.lineTo(width, pos)
      }
      ctx.stroke()
    }
  }

  drawLineSet(rect.minX, rect.maxX, minor, x => worldToScreen(v, x, 0).sx, true)
  drawLineSet(rect.minY, rect.maxY, minor, y => worldToScreen(v, 0, y).sy, false)

  // Zoom-adaptive fading: the outgoing finer interval (minor/10) fades in as
  // its on-screen spacing approaches MIN_GRID_PX, so stepping up a decade
  // dissolves the old grid rather than popping it away.
  const fine = minor / 10
  const fade = Math.min(1, Math.max(0, (fine * v.scale - FADE_RANGE_PX) / FADE_RANGE_PX))
  if (fade > 0) {
    ctx.globalAlpha = fade
    drawLineSet(rect.minX, rect.maxX, fine, x => worldToScreen(v, x, 0).sx, true, true)
    drawLineSet(rect.minY, rect.maxY, fine, y => worldToScreen(v, 0, y).sy, false, true)
    ctx.globalAlpha = 1
  }

  // World axes, emphasised when in view.
  const origin = worldToScreen(v, 0, 0)
  ctx.strokeStyle = theme.gridAxis
  ctx.lineWidth = 1.5
  ctx.beginPath()
  if (0 >= rect.minX && 0 <= rect.maxX) {
    ctx.moveTo(origin.sx, 0)
    ctx.lineTo(origin.sx, height)
    ctx.stroke()
  }
  if (0 >= rect.minY && 0 <= rect.maxY) {
    ctx.beginPath()
    ctx.moveTo(0, origin.sy)
    ctx.lineTo(width, origin.sy)
    ctx.stroke()
  }
  ctx.lineWidth = 1

  // Major-coordinate labels along the screen edges, always upright and legible.
  ctx.fillStyle = theme.gridLabel
  ctx.font = '10px sans-serif'
  for (let k = Math.ceil(rect.minX / major); k <= Math.floor(rect.maxX / major); k++) {
    const { sx } = worldToScreen(v, k * major, 0)
    ctx.fillText(formatCoord(k * major), sx + 2, height - 4)
  }
  for (let j = Math.ceil(rect.minY / major); j <= Math.floor(rect.maxY / major); j++) {
    const { sy } = worldToScreen(v, 0, j * major)
    ctx.fillText(formatCoord(j * major), 4, Math.max(sy - 3, 10))
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  doc: DrawingDocument,
  v: Viewport,
  opts: RenderOptions
): void {
  ctx.clearRect(0, 0, opts.width, opts.height)
  renderGrid(ctx, v, opts)

  const visible = visibleWorldRect(v, opts.width, opts.height)
  const preview = opts.preview
  // A move-drag's preview carries the selected entity's own id: the entity
  // is drawn at its dragged position with the selection style and its
  // committed geometry is skipped. A copy-drag previews a clone (different
  // id) as a dashed ghost, leaving the original highlighted in place.
  const draggingSelection = preview !== undefined && opts.selectedId != null && preview.id === opts.selectedId

  // Filled draws (text, dim labels/arrowheads) share the ink colour with strokes.
  ctx.strokeStyle = opts.theme.ink
  ctx.fillStyle = opts.theme.ink
  ctx.lineWidth = 1
  for (const entity of doc.entities) {
    if (preview !== undefined && entity.id === preview.id) continue
    if (!intersects(entityBounds(entity), visible)) continue
    drawEntity(ctx, entity, v)
  }

  const selected = opts.selectedId ? doc.entities.find(entity => entity.id === opts.selectedId) : undefined
  if (selected) {
    const highlight = draggingSelection && preview ? preview : selected
    if (intersects(entityBounds(highlight), visible)) {
      ctx.save()
      ctx.strokeStyle = opts.theme.selection
      ctx.fillStyle = opts.theme.selection
      ctx.lineWidth = 2
      drawEntity(ctx, highlight, v)
      ctx.restore()
    }
  }

  if (preview && !draggingSelection) {
    ctx.save()
    ctx.setLineDash(PREVIEW_DASH)
    drawEntity(ctx, preview, v)
    ctx.restore()
  }
}

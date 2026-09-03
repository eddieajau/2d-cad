/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DrawingDocument, Entity, LineEntity, CircleEntity, RectEntity } from './document.js'
import { visibleWorldRect, worldToScreen, type Viewport, type WorldRect } from './viewport.js'

export interface RenderTheme {
  readonly gridMinor: string
  readonly gridMajor: string
  readonly ink: string
}

export interface RenderOptions {
  readonly width: number
  readonly height: number
  readonly theme: RenderTheme
  /** In-progress tool geometry, drawn dashed on top of the scene. */
  readonly preview?: Entity
}

/** Dash:gap ratio of 3:1 keeps the preview clearly distinct from committed ink. */
const PREVIEW_DASH = [9, 3]

/** Smallest on-screen grid spacing, in pixels. */
const MIN_GRID_PX = 8

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

export function entityBounds(entity: Entity): WorldRect {
  switch (entity.type) {
    case 'line':
      return lineBounds(entity)
    case 'circle':
      return circleBounds(entity)
    case 'rect':
      return rectBounds(entity)
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

export function renderGrid(ctx: CanvasRenderingContext2D, v: Viewport, opts: RenderOptions): void {
  const { width, height, theme } = opts
  const rect = visibleWorldRect(v, width, height)
  const { minor, major } = gridInterval(v.scale)
  const majorStep = major / minor

  const drawLineSet = (from: number, to: number, screenPos: (world: number) => number, isVertical: boolean): void => {
    for (let k = Math.ceil(from / minor); k <= Math.floor(to / minor); k++) {
      const isMajor = k % majorStep === 0
      const pos = screenPos(k * minor)
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

  drawLineSet(rect.minX, rect.maxX, x => worldToScreen(v, x, 0).sx, true)
  drawLineSet(rect.minY, rect.maxY, y => worldToScreen(v, 0, y).sy, false)

  // World axes, emphasised when in view.
  const origin = worldToScreen(v, 0, 0)
  ctx.strokeStyle = theme.gridMajor
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
  ctx.fillStyle = theme.gridMajor
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
  ctx.strokeStyle = opts.theme.ink
  ctx.lineWidth = 1
  for (const entity of doc.entities) {
    if (!intersects(entityBounds(entity), visible)) continue
    drawEntity(ctx, entity, v)
  }

  if (opts.preview) {
    ctx.save()
    ctx.setLineDash(PREVIEW_DASH)
    drawEntity(ctx, opts.preview, v)
    ctx.restore()
  }
}

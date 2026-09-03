/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addEntity, createDocument, DocumentParseError, type DrawingDocument, type LineEntity } from './document.js'
import { downloadDocument, loadLocal, openDocument, saveLocal } from './persistence.js'

const line: LineEntity = { id: 'e1', type: 'line', layerId: 'layer-0', x1: 0, y1: 0, x2: 40, y2: 20 }

function makeDoc(): DrawingDocument {
  return addEntity(createDocument(), line)
}

function localDateStamp(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}${mm}${dd}`
}

beforeEach(() => {
  localStorage.clear()
})

describe('saveLocal / loadLocal', () => {
  it('round-trips a document through the versioned key', () => {
    saveLocal(makeDoc())

    expect(localStorage.getItem('2d-cad:v2')).not.toBeNull()
    expect(loadLocal()).toEqual(makeDoc())
  })

  it('returns null when nothing has been saved', () => {
    expect(loadLocal()).toBeNull()
  })

  it('ignores a pre-mm v1 autosave rather than misreading it', () => {
    localStorage.setItem('2d-cad:v1', JSON.stringify({ entities: [line] }))

    expect(loadLocal()).toBeNull()
  })

  it('rejects corrupt stored data with DocumentParseError', () => {
    localStorage.setItem('2d-cad:v2', '{not json')

    expect(() => loadLocal()).toThrow(DocumentParseError)
  })
})

describe('downloadDocument', () => {
  it('downloads drawing-YYYYMMDD.json containing the serialized document', async () => {
    const createElement = vi.spyOn(document, 'createElement')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cad')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    downloadDocument(makeDoc())

    const index = createElement.mock.calls.findIndex(([tag]) => tag === 'a')
    const anchor = createElement.mock.results[index]!.value as HTMLAnchorElement
    expect(anchor.download).toBe(`drawing-${localDateStamp()}.json`)
    expect(anchor.href).toBe('blob:cad')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cad')

    const blob = createObjectURL.mock.calls[0]![0] as Blob
    await expect(blob.text()).resolves.toBe(
      JSON.stringify({
        layers: [{ id: 'layer-0', name: 'Default', visible: true, locked: false, colour: '#1f2430' }],
        activeLayerId: 'layer-0',
        entities: [line],
      })
    )

    createElement.mockRestore()
    click.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })
})

describe('openDocument', () => {
  it('parses a saved file back into a document', async () => {
    const file = new File([JSON.stringify({ entities: [line] })], 'drawing.json', { type: 'application/json' })

    await expect(openDocument(file)).resolves.toEqual(makeDoc())
  })

  it('loads a pre-layer file onto a synthesised default layer', async () => {
    const legacy = JSON.stringify({ entities: [{ id: 'e1', type: 'line', x1: 0, y1: 0, x2: 40, y2: 20 }] })
    const file = new File([legacy], 'drawing.json', { type: 'application/json' })

    await expect(openDocument(file)).resolves.toEqual(makeDoc())
  })

  it('rejects malformed files with DocumentParseError', async () => {
    const file = new File(['{oops'], 'drawing.json', { type: 'application/json' })

    await expect(openDocument(file)).rejects.toBeInstanceOf(DocumentParseError)
  })
})

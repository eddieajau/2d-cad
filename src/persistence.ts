/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import { deserializeDocument, serializeDocument, type DrawingDocument } from './document.js'

/** Versioned key: bump to invalidate older stored shapes. */
const STORAGE_KEY = '2d-cad:v1'

/** Persist the document to localStorage under the versioned key. */
export function saveLocal(doc: DrawingDocument): void {
  localStorage.setItem(STORAGE_KEY, serializeDocument(doc))
}

/**
 * Load the document from localStorage; null when nothing is stored.
 * Throws `DocumentParseError` for corrupt stored data.
 */
export function loadLocal(): DrawingDocument | null {
  const json = localStorage.getItem(STORAGE_KEY)
  if (json === null) return null
  return deserializeDocument(json)
}

/** Today's date as YYYYMMDD (local time) for download filenames. */
function dateStamp(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}${mm}${dd}`
}

/** Download the document as `drawing-YYYYMMDD.json` via a Blob + anchor. */
export function downloadDocument(doc: DrawingDocument): void {
  const blob = new Blob([serializeDocument(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `drawing-${dateStamp()}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Parse a user-chosen file into a document. Malformed input rejects with
 * `DocumentParseError` — never a half-loaded document.
 */
export async function openDocument(file: File): Promise<DrawingDocument> {
  return deserializeDocument(await file.text())
}

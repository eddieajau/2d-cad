/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { DrawingDocument } from './document.js'

/**
 * Snapshot history over immutable documents. Because documents are frozen
 * value graphs, a snapshot is just a reference: history costs O(edits), not
 * O(edits × entities), and committed documents can never be mutated — edits
 * cannot rewrite history by construction.
 */
export interface History {
  readonly stack: readonly DrawingDocument[]
  readonly index: number
}

export function createHistory(doc: DrawingDocument): History {
  return { stack: [doc], index: 0 }
}

/** Appends `next` after the current entry, truncating any redo tail. */
export function commit(history: History, next: DrawingDocument): History {
  return { stack: [...history.stack.slice(0, history.index + 1), next], index: history.index + 1 }
}

export function undo(history: History): History {
  return history.index === 0 ? history : { ...history, index: history.index - 1 }
}

export function redo(history: History): History {
  return history.index === history.stack.length - 1 ? history : { ...history, index: history.index + 1 }
}

export function current(history: History): DrawingDocument {
  return history.stack[history.index]
}

export function canUndo(history: History): boolean {
  return history.index > 0
}

export function canRedo(history: History): boolean {
  return history.index < history.stack.length - 1
}

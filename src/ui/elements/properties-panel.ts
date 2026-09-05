/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

import type { Entity, EntityId } from '../../document.js'
import { escapeHtml } from '../lib/escape.js'
import './entity-colour.js'

export interface PropertiesPanelChange {
  id: EntityId
  /** Field keys validated against the panel's per-type spec, values typed. */
  patch: Record<string, number | string>
}

export interface PropertiesPanelEventMap {
  'properties-panel:change': CustomEvent<PropertiesPanelChange>
}

type FieldKind = 'number' | 'text' | 'select'

interface FieldSpec {
  readonly key: string
  readonly label: string
  readonly kind: FieldKind
  readonly step?: number
  readonly min?: number
  readonly options?: readonly string[]
}

const numField = (key: string, step = 1, min?: number): FieldSpec => ({
  key,
  label: `${key} mm`,
  kind: 'number',
  step,
  ...(min !== undefined ? { min } : {}),
})

/** The editable fields of each entity type; world units are millimetres. */
const FIELDS: Record<Entity['type'], readonly FieldSpec[]> = {
  line: [numField('x1'), numField('y1'), numField('x2'), numField('y2')],
  rect: [numField('x'), numField('y'), numField('w'), numField('h')],
  circle: [numField('cx'), numField('cy'), numField('r', 1, 0)],
  wall: [
    numField('x'),
    numField('y'),
    numField('w'),
    numField('h'),
    numField('thickness', 10, 0),
    { key: 'alignment', label: 'alignment', kind: 'select', options: ['outer', 'centre', 'inner'] },
  ],
  text: [{ key: 'text', label: 'content', kind: 'text' }, numField('x'), numField('y'), numField('size')],
  dim: [numField('x1'), numField('y1'), numField('x2'), numField('y2'), numField('offset')],
}

/**
 * The position fields a reference takes over: when an entity carries a ref,
 * these become the ref's dx/dy ("from anchor") and the stored coordinates
 * are no longer editable here.
 */
const POSITION_KEYS: Partial<Record<Entity['type'], readonly string[]>> = {
  line: ['x1', 'y1', 'x2', 'y2'],
  circle: ['cx', 'cy'],
  rect: ['x', 'y'],
  wall: ['x', 'y'],
}

const REF_FIELDS: readonly FieldSpec[] = [
  { key: 'dx', label: 'dx (from anchor) mm', kind: 'number', step: 1 },
  { key: 'dy', label: 'dy (from anchor) mm', kind: 'number', step: 1 },
]

function fieldsFor(entity: Entity): readonly FieldSpec[] {
  const hasRef = 'ref' in entity && entity.ref !== undefined
  const positionKeys = POSITION_KEYS[entity.type]
  if (!hasRef || positionKeys === undefined) return FIELDS[entity.type]
  return [...REF_FIELDS, ...FIELDS[entity.type].filter(field => !positionKeys.includes(field.key))]
}

/** The current value of a field on the entity, serialised for the input. */
function fieldValue(entity: Entity, spec: FieldSpec): string {
  if (spec.key === 'dx' || spec.key === 'dy') {
    const ref = 'ref' in entity ? entity.ref : undefined
    return ref === undefined ? '' : String(ref[spec.key])
  }
  // Spec keys come from the per-type table above, so the read is safe.
  const value = (entity as unknown as Record<string, unknown>)[spec.key]
  return typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''
}

/** A field-level rejection message, or null when the value is acceptable. */
function validate(entity: Entity, key: string, value: number): string | null {
  if (key === 'r' && value < 0) return 'Radius cannot be negative'
  if (entity.type === 'wall' && (key === 'w' || key === 'h') && value <= 0) return 'Wall size cannot be zero'
  if (key === 'thickness' && value < 0) return 'Thickness cannot be negative'
  return null
}

/**
 * Hand-editing for the single selected entity: the selected type's fields as
 * labelled inputs, committed on Enter or blur (Escape reverts), every edit
 * emitted as `properties-panel:change` for the mediator to map onto
 * `updateEntity`. Invalid values are rejected with a field-level message and
 * no event. Linked entities edit the ref's dx/dy instead of stored
 * coordinates — the link owns position (full link editing is ticket 024).
 * The colour section composes `<entity-colour>` for the same selection.
 */
export class PropertiesPanel extends HTMLElement {
  #entity: Entity | null = null
  #abort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  /** The mediator's single push point: the resolved selected entity or null. */
  setEntity(entity: Entity | null): void {
    this.#entity = entity
    if (this.isConnected) this.render()
  }

  render(): void {
    this.setAttribute('role', 'group')
    this.setAttribute('aria-label', 'Selected entity properties')
    if (this.#entity === null) {
      // The colour section stays available (disabled inside) even with no
      // selection, so the panel's sections never jump in and out of place.
      this.innerHTML = '<p class="prop-empty">Nothing selected</p><entity-colour></entity-colour>'
      return
    }
    const rows = fieldsFor(this.#entity)
      .map(spec => this.#rowHtml(this.#entity!, spec))
      .join('')
    this.innerHTML = `
      <div class="prop-rows">${rows}</div>
      <entity-colour></entity-colour>
    `
  }

  #rowHtml(entity: Entity, spec: FieldSpec): string {
    const value = escapeHtml(fieldValue(entity, spec))
    if (spec.kind === 'select') {
      const options = (spec.options ?? [])
        .map(option => `<option value="${option}"${option === value ? ' selected' : ''}>${option}</option>`)
        .join('')
      return `
        <label class="prop-field">
          <span class="prop-label">${spec.label}</span>
          <select class="prop-input" data-key="${spec.key}" data-value="${value}">${options}</select>
        </label>
      `
    }
    const step = spec.step !== undefined ? ` step="${spec.step}"` : ''
    const min = spec.min !== undefined ? ` min="${spec.min}"` : ''
    return `
      <label class="prop-field">
        <span class="prop-label">${spec.label}</span>
        <input class="prop-input" data-key="${spec.key}" type="${spec.kind}"${step}${min} value="${value}"
          data-value="${value}" />
        <span class="prop-error" role="alert" hidden></span>
      </label>
    `
  }

  setupEventListeners(): void {
    this.cleanup()
    this.#abort = new AbortController()
    const opts = { signal: this.#abort.signal }

    this.addEventListener('keydown', this.#onKeydown, opts)
    // Blur commits (focusout bubbles; blur does not), except for selects,
    // whose `change` already carries the commit.
    this.addEventListener('focusout', this.#onFocusout, opts)
    this.addEventListener('change', this.#onChange, opts)
  }

  cleanup(): void {
    this.#abort?.abort()
    this.#abort = null
  }

  #onKeydown = (event: KeyboardEvent): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#commit(input)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.#revert(input)
    }
  }

  #onFocusout = (event: FocusEvent): void => {
    const input = event.target
    if (input instanceof HTMLInputElement) this.#commit(input)
  }

  #onChange = (event: Event): void => {
    const select = event.target
    if (select instanceof HTMLSelectElement) this.#commit(select)
  }

  /** Restore the committed value and clear any error message. */
  #revert(input: HTMLInputElement): void {
    input.value = input.dataset.value ?? ''
    this.#clearError(input)
  }

  #commit(input: HTMLInputElement | HTMLSelectElement): void {
    const entity = this.#entity
    if (entity === null) return
    const key = input.dataset.key ?? ''
    const baseline = input.dataset.value ?? ''

    if (input instanceof HTMLSelectElement) {
      if (input.value === baseline) return
      input.dataset.value = input.value
      this.#emit({ [key]: input.value })
      return
    }

    if (input.type === 'text') {
      const value = input.value
      if (value === baseline) return
      input.dataset.value = value
      this.#emit({ [key]: value })
      return
    }

    const raw = input.value.trim()
    // An emptied field means "no entry", not a value: restore the current one.
    if (raw === '') {
      input.value = baseline
      this.#clearError(input)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      this.#fail(input, 'Enter a number')
      return
    }
    const error = validate(entity, key, parsed)
    if (error !== null) {
      this.#fail(input, error)
      return
    }
    // An unchanged value commits nothing — blur after Enter is not an edit.
    if (String(parsed) === baseline) {
      input.value = String(parsed)
      this.#clearError(input)
      return
    }
    // Canonicalise the field, re-arm the change baseline, then emit.
    input.value = String(parsed)
    input.dataset.value = String(parsed)
    this.#clearError(input)
    this.#emit({ [key]: parsed })
  }

  #fail(input: HTMLInputElement, message: string): void {
    const error = input.closest('label.prop-field')?.querySelector<HTMLElement>('.prop-error')
    if (error === null || error === undefined) return
    error.textContent = message
    error.hidden = false
  }

  #clearError(input: HTMLInputElement): void {
    const error = input.closest('label.prop-field')?.querySelector<HTMLElement>('.prop-error')
    if (error !== null && error !== undefined) error.hidden = true
  }

  #emit(patch: Record<string, number | string>): void {
    const entity = this.#entity
    if (entity === null) return
    this.dispatchEvent(
      new CustomEvent<PropertiesPanelChange>('properties-panel:change', {
        bubbles: true,
        composed: true,
        detail: { id: entity.id, patch },
      })
    )
  }
}

customElements.define('properties-panel', PropertiesPanel)

declare global {
  interface HTMLElementTagNameMap {
    'properties-panel': PropertiesPanel
  }
}

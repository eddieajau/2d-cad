---
name: custom-elements
description: Use when building Custom HTML Elements for the 2D CAD UI.
---

# Custom HTML Elements — Engineering Standard

All UI uses native Custom Elements. No framework.

Setting up elements in a project for the first time? Read [setup.md](./setup.md) — the one-time scaffold recipe. This document is the standing standard.

## Element Structure

```typescript
export interface UserProfileEventMap {
  'user-profile:save': CustomEvent<{ id: number; name: string }>
}

type UserProfileAttribute = 'user-id' | 'disabled'

export class UserProfile extends HTMLElement {
  static observedAttributes: UserProfileAttribute[] = ['user-id', 'disabled']

  #userId = ''
  #disabled = false
  #abort: AbortController | null = null

  connectedCallback(): void {
    this.render()
    this.setupEventListeners()
    this.syncDisplay()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: UserProfileAttribute, _old: string | null, value: string | null): void {
    if (name === 'user-id') this.#userId = value ?? ''
    if (name === 'disabled') this.#disabled = value !== null
    if (this.isConnected) this.syncDisplay()
  }

  setupEventListeners(): void {
    // AbortController + delegation, see Cleanup.
  }

  cleanup(): void {
    // Abort, clear timers.
  }
}

customElements.define('user-profile', UserProfile)

declare global {
  interface HTMLElementTagNameMap {
    'user-profile': UserProfile
  }
}
```

## Rules

### 1. One Element, One Job

An element does one thing. A file uploader uploads files. A date picker picks dates. If an element needs a second paragraph to explain what it does, split it.

### 2. Attributes Are the External API

- Attributes carry data in; CustomEvents carry data out.
- Private fields (`#field`) hold internal state, synced in `attributeChangedCallback`.
- Boolean attributes: present means true; absent means false.
- Many attributes? Drive parsing from a declarative spec table — one row maps an attribute to a parser (`str`, `num`, `bool`).

### 3. Communication Direction

| Direction      | Mechanism                                                                       |
| -------------- | ------------------------------------------------------------------------------- |
| Child → Parent | `this.dispatchEvent(new CustomEvent(...))` with `bubbles: true, composed: true` |
| Parent → Child | Public methods called through the containing page element                       |
| Any ↔ Mediator | Typed `on()` / `emit()` from `ui/bus.ts`                                        |

Never import another element's class to call methods on it. Query the DOM.
Never re-dispatch another element's event under a new name. Bubbles travel;
one event keeps one name end to end.

### 4. Event Contracts

- Namespace every event: `element-name:action` (e.g. `user-profile:save`).
- Declare an `EventMap` interface per dispatching element. These maps are the single source of truth: `UIEvents` in `ui/bus.ts` derives every payload from them, so a changed detail type fails typecheck at every listener.

### 5. Lifecycle Discipline

**connectedCallback**, in order:

1. `this.render()` — the DOM must exist before listeners attach
2. `this.setupEventListeners()`
3. Sync display with current state

`connectedCallback` can run more than once. Make setup idempotent.

**disconnectedCallback** is mandatory when any of these apply: listeners outside `this`, timers or animation frames running, an `AbortController` alive.

**attributeChangedCallback** fires before `connectedCallback`. Guard every query; nodes may not exist yet.

### 6. Cleanup

Prefer one `AbortController` per listener group. Create one only when it will hold listeners — a controller nobody registered with is dead weight.

```typescript
setupEventListeners(): void {
  this.cleanup()
  this.#abort = new AbortController()
  const opts = { signal: this.#abort.signal }
  this.addEventListener('click', this.#onClick, opts)
}

cleanup(): void {
  this.#abort?.abort()
  this.#abort = null
}
```

### 7. Rendering

Build DOM with `innerHTML` template literals inside `render()`. Templates read better than `createElement` chains. Escape every interpolated value with `escapeHtml` from `ui/escape.ts` — no exceptions for "trusted" data. Reach for programmatic construction only when the element demands it: canvas contexts, node preservation, per-frame updates. After a re-render, re-attach internal listeners or rely on delegation on `this`.

### 8. No Shadow DOM

Use Light DOM unless you document a specific need for style isolation.

### 9. No Inheritance Between Elements

Extend `HTMLElement` only. Compose: put child elements inside parent markup.

### 10. No Global State

Never store application state on `window`. Dependencies arrive via attributes, properties, or method calls from a mediator.

### 11. Typing

- Augment `HTMLElementTagNameMap` for every element — no exceptions.
- Type attribute unions and `EventMap`s.
- Never cast a queried element with `as any`. Missing type? Fix the map.

### 12. File Convention

One element per file, named after the tag: `user-profile.ts` defines `<user-profile>`. Registration and `HTMLElementTagNameMap` augmentation sit at the bottom of the same file.

Layout under `src/ui/`:

- `elements/` — shared controls used across pages (`app-shell`, and later things like `tool-palette`, `status-bar`).
- `lib/` — shared non-element helpers (`escape.ts`).
- `pages/<page>/` — page-scoped elements; `index.ts` is the container and its peers sit beside it (e.g. `pages/canvas/index.ts` composing the drawing surface and its panels).
- Move a page-scoped element into `elements/` only when a second page needs it.

## Mediators

Elements never fetch, never touch persistence, never know the data layer exists. A mediator bridges them:

1. Element dispatches its namespaced CustomEvent.
2. Mediator subscribes with `on('element-name:action', handler)` from `ui/bus.ts` — payload fully typed. In a handler, take the page from `event.target`; re-query the document only outside event flow.
3. Mediator calls the backend (or model layer), then pushes results down through the owning page element's public methods — never past the page into a grandchild. One writer per component.

Each mediator is a factory returning a `Mediator` (`{ dispose() }`). It holds its state in closure scope — no module-level mutable state anywhere.

```
Element ──(CustomEvent)──▶ on() ──▶ Mediator ──▶ fetch() ──▶ page.setState()
                              ▲                                   │
                              └────────── emit() ◀────────────────┘
```

`bootstrapApp()` in `ui/bootstrap.ts` is the only place mediators are created. It owns the instance list and returns one disposer. Tests construct and dispose mediators directly — no reset helpers.

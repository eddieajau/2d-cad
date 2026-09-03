# Setting Up Custom Elements in a New Project

One-time scaffold recipe. The standards live in [SKILL.md](./SKILL.md); this file covers only what a fresh project needs before its first element.

## Toolchain

- **One tsconfig.** `moduleResolution: "Bundler"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `strict`, `noEmit`, includes `src/` and `scripts/`. Typecheck:

  ```
  tsc -p tsconfig.json --noEmit
  ```

- **Tests:** vitest with `environment: 'happy-dom'`. An element test imports the element module, appends the element to `document.body`, and asserts on DOM and dispatched events.
- **Bundle:** esbuild from one entry, ESM out:

  ```
  esbuild src/main.ts --bundle --format=esm --outfile=www/js/main.js --tsconfig=tsconfig.json
  ```

- **Dev:** run the static server (`node scripts/dev-server.mjs` on `http://localhost:5173`, serving `www/`) and `esbuild --watch` side by side via `concurrently` (`npm run dev`).

## Skeleton

```
src/ui/
  elements/     # shared controls
  lib/          # non-element helpers
  pages/        # page folders; index.ts is each page's container element
  bus.ts        # typed on()/emit(), UIEvents map, Mediator interface
  bootstrap.ts  # creates every mediator; returns one disposer
src/main.ts     # imports the app shell, calls bootstrapApp()
```

Start `lib/` with `escape.ts`.

## First element

1. `<name>.ts` beside its page, or in `elements/`. Write the `EventMap` interface first.
2. Class extends `HTMLElement`; attribute union for `observedAttributes`; `HTMLElementTagNameMap` augmentation at the bottom of the file.
3. `render()` → `setupEventListeners()` → sync state (SKILL.md §5).
4. Co-located test: connect, dispatch, assert.

## First mediator

1. `create<Name>Mediator(): Mediator` factory; all state in closure scope.
2. Subscribe with `on()`; every subscription gets an unsubscribe stored and called in `dispose()`.
3. Register the factory in `bootstrapApp()`.
4. In an event handler, take the page from `event.target` rather than re-querying the document: happy-dom caches a prior failed `querySelector` result, so a re-check can keep returning null inside tests.

## Known environment quirk

happy-dom is a test substitute, not a browser. Where its behaviour differs from real DOM (caching, event retargeting), write the code so the browser path stays correct and the test asserts through the same public surface — never add test-only branches to element code.

---
name: mint
description: Use when asked to "mint" tickets from the user of the "plan" skill, or when we have discussed a plan for a new slice of work.
---

# Minting Plan Tickets

Plans live in `.local/plan/`:

- `README.md` — a `Ticket order` checklist (one `- [ ]` / `- [x]` line per
  ticket), plus `Pattern for each workspace` and `Verification` sections.
  The `plan` skill owns this file's day-to-day maintenance.
- One numbered ticket file per ticket: `.local/plan/NN-kebab-name.md`.

## When to trigger

When the user asks to decompose a feature, "mint tickets", or "update the
plan". The output is ticket files + a README refresh — not code.

## Workflow

1. **Read the plan first.** `README.md` (current numbering, completed set,
   open axes) and the highest-numbered ticket files for the house format.
2. **Ground every ticket in real code.** Read the modules the tickets touch
   and reference actual symbols: real function names, real element names
   (`app-shell`, `tool-palette`), real config (happy-dom vitest, esbuild
   bundling from `src/main.ts`). Never invent identifiers.
3. **Slice by architectural axis, never theme** (per `CLAUDE.md`): one axis
   per ticket — e.g. data access, wire/API, UI elements, UI composition,
   URL state, test infra, repo layout. If a feature crosses two axes, split
   even when the theme is tight. For UI steps, one single-responsibility
   custom element per file, composed upward.
4. **Ask before writing** when scope, UI paradigm, or ordering has real
   trade-offs. Decompositions are cheaper to adjust than implemented code.
5. **Mint the files.** Continue numbering from the highest existing ticket
   (e.g. `16` → `17-...`). One file per ticket, template below.
6. **Append README rows.** Add one unchecked `- [ ]` line per new ticket to
   the `Ticket order` list (number + short summary). Never check boxes or
   renumber — that's the `plan` skill's job. Refresh `Overview` /
   `Verification` if the project's scope changed.
7. **Verification section.** Every UI-introducing ticket carries WCAG checks
   (4.5:1 text, 3:1 components/borders, keyboard focus); the final ticket in
   a feature ends with a manual browser checklist the human runs before
   folding history.

## Ticket file template

```markdown
# Ticket N: Short name — subtitle

**Axis**: <one axis only>.

**Goal**: <why this ticket exists, in 1–2 sentences>.

## <section>

Detail. Use real file paths (`src/...`), real function and
element names, and the exact test/seed fixture identifiers.

## Tests

- What gets tested and how (co-located test files, harness, environment)

## Acceptance criteria

1. Checkable, usually ending with `npm run verify` passes

## Out of scope

- What this ticket deliberately does not do (and which ticket does it)
```

## House rules

- Record dependencies in ticket files (`Goal` / `Out of scope`
  cross-references), not in the README — the checklist stays simple.
- State data-shape decisions explicitly (flat geometry arrays, not nested
  trees — "tree shape is a UI concern").
- Flag anything deliberately deferred so a follow-up is easy to find.
- Don't implement. Minting ends with the ticket files and README rows.

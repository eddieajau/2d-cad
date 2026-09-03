---
name: plan
description: Use when the user says "create a plan", "check off tickets", "prune done steps", "tick" or asks what is done/remaining.
---

# Maintaining the Plan README

`.local/plan/README.md` is the living index for the ticket set. The
source of truth for any single ticket's detail is its own file
(`.local/plan/NNN-name.md`, minted by the `mint` skill); the README is the
at-a-glance status list and must stay simple.

## Scope

This skill plans and tracks; it does not implement.

- Plan output is plan documents and `.local/plan/README.md` edits only.
- Never write or edit application code, route handlers, tests, or ticket
  files from this skill.
- If handed a ticket (or a piece of planned work), treat it as material to
  plan — not as an instruction to execute.

## When handed a ticket

When a message contains a plan ticket (the `mint` shape: Goal, Context,
constraints, Out of scope) rather than a README-maintenance request:

1. Treat it as planning material. Restate the plan of record, surface open
   decisions, and note how it maps to the Ticket order list.
2. Stop there. Do not implement the ticket's code, run its verification
   steps, or fold history. Implementation is a separate step with a
   separate skill.
3. If the work is not yet a numbered ticket, say so and offer to mint it.

## The Ticket order section

A single numbered checklist — one line per ticket, `- [ ]` when pending,
`- [x]` when done. Never split it into "Completed" and "Remaining" tables.

```markdown
## Next - in order

- [x] 001. App shell scaffold (`app-shell` custom element + esbuild pipeline)
- [x] 002. Document model module `document.ts` + co-located tests
- [ ] 003. Canvas page element with pointer-to-world mapping
- [ ] 004. Line tool + entity rendering
```

Rules:

- One line per ticket: `- [ ] N. <short summary>`. Keep summaries short;
  detail lives in the ticket file.
- Numbering is sequential and never reused. Minted tickets may start a gap
  (e.g. 11–16 exist, nothing else pending); that's fine — no renumbering.
- Dependencies are **not** listed in the README. They live in the ticket
  files (`Out of scope` / Goal cross-references) to keep the list simple.
- Keep the list in ticket-number order.

## Ownership

- `mint` skill creates ticket files and appends their README rows; it never
  checks boxes.
- `plan` skill maintains the README: checkbox state if asked, tidy ordering, and the
  Overview / Verification / Pattern sections.
- When a ticket is completed, update the README in the same change as (or
  immediately after) folding the history, so the plan never lies.

## House rules

- Don't edit ticket files from here; that is `mint`'s job.
- Don't restate acceptance criteria in the README; the ticket file owns them.
- Keep the diff small: a completed ticket is one character change
  (`[ ]` → `[x]`).

# AGENTS.md

I'm Andrew. You are my agent. We will be working together a lot, so I want to introduce myself.

I love to build. I focus on building complex things as simple as possible. I love to find ways to reduce complexity when solving problems. Tomorrow should be better than yesterday.

I'm sharing some of my preferences so we can be more aligned as we work together.

## Overview

2D CAD is a local-first, lightweight application for basic 2D drafting — lines, arcs, shapes, and dimensions, the way we did it on the board.

## General Coding Preferences

- One step at a time — implement when asked, then stop for review.
- Never commit unless explicitly asked.
- Keep things simple. Channel "yagni" energy unless told otherwise.
- Typesafety is useful, take advantage of it. `any` is the enemy.
- Propose bold ideas if they can meaningfully benefit our work.
- If anything is ambiguous or has meaningful trade-offs, ask first.
- Be careful with destructive actions that are not explicity requested by me.
- Tests are good! But they should be focused, not slop.
- Comments help clarify functionality for our future selves, and to record critical decisions as durable memory.
- Keep comments up to date as code shifts.

## Typescript Coding Preferences

- Write Typescript in ways that Matt Pocock would be proud of.
- Use ESM throughout (`"type": "module"` in package.json).
- Frontend should use native Custom Elements only.
- **Never** edit `package.json` directly. Always use `npm` commands.

## Questions are Read-Only

- A question is a request for an answer, not for changes. A message that opens with "how hard would it be", "what are your thoughts", "is it possible", etc asks rather than instructs: join me in solving the problem, and do not edit files.
- If the answer is obvious and the change is trivial, still answer first, offering the change you propose before making edits.

## Code health

- Before every commit, run `npm run verify` at the project root. Review the
  staged diff against the acceptance criteria if available, falling back to the original prompt.
- Smell the code before you commit so they never accumulate into god-files needing a special clean-up pass.

---
name: next
description: Use when the user types `/next` or says "do the next ticket".
---

# Next Ticket

1. Read `.local/plan/README.md` and find the ticket to implement:
   - If the user named a number, use that ticket.
   - Otherwise, take the first unchecked (`- [ ]`) ticket in the `Ticket order` list.
2. Read the matching `.local/plan/NN-name.md` file.
3. Implement it:
   - Load any skills the ticket's axis calls for (e.g. `custom-elements`, `fastify-autoload`, `fastify-test`).
   - Follow the ticket's Tests and Acceptance criteria exactly.
   - Run `npm run verify` at the project root before stopping.
4. Stop for review. Do not commit, and do not tick the README checkbox,
   unless the user asks.

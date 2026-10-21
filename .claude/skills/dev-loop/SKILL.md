---
name: dev-loop
description: Take one backlog task from plan to reviewed, tested code through the role agents. Use when the user says "run the loop", "next task", "implement <task>", "start the dev loop", or asks to deliver a backlog item. Drives orchestrator → approval → backend → frontend → five parallel reviewers → QA → commit gate, with bounded fix rounds. Requires frontend/ and backend/ to exist (otherwise use bootstrap-project).
---

# Dev loop

The interactive session is the driver. It dispatches each role agent with the `Agent`
tool, reads the stage report the agent wrote, and decides what happens next. No agent
dispatches another agent; no agent runs the approval or the commit gate; no agent
commits, stashes or checks out (the hooks refuse it).

Every stage report lives under `.orchestrate/` and starts with the same header, so the
driver reads one line to branch:

```
Stage: <backend | frontend | review:<perspective> | qa>
Task: <slug>
Verdict: <pass | fail>
```

Nothing is committed until the end, so every stage reads the change as
`git diff main` (working tree against main). Before the review stage the driver runs
`git add --intent-to-add .` so new files appear in that diff too.

## 0. Preconditions

- `frontend/` and `backend/` exist; otherwise run `bootstrap-project` first.
- The working tree is clean and the branch is not `main`.
- `.doc/product-definition.md` has no `FILL` marker in Scope, Users, Auth or Acceptance
  Criteria. If it does, stop and ask the user to finish the bootstrap.

## 1. Pick the task and branch

Take the first unchecked line in `.plan/000-backlog.md` unless the user names one. Parse
its markers: `stack:frontend` (no backend stage), `stack:backend` (no frontend stage), `figma:<url>` (design reference). Read
the `tracker:` header. Derive the slug from the title and create `feat/<slug>` (or
`fix/`, `chore/`) from the current branch.

## 2. Plan (orchestrator, Opus)

Dispatch `orchestrator` with: the task line, the slug, the branch name, the paths of the
existing plans, and this instruction:

> Write the implementation plan for this task per the `writing-plans` skill and its
> template. Status: draft. Include the Contract section when the task touches the API.
> Print the plan path on the last line.

Then stop and ask the user to review the plan file. The user approves by editing
`Status: draft` to `Status: active` (and answering the Open Questions in the file). Do not
continue while the plan says `draft`; do not edit the status yourself.

If `tracker: linear` and the Linear tool is available in this session, dispatch the
orchestrator once more to create one ticket per stage the plan lists (Todo, medium
priority, plan path in the description) and write the ids to
`.orchestrate/ticket/<slug>.md`. If the tool is absent, write the same file with
`tracker: none (Linear tool unavailable)` and say so to the user. Never block on a tracker.

## 3. Implement

Stages come from the plan's `Stages:` line. Run them in this order, one agent per stage,
each on Sonnet:

**backend** (when listed). Dispatch `backend` with the plan path and the ticket id. The
agent implements the Contract section, regenerates `openapi.json`, runs `bun run check`
(and `bun run test:db` when it added database-backed tests), and writes
`.orchestrate/report/backend.md`. On `Verdict: fail`, read the report's Blockers and
either fix the plan with the user or re-dispatch once with the blocker quoted.

**frontend** (when listed). Dispatch `frontend` with the plan path, the ticket id and the
figma URL if any. The agent runs `bun run api:types` first when the backend stage ran,
implements, runs `bun run check` and `bun run test:e2e`, and writes
`.orchestrate/report/frontend.md`.

## 4. Review (five reviewers in parallel, Opus)

Run `git add --intent-to-add .` so untracked files are part of `git diff main`. Then
dispatch five `reviewer` agents in one message, each with the plan path and one
perspective:

| Perspective | Checklist focus |
| --- | --- |
| `security` | Injection, auth and tenancy boundaries, secrets, data exposure, dependency risk |
| `architecture` | Layering and import direction, naming, duplication, scalability of the shape |
| `error-handling` | Envelope, status codes, validation at the edge, logging, failure UX |
| `simplicity` | Unnecessary abstraction, dead code, over-configuration, readability |
| `operations` | Migrations, env variables, Docker, observability, rollback |

Each writes `.orchestrate/review/<perspective>.md` with P0/P1/P2 findings per the
`code-review` skill. Collect every P0 and P1 across the five reports.

**Fix round** (at most two). If any P0 or P1 exists, dispatch the owning implementer
(`backend` or `frontend`, by file) with the findings quoted verbatim and the instruction to
fix them and re-run `bun run check`. Then re-run only the reviewers whose perspective
raised a finding. After the second round, stop and hand the remaining findings to the
user.

## 5. QA (Sonnet)

Dispatch `qa` with the plan path. The agent runs every gate and the e2e suite, adds at
least one adversarial test, checks each acceptance criterion with evidence, and writes
`.orchestrate/report/qa.md`. On `Verdict: fail`, run one fix round with the owning
implementer, then re-dispatch `qa` once. A second failure goes to the user.

## 6. Finish

- Set the plan to `Status: done` and move the backlog line under `## DONE` with the date.
- Apply the `Docs:` lines from the backend and frontend reports to
  `.doc/architecture.md` (change log) and `.doc/glossary.md`.
- Summarise: what shipped, the test counts from the QA report, open P2 findings, and the
  branch name. Ask the user whether to commit. Never commit or merge without that answer.

## Dispatch rules

- One agent per stage, named exactly `orchestrator`, `backend`, `frontend`, `reviewer`,
  `qa`; the hooks key write lanes on those names.
- Pass paths, not file contents. The agent reads `AGENTS.md`, `backend/AGENTS.md` and the
  plan itself.
- Never dispatch an implementer against a `draft` plan.
- Never run the fix loop more than twice per stage; a third failure is a design problem
  for the user.

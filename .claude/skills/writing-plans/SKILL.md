---
name: writing-plans
description: Create, revise, or supersede an implementation plan in .plan/. Use whenever the user asks for a plan, an approach, or a design doc for a task, when revising an existing plan after feedback, or when the dev loop asks the orchestrator for a plan. Defines the .plan/ lifecycle, the NNN-YYYY-MM-DD-topic.md filename, required metadata, the Stages and Contract sections, and the nine required sections.
---

# Writing Plans

`.plan/` at the repository root is the source of truth for plans. `000-backlog.md` is
the task queue; every other file is a plan. Copy `template.md` from this directory and
fill it; do not invent a different shape.

## Before writing anything

1. Read every existing `.plan/*.md`. A new plan builds on decisions already made.
2. Read `.doc/product-definition.md` (acceptance criteria, scope, auth and tenancy),
   `.doc/architecture.md` (data store, data model, API) and `.doc/glossary.md` (names).
3. If any section you depend on still holds a `<!-- FILL: … -->` marker, do not plan.
   Write a one-line plan file whose only content is `Status: blocked` plus the marker
   you need answered, and say so.

## Filename

`NNN-YYYY-MM-DD-<topic>.md` with a sequential numeric prefix: `001`, `002`, `003`.
Example: `.plan/003-2026-08-03-comment-thread.md`.

## Required metadata

```
Status: draft | active | done | superseded | blocked
Owner:
Last updated: YYYY-MM-DD
Branch: feat/<slug>
Stages: backend, frontend, qa   (omit backend for a stack:frontend task, frontend for a stack:backend task)
```

New plans start as `Status: draft`. Only the human flips a plan to `active`, by editing
the file. The review stage runs once after the implementation stages and is not listed.

## Required sections

All nine, in this order, with these exact headings:

`Goal` · `Scope` · `Assumptions` · `Open Questions` · `Steps` · `Validation` · `Risks` ·
`Rollout Order` · `Rollback`

When the task touches the API, `Steps` begins with a `Contract` subsection: each
endpoint as `METHOD /api/<entity>[/:id]`, its request fields, its response fields, and
the error codes it can return. The backend agent implements exactly that list; the
frontend agent consumes the generated types.

## Content rules

- Repository-relative paths only.
- Name files to create or change per package, following the layout in `AGENTS.md` and
  `backend/AGENTS.md`
  (`backend/src/api/<name>/…`, `backend/src/models/<name>/…`, `frontend/src/feature/<name>/…`). A plan that puts
  logic in `app/` or a fetch call in `ui/` is wrong.
- Every `Validation` item has the form `- V01 — <statement> — proof: <test name | command>`.
  QA runs the list as its checklist; "the code looks right" is not a proof.
- Every `Open Questions` item ends with `Recommended: <answer>`.
- Generated artifacts belong in `.orchestrate/`. Never create a `docs/` directory.
- Respect the task's markers: a `stack:frontend` task plans no backend work; a `stack:backend` task plans no frontend work.

## Superseding a plan

Set the old plan to `Status: superseded` with a link to the replacing plan, and say in
the new plan which decisions it keeps.

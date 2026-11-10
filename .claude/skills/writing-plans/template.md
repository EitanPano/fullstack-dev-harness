# <Task title>

Status: draft
Owner:
Last updated: YYYY-MM-DD
Branch: feat/<slug>
Base: <commit the branch was created from>
Stages: backend, frontend, qa
Retired: `<exact name or path the task renames or removes>`, … | none

## Goal

<One paragraph: what the user can do after this task that they cannot do today, and which
acceptance criteria (AC numbers) it satisfies.>

## Scope

- In: <capabilities, one per line>
- Out: <what is explicitly not part of this task; proposed backlog lines as `- [ ] <title>`>

## Assumptions

- <one line, at most 6: a decision taken from .doc/ or an earlier plan, with the file>

## Open Questions

1. <Question? At most 3, 5 lines each> Recommended: <answer>.
   > <the approver's answer, written here by the driver; indented or not, blockquote lines do not count toward the cap>

## Contract

<Only when the API changes.>

| Endpoint | Request | Response | Errors |
| --- | --- | --- | --- |
| `GET /api/<entity>/{id}` | `params.id: string` | `{ id, …, createdAt }` | 404 |

## UX

<Only when there is a frontend stage. Per route: its pattern (`list`, `detail`, `form`, `auth`,
`dashboard`, `workspace`, `confirm`, `landing`), primary action, loading, empty and error states, tone and phone layout
(`ui-design` skill). No copy strings. The first task with a frontend stage starts with the `shell` line.>

- shell — <regions, each with its contents> — theme toggle: <place> — account: <place | none> — from: <Reference app | brief>
- /<route> — <pattern> — <primary action> — states: loading <…> · empty <…> · error <…> — tone: <…> — phone: <…>

## Steps

One line per module or feature; no copy strings, no code.

### Backend

1. `backend/src/models/<entity>/` — the entity's types and the data-model source or migration.
2. `backend/src/api/<entity>/` — `schema`, `service`, `controller`, `routes`, mount and
   contract registration.
3. `backend/tests/` — <entity> tests, store-backed ones in the database block.

### Frontend

1. One line per step of the package's `frontend/AGENTS.md › Adding a feature`, in its order,
   each naming its path. React: model, service endpoints, feature (routes, page, components),
   the page's stylesheet, nav entry. Angular and Vue: models, service, store, feature, route and nav,
   the page's stylesheet, copy keys. A top-level screen gets its nav entry; a route needs its own
   loading and error copy only when its group's do not fit.
2. `frontend/tests/` — the unit test and the e2e test.

## Validation

- V01 — <statement (AC<n>); at most 8 items> — proof: <test name | command>
- V02 — <statement (AC<n>)> — proof: <test name | command>

## Risks

- <risk> — <mitigation>

## Rollback

<Only when a migration or a data change ships: what to revert, in which order, and whether the
data change is reversible. Delete this section otherwise.>

## Changes during the task

<Empty at the start; the driver records a plan edit made during the task, with the date.>

# <Task title>

Status: draft
Owner:
Last updated: YYYY-MM-DD
Branch: feat/<slug>
Base: <commit the branch was created from>
Stages: backend, frontend, qa

## Goal

<One paragraph: what the user can do after this task that they cannot do today, and which
acceptance criteria (AC numbers) it satisfies.>

## Scope

- In: <capabilities, one per line>
- Out: <what is explicitly not part of this task>

## Assumptions

- <decision taken from .doc/ or an earlier plan, with the file that records it>

## Open Questions

1. <Question?> Recommended: <answer>.

## Steps

### Contract

| Endpoint | Request | Response | Errors |
| --- | --- | --- | --- |
| `GET /api/<entity>/:id` | `params.id: string` | `{ id, …, createdAt }` | 404 |

### Backend

1. Models: `backend/src/models/<entity>/` (the entity's types, and the data-model source
   or migration as the engine requires, per `backend/AGENTS.md › Adding the data layer`
   and the `database` skill).
2. `backend/src/api/<entity>/` `schema`: <request and response schemas, contract
   registration>.
3. `service` (queries, when the module has data), `controller` (handlers and exported
   rules, the module's only public API), `routes` (the router).
4. The module's mount line and registration line, per `backend/AGENTS.md › Adding a
   module`.
5. The package's `contract` command.
6. `backend/tests/` <entity> tests: happy path, validation failure, not found (the
   store-backed ones in the database block).
7. `check`; `testDb` when a database block exists.

### Frontend

1. The package's `contract` command.
2. `frontend/src/feature/<name>/`, per `frontend/AGENTS.md › Adding a feature`.
3. `frontend/src/app/<route>/` the page (with its loading and error states).
4. `frontend/tests/` the unit test and the e2e test.
5. `check`.

## Validation

- V01 — <statement> — proof: <test name | command>
- V02 — <statement> — proof: <test name | command>

## Risks

- <risk> — <mitigation>

## Rollout Order

backend → frontend → review → qa

## Rollback

<What to revert and in which order; whether the data change is reversible.>

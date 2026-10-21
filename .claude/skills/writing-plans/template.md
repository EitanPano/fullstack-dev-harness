# <Task title>

Status: draft
Owner:
Last updated: YYYY-MM-DD
Branch: feat/<slug>
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

1. Models: `backend/src/models/<entity>/` (types, and the data-model source or migration
   as the engine requires, per the `database` skill).
2. `backend/src/api/<entity>/schema.ts`: <zod schemas, OpenAPI registration>.
3. `backend/src/api/<entity>/repository.ts` (queries), `service.ts` (private rules),
   `controller.ts` (the module's public API, the only file another module imports),
   `route.ts` (the HTTP adapter: middleware, `validate()`, status).
4. One line in `backend/src/config/routes.ts`.
5. `bun run openapi`.
6. `backend/tests/<entity>.test.ts`: happy path, validation failure, not found (the ones
   that touch records inside `describeDb`).
7. `bun run check`; `bun run test:db` when a `describeDb` block exists.

### Frontend

1. `bun run api:types`.
2. `frontend/src/feature/<name>/model.ts`, `server/<loader>.ts`, `ui/<component>.tsx`.
3. `frontend/src/app/<route>/page.tsx` (+ `loading.tsx`, `error.tsx`).
4. `frontend/tests/unit/<name>.test.tsx`, `frontend/tests/e2e/<journey>.spec.ts`.
5. `bun run check`.

## Validation

- V01 — <statement> — proof: <test name | command>
- V02 — <statement> — proof: <test name | command>

## Risks

- <risk> — <mitigation>

## Rollout Order

backend → frontend → review → qa

## Rollback

<What to revert and in which order; whether the data change is reversible.>

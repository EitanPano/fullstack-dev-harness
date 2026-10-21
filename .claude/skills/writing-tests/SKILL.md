---
name: writing-tests
description: Write or review unit, integration, and end-to-end tests. Use when adding tests for a new feature, writing a regression test for a bug fix, deciding what needs coverage, or judging whether a test suite is good enough to ship. Covers the test-first order, required coverage areas, the suites and runners in this repository, the test database, fixtures, flakiness rules, and what counts as a deleted or skipped test.
---

# Writing Tests

## Order of work

Tests come before implementation, from the plan's `Validation` list:

1. Write the test named by the validation item. Run it; it must fail for the right
   reason (missing behaviour, not a typo).
2. Implement the minimum that makes it pass.
3. Refactor with the test green.

A stage report that shows tests written after the fact is acceptable only when the
report says why.

## Principles

- Test behaviour, not implementation details. Assert on responses, rendered text,
  roles and state, never on internals.
- Deterministic and isolated: no shared mutable state, no reliance on order, time and
  randomness frozen when behaviour depends on them.
- Fast feedback first: unit tests, then HTTP tests, then e2e for the user journey.

## Must be covered

- Every service rule and state transition.
- Every endpoint: happy path returning the schema's shape and status, validation failure
  (400 envelope with `details`), not found (404), and auth or tenancy denial when the
  endpoint has one.
- Every user journey the task adds, as one e2e test.
- Every bug fix, with a regression test that fails before the fix.

## Suites in this repository

| Suite | Location | Runner | Notes |
| --- | --- | --- | --- |
| Backend | `backend/tests/<module>.test.ts` | `bun test` | supertest against `app` from `src/server.ts` |
| Backend units | `backend/tests/{middleware,services,infra}/*.test.ts` | `bun test` | one file per unit, no HTTP |
| Backend, database-backed | same files, inside `describeDb` | `bun run test:db` | exists once the data-layer task ran (`database` skill); uses `app_test` |
| Frontend unit | `frontend/tests/unit/**/*.test.{ts,tsx}` | `bun run test` | Vitest + RTL + jsdom; `globals: false`, so import from `vitest` |
| Frontend e2e | `frontend/tests/e2e/*.spec.ts` | `bun run test:e2e` | Playwright + axe; starts both dev servers itself |

### Backend

- Pure rules (a price calculation, a state transition) are plain functions with unit
  tests and no I/O.
- Endpoints and services are tested through HTTP: `request(app)` with supertest, asserting
  the status, the body shape and the envelope's `code` and `requestId` on failures. A
  module's tests live in `tests/<module>.test.ts`; middleware, `services/` and `infra/`
  units get `tests/middleware/`, `tests/services/` and `tests/infra/` files. The template
  ships, among others, `tests/middleware/{auth,role,rate-limit,validate}.test.ts`,
  `tests/services/{jwt,otp,session,cookies,crypto,communicate,cache,logger,time,event}.test.ts`
  and `tests/infra/{dependency,memory,pubsub,scheduler}.test.ts` (illustrative; list
  `backend/tests/` for the current set).
- Time goes through `setSystemTime` from `bun:test`, reset in `afterEach`; never sleep.
- Messages (mail, sms) are observed through a capturing provider registered with
  `registerProvider` from `services/communicate`, never a module mock.
- Until the product has a database, reset store state with `memory.close()` (from
  `src/infra/memory`) in `beforeEach`.
- A test that observes an event reaction calls `await pubsub.connect()` once (`beforeAll`),
  awaits `drain()` from `services/event.ts` after the action (handlers run detached, so
  the response returns before they finish) and calls `pubsub.close()` in `afterAll`; the bus
  is a process singleton.
- To get an admin in a test, create a user and promote it with the system operation
  `user.setUserRole`; no endpoint does it.
- A test that reads or writes records lives inside `describeDb` from `tests/db.ts`, calls
  `migrateTestDb()` in `beforeAll` and `resetTestDb()` in `beforeEach`, and therefore runs
  only under `bun run test:db` against `app_test`; `bun run check` never needs Docker. The
  `database` skill defines those helpers.
- Do not fake the repository with `mock.module`: it is process-global in `bun test` and
  leaks across files. Mock only an external provider at its boundary (`fetch`, an SDK).
- `tests/error-handler.test.ts` pins the validation envelope and the error mapping on a
  throwaway app; a module test does not repeat that, it asserts its own codes.

### Frontend

- Presentational components get props and are asserted through roles and text.
- Loaders and actions are tested by stubbing `fetch` (`vi.stubGlobal`); `server-only`
  is aliased to a stub in `vitest.config.mts`. A client leaf that receives a server
  action as a prop is tested with a `vi.fn()` action and a mocked `sonner`.
- E2E tests use roles and labels (`getByRole`, `getByLabel`), never CSS selectors, and
  include an axe scan on every new page. A journey that needs data starts from an API
  call in the test's setup, never from the development database's contents.

## Data and fixtures

- Minimal fixtures, built by small factory functions, scoped to the scenario.
- Never embed real secrets, keys or credentials in test data.

## Reliability

- No flaky tests. A test that needs a retry is a bug.
- `.only` is rejected by both runners (`allowOnly: false`, `forbidOnly: true`).

## Deleted and skipped tests

A deleted, `.skip`ped or `.todo` test in the diff is a QA failure unless the stage report
names it and the reason (behaviour removed on purpose). When a test fails, fix the code,
not the test.

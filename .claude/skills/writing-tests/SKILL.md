---
name: writing-tests
description: Write or review unit, integration, and end-to-end tests. Use when adding tests for a new feature, writing a regression test for a bug fix, deciding what needs coverage, or judging whether a test suite is good enough to ship. Covers the test-first order, required coverage areas, the suites per package, the test database, fixtures, flakiness rules, and what counts as a deleted or skipped test.
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
  randomness frozen when behaviour depends on them (set the clock in the test and reset it
  in `afterEach`); never sleep.
- Fast feedback first: unit tests, then HTTP tests, then e2e for the user journey.
- Pure rules (a price calculation, a state transition) are plain functions with unit
  tests and no I/O.
- Do not fake a data-access file with a process-global module mock: it leaks across test
  files. Mock only an external provider at its boundary.

## Must be covered

- Every rule and state transition.
- Every endpoint: happy path returning the schema's shape and status, validation failure
  (400 envelope with `details`), not found (404), and auth or tenancy denial when the
  endpoint has one. A module test asserts its own codes and does not repeat the shared
  error-mapping test.
- Every user journey the task adds, as one e2e test.
- Every bug fix, with a regression test that fails before the fix.

## Suites per package

Each package's `AGENTS.md › Tests` names its runner, test directories, stubs and helpers
(`backend/AGENTS.md`, `frontend/AGENTS.md`). The commands `test` and `testE2e` come from
`.fullstack/catalog.yaml`, and `testDb` is there too when a provider was chosen at the
bootstrap; otherwise the data-layer task adds `testDb` and names it in the package's
`AGENTS.md › Adding the data layer`. Run `testDb` wherever the package has it.

- Server: HTTP tests import the app builder and never start infrastructure or the
  entry file. A module's tests live in one file; gates, shared capabilities and
  infrastructure units get a file each, with no HTTP. Messages (mail, sms) are observed
  through a capturing provider registered at its boundary, never a module mock. An event
  reaction is observed after the action by waiting for the detached handlers to drain; the
  event bus is a process singleton, so connect it once and close it after the file. To get
  an admin, create a user and promote it with the system operation; no endpoint does it. A
  test asserts the committed OpenAPI document is fresh.
- Server, database-backed: tests that read or write records through the engine opt in
  through the block the package names and run under `testDb`, against the test database.
  `check` never needs Docker and skips these suites once the package has `testDb`. Until the product has a database, the test resets the
  in-memory store before each test. The `database` skill defines the test database.
- Frontend: unit tests cover components, loaders and actions. Components get props and are
  asserted through roles and text. Loaders and actions run with the API stubbed at the
  network boundary; no test starts the server. A client leaf that receives a server action
  as a prop is tested with a fake action and a mocked toast library.
- Frontend e2e: one test per user journey, with an accessibility scan on every new page.
  Locate by role and label, never CSS selectors. A journey that needs data starts from an
  API call in the test's setup, never from the development database's contents.

## Data and fixtures

- Minimal fixtures, built by small factory functions, scoped to the scenario.
- Never embed real secrets, keys or credentials in test data.

## Reliability

- No flaky tests. A test that needs a retry is a bug.
- Focusing a test (`.only` in TypeScript runners) is rejected by the runner's configuration;
  the package's `AGENTS.md › Tests` lists its spellings.

## Deleted and skipped tests

A deleted, skipped or todo test in the diff (spellings per the package's `AGENTS.md › Tests`:
for example `.skip` and `.todo`, or `pytest.mark.skip`, `skipif`, `xfail`, `-k` and
`--deselect` in a gate command) is a QA failure unless the stage report names it and the
reason (behaviour removed on purpose). When a test fails, fix the code, not the test.

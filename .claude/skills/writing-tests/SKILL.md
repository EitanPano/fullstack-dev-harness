---
name: writing-tests
description: Write or review unit, integration, and end-to-end tests. Use when adding tests for a new feature, writing a regression test for a bug fix, deciding what needs coverage, or judging whether a test suite is good enough to ship. Covers the test-first order, required coverage, the suites per package, fixtures, flakiness rules, and what counts as a deleted or skipped test.
---

# Writing Tests

## Order of work

Tests come before implementation, from the plan's `Validation` list:

1. Write the test named by the validation item. Run it; it must fail for the right
   reason (missing behaviour, not a typo).
2. Implement the minimum that makes it pass.
3. Refactor with the test green.

The red run's summary (command, failed and passed counts, failing test names) goes in the
stage report as `Tests first:`; QA checks the names against the diff. This holds for the
backend's contract stage too: it writes the request-schema tests that must fail (one per
validation rule the plan names) before it writes the schemas.

The gate is `node scripts/verify.mjs --plan <plan>`, and the driver's full run is the evidence.
Each role's agent file says how it runs or reads it.

A stage report that shows tests written after the fact is acceptable only when the
report says why (`Tests first: after the fact — <reason>`); QA judges the reason.

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
`.fullstack/catalog.yaml`, and `testDb` is there too when a provider was chosen at the bootstrap;
otherwise the data-layer task's scaffold records it. `verify` runs `testDb` wherever the package has
it.

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
- Frontend: unit tests cover components, the data layer, and each feature's form schema file
  and copy table. Components get props and are asserted through roles and text. Data calls
  run with the API stubbed at the network boundary, through the package's real result helper
  or interceptor; no test starts the server. Each package's `AGENTS.md › Tests` gives the
  pattern, including how a component or route renders (Next: mock the action module and the
  toast library; an SPA: the package's router test harness).
- Frontend e2e: one test per user journey, with an accessibility scan on every new page.
  Locate by role and label, never CSS selectors. Journeys run on the `phone` project;
  `desktop` runs the shell and screens specs. A check for one viewport carries a `@phone` or
  `@desktop` tag; never skip at run time (`verify` refuses `.skip`). `retries` stays 0. A
  journey creates its data through the UI with an email unique to the run, never from the
  development database's contents.

## Data and fixtures

- Minimal fixtures, built by small factory functions, scoped to the scenario.
- Never embed real secrets, keys or credentials in test data.

## Reliability

- No flaky tests. A test that needs a retry is a bug.
- Focusing a test (`.only` in TypeScript runners) is rejected by the runner's configuration;
  the package's `AGENTS.md › Tests` lists its spellings.

## Deleted and skipped tests

`verify` fails a focused, skipped or todo test on a test path (`.only`, `.skip`, `.todo`, the
conditional spellings such as `.skipIf` and `.failing`, `xit`, `xtest`, `pytest.mark.skip`,
`skipif`, `xfail`); the one `skipif` with `reason=STORE_SKIP_REASON` in the catalog's
`tests/store.py` is exempt. `verify` cannot see a deleted test file or `-k`/`--deselect` in a
gate command, so QA checks both (`git diff --name-status <Base>` shows `D`): either is a QA
failure unless a stage report names it and the reason (behaviour removed on purpose). When a
test fails, fix the code, not the test.

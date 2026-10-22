---
name: code-review
description: Review a change against this repository's standards. Use when acting as the reviewer agent, when the user asks for a review of a branch or diff, or when deciding whether a stage is done. Covers the six-priority checklist, the P0/P1/P2 scale, what counts as evidence, how to read an uncommitted change, and the report format the dev loop parses.
---

# Code Review

Be critical. Surface real problems and say them plainly; do not soften, do not pad with
praise. A review with no findings states what was checked and why it holds.

## What to read

The change is uncommitted: read it as `git diff <Base>`, the working tree against the
plan's `Base:` commit (outside the dev loop, `main` unless the user names a base). Never
`git diff <Base>...HEAD`, which ignores the working tree, and inside the loop never
`git diff main`, which also shows earlier tasks committed on the branch. The driver has run
`git add --intent-to-add .`, so new files are in that diff; `git status --short` lists
them too. Read the plan's Scope, Contract and Validation first, then the diff, then what
the change should have touched but did not (a migration or index, a failure-path test, an
error state, a change-log line).

## Priorities, highest first

1. **Security**: injection, auth and tenancy boundaries, secrets in code or logs, data
   exposure in responses, unsafe dependencies.
2. **Scalability**: N+1 queries, missing indexes, unbounded lists, work on the request
   path that belongs in a job, state that cannot be replicated.
3. **Maintainability and architecture**: layering and import direction per `AGENTS.md` and
   `backend/AGENTS.md`, naming, duplication, a feature that reaches into another, logic in
   the routing layer or in a `routes` file beyond mounting middleware, validating and
   naming the handler (business logic belongs in the controller, its handlers and exported
   rules; queries in the service), a controller reaching another module's service, a
   service imported from outside its module.
   Is every new file in the home the `backend/AGENTS.md` table names for it (module file,
   `models/`, `middleware/`, `services/`, `services/utils/`, `infra/jobs/`,
   `infra/subscribers/`)? A file in two defensible homes is a finding.
4. **Error handling and validation**: validation at the edge with the envelope, correct
   status codes, no swallowed errors, user-safe failure UX, logs with request id.
5. **Unnecessary complexity**: abstraction without a second caller (a controller function
   that only forwards to its service is the module's public API, not an abstraction to
   remove), configuration no one reads, dead code, cleverness that a comment has to
   explain.
6. **Deployment and operations**: data change shipped with its migration or index, env variable in
   `config/env.ts` and `.env.example`, Docker build still valid, change log updated.

## Severity

- **P0**: must fix before the stage is done. A security hole, data loss, a broken gate,
  a contract that drifted, a lane or rule violated.
- **P1**: fix in this task. Wrong layering, missing failure-path test, misleading name,
  error leaking internals.
- **P2**: note for later. Style, minor duplication, a better library call.

## Evidence

Every finding names `file:line`, quotes the problem in one line, states the consequence,
and gives the fix. "Looks wrong" is not a finding; run the test or read the schema when
in doubt. Run only commands that read: the package's `typecheck`, `lint` and `test` commands,
`git diff`, never `format` or anything that writes.

## Report

Write `.orchestrate/review/<perspective>.md`. `Verdict` is `fail` when any P0 or P1
remains, otherwise `pass`.

```
Stage: review:<perspective>
Task: <slug>
Verdict: <pass | fail>

## Findings
- P0 — <file:line> — <problem> — <consequence> — Fix: <what to change>
- P1 — …
- P2 — …

## Checked and holds
- <what was examined and found correct, one line each>
```

The dev loop re-dispatches the implementer with the P0 and P1 lines verbatim, so each
must be self-contained.

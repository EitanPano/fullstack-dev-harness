# Agent Instructions

The single source of truth for how work is done here. Every agent and session reads it; a
package's own versions and tools are in its `AGENTS.md`.

## Communication

- Be concise and direct. Challenge a decision when a better option exists; state the tradeoff.

## Security

- Never commit or expose secrets (tokens, API keys, passwords, connection strings).
- Real secrets live in the shell environment or a secret manager, never in a file in the
  working tree. `.env.example` files hold placeholders only.

## Guardrails

- Guardrail logic lives in `.claude/hooks/`, wired by `.claude/settings.json`, the only file
  Claude Code reads hook and permission config from. A hook not listed there never runs.
  Where an instruction conflicts with the hooks, the hooks win. They fail closed.
- Hooks key write lanes on the sub-agent's `agent_type`: `frontend`, `backend`, `qa`,
  `orchestrator`, `reviewer` each have a lane, per task folder; `general-purpose` is
  unrestricted; any other role runs read-only shell commands only. Role agents write through
  Edit/Write; shell write channels, deletions, inline interpreters and git commands that
  change the tree or history are refused for them. `orchestrator` and `reviewer` may run any
  runtime's inline code and stdin programs.
- A file a role agent needs removed goes in its report under `Delete:`; the driver removes it
  only inside that agent's lane.
- Lanes stop accidents; they are not a sandbox (use Claude Code's sandbox or a container).
  Recovery: `README.md`.

## Repository layout

| Path | What it is | Who writes it |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | These rules, and the file that loads them into Claude Code | Humans |
| `.doc/` | Product definition, architecture, glossary | Humans, with the bootstrap skill |
| `.plan/000-backlog.md` | The task queue | Humans and the dev loop |
| `.plan/NNN-YYYY-MM-DD-*.md` | One plan per task | Orchestrator |
| `.claude/` | `agents/`, `skills/`, `rules/`, `hooks/` | Humans |
| `catalog.lock` | The pinned catalog version; bumping it is a reviewed change | Humans |
| `.fullstack/catalog.yaml` | Stack, templates, versions, flags, commands, ports per package | The bootstrap |
| `scripts/` | `bootstrap.mjs`, `verify.mjs` | Humans |
| `frontend/`, `backend/` | Generated packages, each with its own `AGENTS.md` | Frontend, backend agent |
| `docker-compose.yml`, `db/` | The Compose stack and database init scripts | Backend agent |
| `.orchestrate/<slug>/` | Loop output per task: stage reports, `ticket.md`, `verify.json`, `verify-partial.json` (last partial run) | The loop |

Never create a `docs/` directory. `.orchestrate/` is git-ignored except its README.

## Stack

- Bun 1.4 or newer, Node 24 or newer and git; Node also runs the harness scripts and hooks.
  A package's own tools (uv for Python) are checked at the bootstrap.
- Docker Compose is the deployment target and hosts local infrastructure; see the
  `deployment` skill for modes and the Compose run.
- The stack comes from the catalog (`https://github.com/EitanPano/fullstack-templates`)
  pinned in `catalog.lock`, recorded in `.fullstack/catalog.yaml`. Resolve a command per
  package there; never spell a package manager command.

| Command | Meaning |
| --- | --- |
| `install` | Dependencies from the lockfile. |
| `dev` | Development server with reload. |
| `check` | Every gate, no Docker; exit 0 is done (a package with `testDb` skips store suites). |
| `typecheck`, `lint`, `format` | One gate; the layer-boundary lint; rewrite files. |
| `test`, `testDb`, `testE2e` | Unit; whole suite on the test database; e2e with accessibility scan. |
| `contract`, `migrate` | OpenAPI out, or types regenerated; apply the data model change. |

`testDb` and `migrate` exist once a database does. The data-layer task names them in its
backend report (`Commands:`) and the driver records them in `.fullstack/catalog.yaml`. Never
run a scaffolder inside an existing package.

## Architecture

Two packages and one generated contract. Layer maps and worked examples are in each package's
`AGENTS.md`.

- Server: `config/`, `api/<module>/` (`routes`, `controller`, `schema`, `service`), `models/`,
  `middleware/`, `services/`, `infra/`. Modules meet only through controllers; a module's
  service is never imported from outside it.
- Frontend: a routing-only `app`; `feature/<name>/` (`ui/`, data layer, `model`); `shared/`
  never imports a feature; no feature imports another's `ui/`.
- The typed client in `lib/api/` is generated from the contract; only a data layer imports it.
- Auth sits behind the server's `auth` flag; its model changes only by plan.
- HTTP: singular paths, JSON only, the `error-handling` envelope, a request id on every
  response. The server's request schemas are the single source of truth for the OpenAPI
  document; both generated files are committed; no hand-written API type.
- Configuration is environment variables, read once in the package's env module, each listed
  in `.env.example`. The data engine is a catalog provider.

## Rules

In `.claude/rules/`: `code-style.md` (loads for `scripts/` and hooks), `naming.md`,
`ui-and-styling.md` (loads for `frontend/`), `git-workflow.md` (approval before any
commit, merge or tag; Conventional Commits).

## Definition of done

Done means every item holds and the reports show the evidence.

1. `node scripts/verify.mjs --plan <plan> --reuse` exits 0: each touched package's `check`
   (and `testDb`, none skipped) and the e2e suite. Evidence: `.orchestrate/<slug>/verify.json`.
   A run with `--package` or `--no-e2e` is partial: it writes `verify-partial.json` and never
   satisfies `--reuse`.
2. Every new behaviour has a happy-path unit test and a failure or empty one, with the red run
   in the report (`Tests first:`). Every user journey added has an e2e test where there is a
   frontend.
3. No test was deleted, skipped or focused. `verify` enforces the focus and skip spellings;
   QA checks deleted tests and filtered gate commands. Each is justified in a report.
4. Errors follow `error-handling`. No secrets, stack traces or query text leave the server.
5. A schema or endpoint change ran both `contract` commands and committed both results; a
   data-model change ships what `database` requires and passes `testDb`.
6. UI changes meet the frontend's `AGENTS.md › Styling`; the accessibility scan passes.
7. `.doc/architecture.md` has a change-log entry when routes, auth boundaries or the data
   model changed (the driver writes it at finish); new domain terms are in `.doc/glossary.md`.
8. The review stage reports no open P0 or P1 finding.

## Skills

| Skill | Use it when |
| --- | --- |
| `bootstrap-project` | A fresh clone has no `.fullstack/catalog.yaml` yet |
| `dev-loop` | Taking one backlog task from plan to reviewed code |
| `writing-plans` | Creating, revising or superseding a plan in `.plan/` |
| `writing-tests` | Adding or reviewing unit, integration or e2e tests |
| `api-design` | Adding or changing an endpoint, its schemas or the contract |
| `error-handling` | Shaping an error response, status code, retry or failure UX |
| `database` | The engine; any table, index, migration or data-access file |
| `code-review` | Reviewing a change |
| `cutting-a-release` | Choosing a version number or tagging a release |
| `deployment` | Deploy mode, `TRUST_PROXY`, the Compose run, scaling, a static host |

## Product and domain

- Product definition and acceptance criteria: `.doc/product-definition.md`.
- Architecture decisions and change log: `.doc/architecture.md`.
- Canonical domain terms: `.doc/glossary.md`.
- A section that still holds a `<!-- FILL: … -->` marker is undecided. The orchestrator
  does not plan against it; it asks first.

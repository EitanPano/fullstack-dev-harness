# Agent Instructions

The single source of truth for how work is done here; a package's own versions and tools are
in its `AGENTS.md`.

## Communication

- Be concise. Challenge a decision when a better option exists, stating the tradeoff.

## Security

- Never commit or expose secrets (tokens, keys, passwords, connection strings).
- Real secrets live in the shell environment or a secret manager, never in the working tree.
  `.env.example` files hold placeholders only.

## Guardrails

- Guardrail logic lives in `.claude/hooks/`, wired by `.claude/settings.json`, the only file
  Claude Code reads hook and permission config from. A hook not listed there never runs. The
  hooks win over instructions and fail closed.
- Hooks key write lanes on the sub-agent's `agent_type`: `frontend`, `backend`, `qa`,
  `orchestrator`, `reviewer` each have a lane per task folder; `general-purpose` is
  unrestricted; any other role runs read-only shell commands. Role agents write through
  Edit/Write; shell write channels, deletions, inline interpreters and git commands that
  change the tree or history are refused. `orchestrator` and `reviewer` may run any
  runtime's inline code and stdin programs.
- A file a role agent needs removed goes in its report under `Delete:`; the driver removes it
  inside that agent's lane only.
- Lanes stop accidents; they are not a sandbox (use Claude Code's sandbox or a container). Recovery:
  `README.md`.

## Repository layout

| Path | What it is | Who writes it |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | These rules, and their loader | Humans |
| `.doc/` | Product definition, architecture, glossary | Humans, bootstrap skill |
| `.plan/000-backlog.md` | The task queue | Humans and the dev loop |
| `.plan/NNN-YYYY-MM-DD-*.md` | One plan per task, promoted from the draft | Driver |
| `.claude/` | `agents/`, `skills/`, `rules/`, `hooks/` | Humans |
| `catalog.lock` | The pinned catalog version; a bump is a reviewed change | Humans |
| `.fullstack/catalog.yaml` | Stack, versions, flags, commands, ports per package | The bootstrap |
| `scripts/` | `bootstrap.mjs`, `verify.mjs` | Humans |
| `frontend/`, `backend/` | Generated packages | Frontend, backend agent |
| `docker-compose.yml`, `db/` | Compose stack, database init | Backend agent |
| `.orchestrate/<slug>/` | Loop output per task: `plan.md` (the orchestrator's draft), reports, `ticket.md`, `verify.json`, `verify-partial.json`, `review.diff`, `review-fix-<n>.diff` | The loop |

Never create a `docs/` directory. `.orchestrate/` is git-ignored except its README.

## Stack

- Bun 1.4+, Node 24+ and git. A package's own
  tools (uv for Python) are checked at the bootstrap.
- Docker Compose is the deployment target and hosts local infrastructure (`deployment` skill).
- The stack comes from the catalog (`https://github.com/EitanPano/fullstack-templates`)
  pinned in `catalog.lock` and recorded in `.fullstack/catalog.yaml`. Resolve a command per
  package there; never spell a package manager command.

| Command | Meaning |
| --- | --- |
| `install` | Dependencies from the lockfile. |
| `dev` | Development server with reload. |
| `start` | Run the server once, with no file watcher; a frontend's e2e starts the API with it. |
| `check` | Every gate, no Docker; exit 0 is done. |
| `typecheck`, `lint`, `format` | One gate; the layer-boundary lint; rewrite files. |
| `test`, `testDb`, `e2eDb`, `testE2e` | Unit; whole suite on the test database; prepare the e2e database; e2e with accessibility scan. |
| `contract`, `migrate` | OpenAPI out, or types regenerated; apply the data model change. |

`testDb`, `e2eDb` and `migrate` exist once a database does. The data-layer task names them in
its backend report (`Commands:`); the driver records them in `.fullstack/catalog.yaml`.
Never run a scaffolder inside an existing package, except `bunx shadcn@4.21.4 add <name>`.

## Architecture

Two packages and one generated contract. Layer maps: each package's `AGENTS.md`.

- Server: `config/`, `api/<module>/` (`routes`, `controller`, `schema`, `service`), `models/`,
  `middleware/`, `services/`, `infra/`. Modules meet only through controllers; a service
  is never imported from outside its module.
- Frontend: `app/` (routes only), `widget/<section>/`, `feature/<action>/`, `entity/<noun>/`,
  `shared/`; imports point down that list (lint enforces it).
- The typed client in `shared/api/generated/` comes from the contract; only a slice's `server/`
  (Next) or `api/` (SPA) segment and `shared/auth` import it; a `model.ts` may also import its
  types and the `zod.gen` schemas.
- Auth sits behind the server's `auth` flag; its model changes only by plan.
- HTTP: singular paths, JSON only, the `error-handling` envelope, a request id on every
  response. The server's request schemas are the single source for the OpenAPI document; both
  generated files are committed; no hand-written API type.
- Configuration is environment variables, read once in the package's env module and listed in
  `.env.example`. The data engine is a catalog provider.

## Rules

In `.claude/rules/`: `code-style.md` (`scripts/` and hooks), `naming.md`, `ui-and-styling.md`
(`frontend/`), `git-workflow.md` (approval before any commit, merge or tag; Conventional
Commits).

## Definition of done

Done means every item holds, with evidence in the reports.

1. `node scripts/verify.mjs --plan <plan> --reuse` exits 0: each touched package's `check`
   (and `testDb`, none skipped) and the e2e suite. Evidence: `.orchestrate/<slug>/verify.json`.
   A run with `--package` or `--no-e2e` is partial: it writes `verify-partial.json`, never
   satisfies `--reuse` as a whole run, and its passing steps are reused per package.
2. Every new behaviour has a happy-path unit test and a failure or empty one, with the red run
   in the report (`Tests first:`). Every added user journey has an e2e test (with a frontend).
3. No test was deleted, skipped or focused. `verify` enforces the focus and skip spellings;
   QA checks deleted tests and filtered gate commands. Each is justified in a report.
4. Errors follow `error-handling`. No secrets, stack traces or query text leave the server.
5. A schema or endpoint change ran both `contract` commands and committed both results; a
   data-model change ships what `database` requires and passes `testDb`.
6. UI changes meet the frontend's `AGENTS.md › Styling`; the frontend reports `UI pass:`
   and QA `UX:` lines (open rubric findings are P2); the accessibility scan passes.
7. `.doc/architecture.md` has a change-log entry when routes, auth boundaries or the data
   model changed; new domain terms are in `.doc/glossary.md`.
8. The review stage reports no open P0 or P1 finding.

## Skills

| Skill | Use it when |
| --- | --- |
| `bootstrap-project` | A fresh clone has no `.fullstack/catalog.yaml` yet |
| `dev-loop` | Taking one backlog task from plan to reviewed code |
| `writing-plans` | Creating, revising or superseding a plan in `.plan/` |
| `writing-tests` | Adding or reviewing unit, integration or e2e tests |
| `ui-design` | Planning a route's UX, composing a page, judging a screenshot |
| `api-design` | Adding or changing an endpoint, its schemas or the contract |
| `error-handling` | Shaping an error response, status code, retry or failure UX |
| `database` | The engine; any table, index, migration or data-access file |
| `code-review` | Reviewing a change |
| `cutting-a-release` | Choosing a version number or tagging a release |
| `deployment` | Deploy mode, `TRUST_PROXY`, the Compose run, scaling, a static host |

## Product and domain

- Product definition and acceptance criteria: `.doc/product-definition.md`; architecture
  decisions and change log: `.doc/architecture.md`; domain terms: `.doc/glossary.md`.
- A section that still holds a `<!-- FILL: … -->` marker is undecided. The orchestrator
  asks first, never plans against it.

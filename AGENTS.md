# Agent Instructions

The source of truth for work here; a package's versions are in its `AGENTS.md`.

## Communication

- Be concise. Challenge a decision when a better option exists; state the tradeoff.

## Security

- Never commit or expose secrets (tokens, keys, passwords, connection strings).
- Real secrets live in the shell environment or a secret manager, never the working
  tree. `.env.example` holds placeholders only.

## Guardrails

- Guardrail logic lives in `.claude/hooks/`, wired by `.claude/settings.json`, the only hook and
  permission config Claude Code reads. An unlisted hook never runs. Hooks win
  over instructions and fail closed.
- Hooks key write lanes on the sub-agent's `agent_type`: `frontend`, `backend`, `qa`,
  `orchestrator`, `reviewer` each have a lane per task folder, plus its packages in
  `.fullstack/catalog.yaml`; `general-purpose` is
  unrestricted; any other role runs read-only shell commands. Role agents write through
  Edit/Write; shell write channels, deletions, inline interpreters and git commands changing
  the tree or history are refused. `orchestrator` and `reviewer` may run any
  runtime's inline code and stdin programs.
- A role agent's report lists a file to remove under `Delete:`; the driver removes it inside
  its lane only.
- Never route around a refusal; report it.
- Lanes stop accidents; they are no sandbox (use Claude Code's or a container). Recovery:
  `.claude/README.md`.

## Repository layout

| Path | What it is | Who writes it |
| --- | --- | --- |
| `README.md` | The product's README | Setup, loop |
| `AGENTS.md`, `CLAUDE.md` | These rules, their loader | Harness |
| `.claude/README.md` | The harness manual | Harness |
| `.doc/`, `<package>/.doc/` | Product-wide docs; a package's own | Humans, bootstrap, driver; package agent |
| `.plan/000-backlog.md` | The task queue | Humans, loop |
| `.plan/NNN-YYYY-MM-DD-*.md` | One plan per task | Driver |
| `.claude/` | `agents/`, `skills/`, `rules/`, `hooks/`; `harness.json`, the file manifest | Harness |
| `catalog.lock` | The pinned catalog version; frozen in a project | Humans |
| `.fullstack/` | `catalog.yaml` (stack, flags, commands, ports); `harness.json`, the harness version | The bootstrap |
| `scripts/` | `verify.mjs`, `readme.mjs`, `guidance.mjs`, `harness-update.mjs`, `scaffold.mjs`, `catalog.mjs`; `bootstrap.mjs` in a fresh clone | Humans |
| `<frontend>/`, `sdk-<name>/`, `backend/` or `serverless/<provider>/` | Generated packages | Frontend, backend agent |
| `docker-compose.yml`, `db/` | Compose stack, database init | Backend agent |
| `.orchestrate/<slug>/` | Per task: draft `plan.md`, reports, `ticket.md`, verify results, review diffs | The loop |

Never create a `docs/` directory. `.orchestrate/` is git-ignored except its README.

## Stack

- Bun 1.4+, Node 24+ and git; setup checks a package's own tools (uv for Python).
- Docker Compose is the deployment target and hosts local infrastructure; a `serverless/`
  package deploys to its provider (`deployment`).
- The stack comes from the catalog (`https://github.com/EitanPano/fullstack-templates`)
  pinned in `catalog.lock`, recorded in `.fullstack/catalog.yaml`. Resolve a command per
  package there; never spell a package manager command.

| Command | Meaning |
| --- | --- |
| `install` | Dependencies from the lockfile. |
| `dev` | Development server with reload. |
| `start` | Run the server once, no watcher; e2e starts the API with it. |
| `check` | Every gate, no Docker; exit 0 is done. |
| `typecheck`, `lint`, `format` | One gate; the layer-boundary lint; rewrite files. |
| `test`, `testDb`, `e2eDb`, `testE2e` | Unit; suite on the test database; prepare the e2e database; e2e with accessibility scan. |
| `contract`, `migrate` | OpenAPI out, or types regenerated; apply the data model change. |

`testDb`, `e2eDb` and `migrate` arrive with the database part.
Never run a scaffolder inside an existing package, except one its `AGENTS.md` names.

## Architecture

A package exists by need: the bootstrap creates the first, `scripts/scaffold.mjs` later ones.

- Server: `config/`, `api/<entity>/` (`routes`, `controller`, `schema`, `service`), `models/`,
  `middleware/`, `services/`, `infra/`. Entities meet only through controllers; never import
  another entity's service.
- Frontend: `<frontend>/` names its type: `site`, `platform`, `app` (`app-<tool>` when several)
  or `admin`; older: `frontend`. SDK: `sdk-<name>/`, a library other sites embed, on
  `/api/sdk/v1/` only. Layers, import direction and where an addition goes: the package's
  `AGENTS.md`; lint enforces the direction.
- The typed client comes from the contract into the agents file's directory; only the data
  layer it names imports the runtime; a model may import its types and `zod.gen` schemas.
- Auth sits behind the server's `auth` flag; its model changes only by plan.
- HTTP: singular paths, JSON only, the `error-handling` envelope, a request id on every
  response. The server's request schemas are the single source for the OpenAPI document; both
  generated files are committed; no hand-written API types.
- Configuration is environment variables, read once in the package's env module, listed in
  `.env.example`. The data engine is a catalog provider.

## Rules

In `.claude/rules/`: `code-style.md` (`scripts/`, hooks), `naming.md`, `ui-and-styling.md`
(frontends), `git-workflow.md` (approval before commit, merge, push or tag; Conventional Commits).

## Definition of done

Done means every item holds, with evidence.

1. `node scripts/verify.mjs --plan <plan> --reuse` exits 0: each touched package's `check`
   (and `testDb`, none skipped) and the e2e suite. Evidence: `.orchestrate/<slug>/verify.json`.
   A run with `--package` or `--no-e2e` is partial, never a substitute.
2. Every new behaviour has a happy-path unit test and a failure or empty one, with the red run
   in the report (`Tests first:`). Every new user journey has an e2e test (with a frontend).
3. No test was deleted, skipped or focused. `verify` enforces focus and skip spellings;
   QA checks deleted tests and filtered gate commands. Justify each in a report.
4. Errors follow `error-handling`. No secrets, stack traces or query text leave the server.
5. A schema or endpoint change ran each `contract` command and committed the results; a
   data-model change ships what `database` requires and passes `testDb`.
6. UI changes meet the package's `AGENTS.md › Styling`; the frontend reports `UI pass:`,
   QA `UX:` (open rubric findings are P2); the accessibility scan passes.
7. `<package>/.doc/architecture.md` (the root file where a package has none) logs the
   change, one line citing its plan; new domain terms are in `.doc/glossary.md`.
8. Review reports no open P0 or P1 finding.
9. Root `README.md` Features names each user-visible capability the change touches;
   `node scripts/readme.mjs --configuration` regenerates its Configuration block.

## Skills

| Skill | Use it when |
| --- | --- |
| `bootstrap-project` | Fresh clone; setup removes it |
| `dev-loop` | A backlog task, plan to reviewed code |
| `writing-plans` | Creating or revising a plan |
| `writing-tests` | Adding or reviewing tests |
| `ui-design` | Planning a UX line, composing pages, judging screens |
| `api-design` | Changing an endpoint, schemas or the contract |
| `error-handling` | Error responses, status codes, retries, failure UX |
| `database` | The engine; tables, indexes, migrations, data access |
| `code-review` | Reviewing a change |
| `cutting-a-release` | Version numbers, tagging a release |
| `deployment` | Deploy mode, `TRUST_PROXY`, Compose, scaling, static host |

## Product and domain

- Product and acceptance criteria: `.doc/product-definition.md`; architecture:
  `.doc/architecture.md`; domain terms: `.doc/glossary.md`; a package's own: `<package>/.doc/`.
  Project agent rules: `.doc/conventions.md`, never changed by harness updates.
- A section holding a `<!-- FILL: … -->` marker, in either folder, is undecided. The
  orchestrator asks first, never plans against it.

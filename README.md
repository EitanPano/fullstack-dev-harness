# Full-stack dev harness

A template repository for building a full-stack product with AI coding agents. Clone it,
open it in Claude Code, and the harness supplies what the agents would otherwise guess:
the procedure from backlog line to reviewed code, the guardrails that keep each agent in its
lane, the definition of done, and a stack from the template catalog
`https://github.com/EitanPano/fullstack-templates`, pinned in `catalog.lock`.

What you get after the bootstrap:

- The packages of the stack you choose, each generated from a catalog template that ships its
  own `AGENTS.md` (layer map, how to add a module or a feature, errors, tests), with its
  commands and ports recorded in `.fullstack/catalog.yaml`.
- `docker-compose.yml` with the application images behind the `app` profile and, when a
  database provider was chosen, its service. `--capability database=postgres` (the
  bootstrap passes it when you pick Postgres) wires the server to a `database` service with
  `db/init.sql`, a `DATABASE_URL`, migrations, and the `migrate`, `testDb` and `e2eDb` commands; the
  catalog README is the reference for the matrix.
- Five role agents (orchestrator, backend, frontend, reviewer, qa), eleven skills, and
  fail-closed hooks that enforce write lanes, refuse destructive commands, and refuse
  access to secret files.

The catalog's stacks: `next-bun-express` is a layered Express 5 API on Bun with an `auth`
flag, and a Next.js frontend with a client typed from the server's contract;
`next-python-fastapi` pairs the same frontend with a layered FastAPI API on Python managed by
uv. `react-bun-express` and `react-python-fastapi` pair a React single-page app with the same
two APIs. Catalog v1.4.0 frontends share one layered foundation (app, widget, feature, entity,
shared) and take brand inputs at the bootstrap: display name, primary and neutral colours,
radius, font, default theme and density, written from the product definition's `Design`
section. The catalog README has the matrix.

A project generated with an older frontend cannot be upgraded in place: a lock bump changes
only what new bootstraps generate.

Deploy modes: a stack with a server and a single-page app asks `single` (the default: one
container, the server serves the built frontend and the API on one port, no CORS; needs Docker
Compose; the `deployment` skill states the floor) or `split` (one container per package,
the frontend image proxies `/api`). A Next stack is always `split`. The `deployment`
skill moves a project between the modes.

## Prerequisites

- Claude Code 2.1.295 or newer.
- Bun 1.4 or newer, Node 24 or newer and git, all on the `PATH` that Claude Code sees. On
  Windows, Git Bash backs the Bash tool. A package's own tools (uv for a Python backend) come
  from its template's `tools` and are checked at the bootstrap.
- The bootstrap clones the catalog into
  `~/.cache/fullstack-templates/<version>/` (override with `FULLSTACK_TEMPLATES_CACHE`; use a
  local checkout with `--templates <path>` or `FULLSTACK_TEMPLATES_DIR`).
- Docker with Compose v2 for the compose stack and the database you choose.
- On Linux, the frontend package's `AGENTS.md › Tests` names the browser install.
- `.gitattributes` checks the text files out with LF on every host.

## Clone checklist

1. Create a repository from this template (or `git clone` and remove the remote). The
   bootstrap needs a git work tree: it checks first and offers `git init` (the scaffold commit
   becomes the root commit), and `scripts/bootstrap.mjs` refuses to run outside one.
2. Open it in Claude Code and accept the workspace trust dialog. Until you do, Claude Code
   ignores the `permissions.allow` list in `.claude/settings.json` (the hooks still run), so
   a headless `claude -p` run in a fresh clone falls back to its permission mode for every
   command. A headless `claude -p` run also stops background agents after ten minutes unless
   `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is set in its environment. Check that the hooks
   run: ask Claude to run `cat ~/.netrc` and expect a refusal that names the guardrail (a
   refusal of `.env` alone could come from the permission rules even with dead hooks).
3. Run `/bootstrap-project`. It takes a pasted product brief (fills the forms in one shot, asks
   only the gaps) or walks the product forms in `.doc/`; it fetches the catalog,
   asks which stack and which flags and capabilities its templates declare, scaffolds the
   packages, removes the harness's own plans from `.plan/` (a product's first plan is `001`),
   resolves the auth text in `.doc/`, runs every gate with `scripts/verify.mjs`, writes the
   first backlog lines, and asks to commit the scaffold (including `.fullstack/catalog.yaml`).
   Budget 15 minutes, most of it installs.
4. Run `/dev-loop` for the first task; it starts from a clean tree, so commit the scaffold
   first. Approve the plan by editing its `Status:` line; review the reports in
   `.orchestrate/<slug>/` before you commit.

## How work moves

1. A task is one line in `.plan/000-backlog.md`.
2. The orchestrator drafts the plan into `.orchestrate/<slug>/plan.md`, with a `UX` line per route (pattern, primary action, states, tone). You approve the draft; the driver then cuts the task's branch and promotes it to `.plan/NNN-YYYY-MM-DD-<slug>.md`. Once a task's implementers are running, the orchestrator plans the next backlog line in the background.
3. The backend agent implements the plan's Contract and regenerates the server's contract (the
   contract stage); then the backend and frontend agents work in parallel, the frontend
   regenerating its types and implementing the feature. Both test first. After e2e has captured the screens, the frontend agent runs a UI pass: it reads three screenshots per route (phone light, phone dark, desktop light) against the `ui-design` rubric and fixes what fails.
4. `node scripts/verify.mjs --plan <plan> --reuse` runs the gates and writes
   `.orchestrate/<slug>/verify.json` (run in the background; it can outlive a foreground
   timeout). When the data-layer task adds `testDb` and `migrate`, the driver records them in
   `.fullstack/catalog.yaml` from the backend's `Commands:` line first.
5. One reviewer (plus a security reviewer when `verify.json` says `security.triggered`) and QA
   run in parallel. P0 and P1 findings go back to the implementer, at most two fix rounds, each
   re-reviewed on its own diff. QA adds adversarial tests, runs a UX pass over the same screenshots (a rubric failure is a P2; a broken journey or a WCAG AA failure is a P1), and checks each acceptance
   criterion with evidence.
6. The driver writes the change log, runs `verify` once more on the final tree, and checks that
   `git write-tree` equals the verified tree, then you decide whether to commit. Role agents never
   commit, merge, push or rewrite history; the driver commits only on your yes.

The whole procedure is in `.claude/skills/dev-loop/SKILL.md`; the rules every agent
follows are in `AGENTS.md` and `.claude/rules/`.

## Repository map

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Rules, stack, architecture, definition of done; the single source of truth |
| `CLAUDE.md` | Loads `AGENTS.md` into Claude Code |
| `catalog.lock` | The pinned catalog version: repository, tag, commit |
| `.fullstack/catalog.yaml` | Stack, templates, flags, commands and ports per package; written by the bootstrap |
| `<package>/AGENTS.md` | Shipped by the template: the package's layer map and its agent-facing sections |
| `.doc/` | Product definition, architecture, glossary: fill-in forms |
| `.plan/` | Backlog and one plan per task (promoted from the draft) |
| `.claude/agents/` | Role definitions |
| `.claude/rules/` | Conventions: code style, naming, UI and styling, git workflow |
| `.claude/skills/` | Procedures: bootstrap, dev loop, plans, tests, UI design, API, errors, database, deployment, review, release |
| `.claude/hooks/` | Guardrails, wired by `.claude/settings.json` |
| `scripts/bootstrap.mjs` | Fetches the catalog pinned in `catalog.lock` and runs its generator |
| `scripts/verify.mjs` | The gate: every package's checks, writing `verify.json` |
| `.orchestrate/<slug>/` | Generated by the loop (draft `plan.md`, reports, reviews, ticket, `verify.json`); git-ignored |
| `.cursor/`, `.github/copilot-instructions.md` | Pointers to `AGENTS.md` for other tools |

## Adding a module

1. Follow `backend/AGENTS.md › Adding a module`.
2. It explains the shipped reference module, the copy-and-rename recipe and the two lines
   that mount and register a module.
3. Run the package's `contract` then `check` commands.

## Guardrails and recovery

The hooks in `.claude/hooks/` fail closed: a hook that crashes, times out or cannot start
blocks the tool call. If `node` is missing from Claude Code's `PATH`, every tool call
(Read and Edit included) is blocked until that is fixed. To recover, put
`{ "disableAllHooks": true }` in `.claude/settings.local.json` (git-ignored) or edit
`.claude/settings.json` by hand, then restore the hooks once `node` resolves. On a
Claude Code older than 2.1.295 the hooks run but fail open, so upgrade before relying on
them.

The hooks have a test suite: `node --test ".claude/hooks/test/*.test.mjs"`. Any change to
`.claude/hooks/` must pass it.

## Optional integrations

- **Linear**: set `tracker: linear` in the backlog header and add the Linear MCP server
  to a `.mcp.json`; the loop falls back to local ticket files when the tool is absent.
- **Figma**: add a `figma:<url>` marker to a backlog line and the Figma MCP server; the
  frontend agent reads the frame when the tool is present.

## Updating the harness in an existing project

Harness files (`AGENTS.md`, `.claude/`, `scripts/`, `catalog.lock`) are plain files; pull
them from a newer template and review the diff. A lock bump changes only what the next
bootstrap generates; an already generated project keeps its packages and their `AGENTS.md`.

A project scaffolded before the catalog has no `.fullstack/catalog.yaml`, and its
`backend/AGENTS.md` lacks the sections the new agents point at, so it stays on the
pre-catalog harness (the last commit before this change). The pointers in the harness name
sections of the catalog version the lock pinned when the project was generated. A project
whose `.fullstack/catalog.yaml` records a 1.x frontend stays on the harness commit before
this change: the pointers now name the frontend foundation of catalog v1.4.0.

A project updated to this harness ticks the boxes of `## Ready to plan` in
`.doc/product-definition.md` that hold and fills its `Design` section before the next loop;
the dev loop refuses to start otherwise.

After bumping `catalog.lock`, before merging:

1. Grep the harness text (`AGENTS.md`, `README.md`, `.claude/`, `.doc/`, `scripts/`) for the old version's
   paths, rule names and command names.
2. Update every hit to the new template's `AGENTS.md`, or record why it stays.
3. Run the hooks tests and `node scripts/verify.mjs` on a project generated from the new lock.

To try an unreleased catalog, use `--templates <path>` or `FULLSTACK_TEMPLATES_DIR`.


---
name: bootstrap-project
description: Turn a fresh clone of this harness into a running full-stack project. Use when .fullstack/catalog.yaml does not exist yet, when the user asks to "start the project", "set up the app", "create the full-stack project" or "bootstrap", or when .doc/ still holds FILL markers. Walks the product forms, picks a stack from the template catalog, asks the flags and capabilities its templates declare, runs scripts/bootstrap.mjs, verifies every gate, and writes the first backlog line.
---

# Bootstrap a project

Runs once per project, in the interactive session (no role agent). The harness owns no
templates: `catalog.lock` pins a release of the template catalog, and the bootstrap runs
that catalog's generator. This skill supplies the product, the stack choice and the
database decision, and proves the result works. Prerequisites: Bun 1.4+, Node 24+, git, and each chosen template's own tools.

## 1. Decide the product with the user

Open `.doc/product-definition.md`. For each `<!-- FILL: … -->` marker, in order, ask the
user one question at a time and replace the marker with their answer. Keep answers in
their words; suggest a default only when they ask. Do the same for `.doc/architecture.md`
(Data store, Data Model, Data migrations, API versioning, Auth, External Dependencies,
Deployment) and
`.doc/glossary.md` (one row per entity named in the scope).

The Data store question is the `database` skill's: engine, client library, or decide
later. Record the answer as given (the engine the user names, or "decide later", plus the
client library); whether the server template lists a provider is a separate fact, settled
in section 2. When the engine the user names is one the template lists, section 2 passes it
and the generator wires it; the Data store section is then filled from what was generated
(see section 5).

The Auth question decides a flag: a product with no accounts (Auth: none) is scaffolded
with `--flag auth=false`; any other answer keeps the server template's authentication (its
`auth` flag on, the default). For `none`, replace the whole body of `.doc/architecture.md`
Auth (the shipped default and the roles marker describe code that will not exist) with:

```
- Auth: none. The product has no accounts and every endpoint is public. Adding accounts is
  a planned change; a scaffold with the `auth` flag on is the reference.
- Client model: the frontend's server is the backend's client (no browser fetch). CORS is off
  unless `CORS_ORIGINS` is set. Rate limits key on the client address, so the frontend
  forwards `X-Forwarded-For` and the backend runs with `TRUST_PROXY` set.
```

Stop when the "Ready to plan" checklist in the product definition is satisfied. Do not
start the scaffold while a marker remains in a section the checklist names.

## 2. Choose the stack

```bash
node scripts/bootstrap.mjs --fetch
```

It prints `catalog: <path>` and then `index.yaml`. Present the `stacks:` entries (id and
summary) and ask which one. For the chosen stack, Read `<catalog>/stacks/<id>/stack.yaml`
(its `packages:` list: a `template` path and a `dir` each) and each package's
`<catalog>/<template path>/template.yaml`. Ask every flag the templates declare (show its
`summary` and `default`) and every capability that lists providers. Map the answers to
`--flag <name>=<true|false>` and `--capability <kind>=<provider>`. Ask the database
provider here when the template lists one (`capabilities.database.providers`). When the
user named an engine in section 1 that the template lists, the provider fixes the client
library (the package's `AGENTS.md › Adding the data layer` names it): tell the user and
confirm. On a yes, pass `--capability database=<id>`; the data-layer backlog line is then
NOT written, because the generator wired the engine. On a no, pass no capability and write
the data-layer backlog line.

Before scaffolding, check each chosen template's `tools` (name and minimum version, from
its `template.yaml`) against the machine, for example `uv --version` for a Python backend.
Name any missing or old tool and stop with its install hint; do not scaffold. The generator
runs the same check as its preflight, so this is the early, friendly one.

These three files are the only things this skill reads under the catalog path. Never Glob,
Grep, list or explore the catalog cache and never dispatch an Explore agent into it; it is
outside the working tree on purpose.

## 3. Scaffold

```bash
node scripts/bootstrap.mjs --stack <id> --name <project-name> [--flag k=v]… [--capability k=v]…
```

It creates the packages the stack lists, under the directories the stack names; a merged
`docker-compose.yml` and `.gitignore`; `.editorconfig` when absent; and
`.fullstack/catalog.yaml`, the provenance file (per package: template, version, flags,
capabilities, commands and ports; and the top-level `providers` map, which is empty when
none was chosen). When a provider was chosen it also adds the provider's service to `docker-compose.yml`,
`db/` with the database init script, and the connection variable in the server's
`.env.example`. It installs each package and runs its `contract` and `format`
commands. It refuses to run twice. A failure before the move leaves nothing to clean: the
generator stages the output and moves it into place all or nothing (a failed move is rolled back).

## 4. Verify, in this order

Open `.fullstack/catalog.yaml`. Run each command from its package directory.

Without a provider:

1. Each package's `check`.
2. For a package that declares `testE2e`, the browser install its `AGENTS.md › Tests`
   names, then `testE2e`.

With a provider (a non-empty `providers` map, e.g. `providers: { database: <id> }`;
`providers: {}` means none):

1. Each package's `check` (no Docker needed).
2. `docker compose up -d --wait <service>` (the provider's service, named in
   `docker-compose.yml`).
3. The server package's `migrate`, then its `testDb`, each only when the package's commands
   list it.
4. For a package that declares `testE2e`, the browser install, then `testE2e`.

The order matters: the server connects its database before it listens, and the e2e suite
starts the server. Every command must exit 0. If one fails, fix the
cause (not the gate), re-run it, and tell the user what was wrong. A failing gate on a fresh
scaffold is a catalog bug: say so explicitly, name the template and version from the
provenance file, and record it in the final message.

Then start each package's `dev` command and open the frontend's `http.health` path on its
`http.port`: the page must reach the server (for a Next.js frontend, the API version pill
proves the typed client reaches it).

A fresh server package has: health, the commented reference module, and authentication when
the `auth` flag is on. Its store is either the in-memory store (nothing survives a restart
until the data-layer task) or, when a provider was chosen, the wired engine with its
migrations and test database, described in the package's `AGENTS.md › Adding the data
layer`. Production secrets are listed in the package's `.env.example`; development runs
with defaults and warns.

## 5. First backlog lines

Follow the grammar at the top of `.plan/000-backlog.md`. When no database provider was
passed at generation, the first line is `- [ ] add the <engine> data layer | stack:backend`
for a named engine, or `- [ ] add the data layer | stack:backend` when the answer was
"decide later" (the `database` skill says what that task delivers). With a provider, the
first line is the first in-scope capability from the product definition; without one it is
the next line. Set `tracker:` in the backlog header to `linear` or `none` as the user prefers. Fill the
`Stack` row of the components table in `.doc/architecture.md` from `.fullstack/catalog.yaml`:
the stack id and, per package, its directory, template and version. When a provider was
passed, fill the Data store section from what was generated: engine and version from the
provider service's image in `docker-compose.yml` (or the package's `AGENTS.md › Adding the
data layer`), the client library and the local service (the provider's Compose service and
its connection variable) from the package's `AGENTS.md › Adding the data layer` and
`.fullstack/catalog.yaml`.

## 6. Branch, commit gate and hand over

Create `chore/bootstrap` (never commit on `main`) and summarise what exists. Then ask the
user whether to commit the scaffold as `chore(bootstrap): scaffold <project-name>`,
including `.fullstack/catalog.yaml`; the dev loop starts only from a clean tree, so the
first task waits for this commit. Commit only on their yes, then point them to `/dev-loop`
for the first task.

## What this skill never does

- Run any scaffolder inside an existing package.
- Browse the catalog cache.
- Edit `scripts/`, `.claude/`, `catalog.lock` or other harness files.
- Create a real env file; secrets stay in the shell environment.
- Install a database client or start a database service. The exception: a provider chosen
  at generation was wired by the generator, and its Compose service is started with
  `docker compose up -d --wait <service>`.

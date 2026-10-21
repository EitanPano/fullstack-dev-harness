---
name: bootstrap-project
description: Turn a fresh clone of this harness into a running full-stack project. Use when frontend/ or backend/ does not exist yet, when the user asks to "start the project", "set up the app", "create the full-stack project" or "bootstrap", or when .doc/ still holds FILL markers. Walks the product forms, asks which database engine the product uses, runs scripts/bootstrap.mjs, verifies every gate, and writes the first backlog line.
---

# Bootstrap a project

Runs once per project, in the interactive session (no role agent). Everything the
scaffold decides (framework, layout, configs) is fixed by `AGENTS.md` and `templates/`;
this skill supplies the product, the database decision, and proves the result works.

## 1. Decide the product with the user

Open `.doc/product-definition.md`. For each `<!-- FILL: … -->` marker, in order, ask the
user one question at a time and replace the marker with their answer. Keep answers in
their words; suggest a default only when they ask. Do the same for `.doc/architecture.md`
(Data store, Data Model, API versioning, Auth, External Dependencies, Deployment) and
`.doc/glossary.md` (one row per entity named in the scope).

The Data store question is the `database` skill's: Postgres, MongoDB, or decide later,
plus the client library. The harness ships no database; the answer decides the first
backlog task, not the scaffold.

The Auth question decides the scaffold: a product with no accounts (Auth: none) is
scaffolded with `--auth none`; any other answer keeps the template's authentication
(`--auth full`). For `none`, replace the whole body of `.doc/architecture.md` Auth (the
shipped default and the roles marker describe code that will not exist) with:

```
- Auth: none. The product has no accounts and every endpoint is public. Adding accounts is
  a planned change; the harness's `--auth full` scaffold is the reference.
- Client model: the Next.js server is the backend's client (no browser fetch). CORS is off
  unless `CORS_ORIGINS` is set. Rate limits key on the client address, so the frontend
  forwards `X-Forwarded-For` and the backend runs with `TRUST_PROXY` set.
```

Stop when the "Ready to plan" checklist in the product definition is satisfied. Do not
start the scaffold while a marker remains in a section the checklist names.

## 2. Scaffold

```bash
node scripts/bootstrap.mjs --name <project-name> --auth <full|none>
```

The script refuses to run twice. `--auth none` leaves out authentication: the `auth` and
`user` modules, sessions, JWT, OTP, cookies, their jobs, subscribers, tests and secrets;
the reference module's endpoints are public. It creates `frontend/` (pinned `create-next-app` plus the
`templates/frontend` overlay), `backend/` (from `templates/backend`), `docker-compose.yml`
and `.editorconfig`, installs dependencies, generates `backend/openapi.json` and
`frontend/src/lib/api/schema.d.ts`, and formats both packages.

## 3. Verify, in this order

```bash
cd backend && bun run check
cd ../frontend && bun run check
bun x playwright install chromium && bun run test:e2e
```

Every command must exit 0. If one fails, fix the cause (not the gate), re-run it, and
tell the user what was wrong. A failing gate on a fresh scaffold is a harness bug: say so
explicitly and record it in the final message so it can be fixed in `templates/`.

A fresh backend has: health, the commented reference module `api/module/` +
`models/module/` (delete both and its line in `config/routes.ts` if unwanted), the memory
store (nothing survives a restart until the data-layer task), the scheduler and the bus.
With `--auth full` it also has authentication (register, login, logout, refresh, OTP) and
the `user` module, and production needs `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
`OTP_SECRET`. `ENCRYPTION_KEY` is needed in production either way; development runs with
defaults and warns.

Then start both servers once and open `http://localhost:3000`: the home page must show
the API version pill, which proves the typed client reaches the backend.

```bash
cd backend && bun run dev      # port 4000
cd frontend && bun run dev     # port 3000
```

## 4. First backlog lines

Follow the grammar at the top of `.plan/000-backlog.md`. When an engine was chosen, the
first line is `- [ ] add the <engine> data layer | stack:backend` (the `database` skill
says what that task delivers). The next line is the first in-scope capability from the
product definition. Set `tracker:` in the backlog header to `linear` or `none` as the user
prefers.

## 5. Branch, commit gate and hand over

Create `chore/bootstrap` (never commit on `main`) and summarise what exists. Then ask the
user whether to commit the scaffold as `chore(bootstrap): scaffold <project-name>`; the dev
loop starts only from a clean tree, so the first task waits for this commit. Commit only on
their yes, then point them to `/dev-loop` for the first task.

## What this skill never does

- Run any scaffolder inside an existing `frontend/` or `backend/`.
- Edit `templates/`, `scripts/` or `.claude/`; those are harness files.
- Create a real env file; secrets stay in the shell environment.
- Install a database client or start a database service; that is the data-layer task.

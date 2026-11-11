# The scaffold step

Read this when the plan's `Scaffold:` is not `none`: right after the branch is cut, before the
draft is copied to `.plan/`. Read the arguments from the draft, `.orchestrate/<slug>/plan.md`.

1. Run `node scripts/scaffold.mjs <the line's arguments> --slug <slug>`.
2. Exit 0: run `verify` on the result, then ask for the commit (under delegated approval, make
   it) with the line the script printed. The plan's `Base:` is then that commit.
3. Exit 1: the script ran nothing else, left merge markers and wrote
   `.orchestrate/<slug>/scaffold/conflicts.md` (path, package dir, owning role) and `state.json`.
   Dispatch each conflicted file to its owning role agent to resolve the markers, run
   `node scripts/scaffold.mjs --complete --slug <slug>` (it refuses leftover markers, then
   finishes as exit 0 does), then go on as in step 2.
4. Any other refusal (dirty tree, lock mismatch, a removal): stop and report it.
5. Fill the table below, and the README per its blocks (the script wrote the command blocks).

## What a part writes

The bootstrap's section 5 and every later scaffold use this table. Write only the rows of the
parts just added.

| Row in `.doc/architecture.md` | Text |
| --- | --- |
| `Stack`, components table | From `.fullstack/catalog.yaml`: the stack id; per package its directory, template and version; for a frontend, the reason (the Search and sharing answer). |
| Auth › Client model marker | A lone frontend: `n/a: no server yet`; a later scaffold replaces it. Server-rendered (Next): the frontend's server is the backend's client (no browser fetch). CORS is off unless `CORS_ORIGINS` is set. Rate limits key on the client address. The opt-in `CLIENT_IP_HEADER` makes the frontend forward the visitor's address (`deployment`, section 6); without it all visitors share one rate-limit bucket, about 30 active signed-in visitors per 15 minutes. Single-page app (React, Angular, Vue): the browser calls `/api` on the page's own origin (the server in `single`, the frontend image's proxy in `split`), so there is no CORS and no API URL in the bundle. Rate limits key on the client address, so `TRUST_PROXY` is the hop count in front of the server (`false` in `single` locally, `1` in `split`). |
| Operational Concerns › Deployment | `n/a: no server yet` for a lone frontend, replaced by a later scaffold. The deploy mode (the top-level `deploy:` of `.fullstack/catalog.yaml`; "n/a" without one) and the local `TRUST_PROXY` default (`false` in `single`, `1` in `split`). |
| Data store section and the components table's `Data store` row | With a provider: engine and version from the provider service's image in `docker-compose.yml` (or the package's `AGENTS.md › Adding the data layer`); the client library and the local service (the provider's Compose service and its connection variable) from that section and `.fullstack/catalog.yaml`. Lone frontend: `n/a: no server yet`, replaced by a later scaffold. Server without a provider: `none yet: the data-layer task writes it` in the `Local service` line and that row, so the first task is not blocked by them. |

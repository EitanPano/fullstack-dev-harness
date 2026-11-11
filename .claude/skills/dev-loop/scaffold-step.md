# The scaffold step

Read this when the plan's `Scaffold:` is not `none`: right after the branch is cut, before the
draft is copied to `.plan/`. The arguments are in the draft, `.orchestrate/<slug>/plan.md`.

1. Run `node scripts/scaffold.mjs <the line's arguments> --slug <slug>`. The driver does every
   step; no role agent runs before the draft is promoted.
2. Exit 0: fill the table below and the README blocks, run `node scripts/verify.mjs --out .orchestrate/<slug>/scaffold`, then ask for the
   commit (under delegated approval, make it) with the line the script printed. The plan's
   `Base:` is that commit.
3. Exit 1: `.orchestrate/<slug>/scaffold/conflicts.md` lists the conflicts. With markers, keep the
   product's change and take the part's. A line without markers (deleted here and changed by the
   part, binary, add/add) is a keep-or-delete decision; the part's copy is at
   `.orchestrate/<slug>/scaffold/next/<path>`. Tick each line `- [x]`, then run
   `node scripts/scaffold.mjs --complete --slug <slug>` (plus `--templates <path>` if the run had
   it). It refuses leftover `<<<<<<< project` or `>>>>>>> next` lines and unticked lines. Then
   go on as in step 2.
4. Exit 3: a command failed. If the generator failed, nothing was written: fix it and rerun. If
   a package command failed after the merge, fix it, then run `--complete`.
5. Exit 2: a refusal (dirty tree, lock mismatch, a removal, a bad request): stop and report. To
   abandon a written scaffold, ask the user to restore the tree; hooks refuse it to agents.

## What a part writes

The bootstrap's section 5 and every later scaffold use this table, for the parts just added.

| Row in `.doc/architecture.md` | Text |
| --- | --- |
| `Stack`, components table | From `.fullstack/catalog.yaml`: the stack id; per package its directory, template and version; for a frontend, the reason (the Search and sharing answer). |
| Auth › Client model marker | A lone frontend: `n/a: no server yet`. Server-rendered (Next): the frontend's server is the backend's client; CORS is off unless `CORS_ORIGINS` is set; rate limits key on the client address, and without the opt-in `CLIENT_IP_HEADER` (`deployment`, section 6) all visitors share one bucket (about 30 active signed-in visitors per 15 minutes). Single-page app: the browser calls `/api` on the page's own origin (the server in `single`, the frontend image's proxy in `split`): no CORS, no API URL in the bundle; `TRUST_PROXY` is the hop count in front of the server (`false` in `single` locally, `1` in `split`). |
| Operational Concerns › Deployment | Lone frontend: `n/a: no server yet`. Else the deploy mode (`deploy:` in `.fullstack/catalog.yaml`) and the local `TRUST_PROXY` default (`false` in `single`, `1` in `split`). |
| Auth section, glossary | Auth on (`--flag auth=true`): rewrite the Auth section and add the glossary rows `session`, `caller`, `OTP`, `target` from the server package's `AGENTS.md › Authentication`. Off: leave "Auth: none". |
| Data store and Data migrations sections, the components table's `Data store` row | With a provider: engine, version, client library, Compose service and connection variable from `docker-compose.yml`, the package's `AGENTS.md › Adding the data layer` and `.fullstack/catalog.yaml`; who runs `migrate` in production. Lone frontend: `n/a: no server yet`. Server without a provider: `none yet: the data-layer task writes it` in `Local service`, the row and Data migrations. |

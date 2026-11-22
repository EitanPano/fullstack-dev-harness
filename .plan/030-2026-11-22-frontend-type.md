# Frontends by type: several frontend packages, each in a typed directory

Status: active
Owner: Eitan
Last updated: 2026-11-22
Input: Eitan's brainstorm of 2026-11-22, which began as a surface rules table keyed on
`frontend/<surface>/`, and his rulings the same day: packages-first; "instead of naming it
frontend, rename it to the relevant service type"; the types `site`, `platform`, `app`, `admin`;
"each app should be named `app-<toolName>/`" when a product has several; "only the `/api/admin/`
folder should hold the admin related APIs"; "if Cloudflare tells developers to start using
Workers instead of Pages then update it as well as part of this plan"; "the first deployments
should include all inside 1 worker. Only after some traffic has been monitored and the business
decision is to scale, then the project will be required to scale and migrate to module per
worker. API should be modular for these scaling updates."
Cloudflare's documentation, read on 2026-11-22: the Pages page opens with "Start new projects
with Workers", Workers being "Cloudflare's primary platform for building applications". Pages is
not marked deprecated and has no end date
(`developers.cloudflare.com/pages/`, `…/workers/static-assets/migration-guides/migrate-from-pages/`).
Reference project: a private project on the stack `astro-cloudflare`, read on 2026-11-22 (never
named in a harness or catalog file). It has a public site and an owner console in one frontend
package, a customer app to come, and a backlog line that waits for this plan.
Scope ruling: this repository, on its feature branch, and the catalog
(`C:/Dev/Playground/AI/fullstack-templates`), in scope by Eitan's word ("activate the plan and
access to catalog", 2026-11-22). The reference project is read-only evidence; its rename and its
console move are its own plans.
Approval: active by Eitan's word of 2026-11-22 (G1). Commits, pushes and pull requests still wait
for his word each time.
Branches:
- harness `feat/frontend-type`, cut from `dev` f53732b on 2026-11-22; PR into `dev`;
- catalog `feat/frontend-type`, to be cut from its `dev` at G2; PR into `dev`. The lock bump
  follows the release as its own pull request (H10).
Base: harness f53732b
Stages: catalog work, harness scripts and docs. No role agent runs. Lean process (2026-11-11):
Sonnet implementers, cheap gates per task, one review per branch at the end, the new cases with
e2e once.

## Goal

A project can hold several frontend packages, each in a directory named for its type, and the
bootstrap, `scaffold`, `verify`, the write lanes, the README and the dev loop work per package.
After this plan:

- a new project's frontend is created at `site/`, `platform/`, `app/` (or `app-<tool>/`) or
  `admin/`, never at `frontend/`;
- `serverless/cloudflare` is one Worker with static assets, no longer Pages Functions: it serves
  the API, the scheduled job and every frontend, each frontend on its own host;
- its API is built from modules that can each move to a Worker of their own later, without a
  rewrite;
- `scripts/scaffold.mjs` adds a second frontend to a project on the `astro-cloudflare` stack;
- admin endpoints have one home, `/api/admin/` in the server's `api/admin/`, and a change there
  asks for the security review;
- a project with one frontend, typed or at the older `frontend/`, pays nothing extra.

## Scope

**In** (catalog, `v1.15.0`): ADR 0015 and ADR 0016; the generator's support for several frontends
at requested directories; `serverless/cloudflare` 2.0.0 on Workers, serving a named frontend;
`frontend/astro` as a second frontend; the `api/admin/` folder in all three server templates; the cases, guides, READMEs and
changelogs.

**In** (harness): this plan; H1 to H9; the lock bump H10 and P1 after the release.

**Out** (each arrives by need, as a later plan or a project's own task):

- A second frontend beside a `server` package (Compose): `single` serves one build. The generator
  and `scaffold` refuse it and say why.
- A shared UI or code package. Each frontend generates its own typed client from the contract.
- A generated client that leaves out `/api/admin/*` (question 2).
- A second `site`, `platform` or `admin`; an API namespace per app (`/api/app-<tool>/`).
- A command that renames a package. An existing `frontend/` stays valid; a project that wants
  `site/` moves it by hand.
- Sign-in on `serverless/cloudflare`, and a single-page template beside it (the customer app's
  plan).
- A module in its own Worker, or a Worker per frontend. The guide carries the recipe; a project
  does it once it has measured its traffic and decided to scale (Eitan, 2026-11-22).
- A project's own move from Pages Functions to the Worker. The template's guide carries the
  recipe; the move is that project's plan.
- A second line of `serverless/cloudflare` that stays on Pages.

## Assumptions

- "frontend" stays the template kind (`frontend/astro`), the agent, its report
  (`.orchestrate/<slug>/frontend.md`) and the backlog marker. Only the directory is typed.
- The directory carries the type; no `type:` line is recorded. `app-<tool>` takes a kebab-case
  glossary term.
- A stack's `dir: frontend` stays in the catalog. `scaffold` rebuilds a project's BASE from its
  record (`baseArguments`), so an existing project must still generate at `frontend/`. A typed
  directory always comes from the request. (This replaces the design's "`defaultDir` no longer
  answers `frontend`".)
- The type suggests a template and restricts none: the reference project's console runs on Astro
  with islands. Scripts check the directory's name and change no behaviour by type.
- The bootstrap proposes the first frontend's type from the brief (search yes and no sign-in:
  `site`; search yes with sign-in: `platform`; search no: `app`) and shows it with the stack.
- One brand and one Design brief serve every frontend.
- The design's pieces 1 and 2 are one plan: a second frontend's e2e on `astro-cloudflare` cannot
  pass until the functions package serves that frontend's build.
- The hooks need no logic change: `lanes.mjs` already derives a lane from every recorded
  `frontend` package at a one-segment directory, and the wrangler guard already lets a sub-agent
  run `wrangler dev` with `--config` and refuses `wrangler deploy`.
- One Worker holds one asset directory, so `assemble` puts each frontend's build under its own
  directory there and the Worker picks the frontend by the request's host (the product
  definition's `Frontends` row names it; locally `<dir>.localhost`). An unknown host gets 404
  for a page; `/api/*` outside the admin namespace answers on any host (S1: a Node-side
  readiness check cannot resolve `<dir>.localhost` on Windows).
- With one frontend, static files are served without running the Worker, as today. With several,
  every request runs it (`run_worker_first`): the price of one Worker, paid in billed requests.
- With a host per frontend, `/api/admin/*` answers on the `admin` frontend's host alone, 404
  elsewhere, so an edge login in front of that host covers every admin route.
- "All inside one Worker" includes the scheduled job: the `jobs` flag adds a `scheduled` handler
  and a cron trigger to the same Worker, where Pages needed a second one.
- On Workers, `_headers` and `_redirects` stay as files in the asset directory and `_routes.json`
  becomes `assets.run_worker_first`.
- Workers cannot take a custom domain outside a Cloudflare zone (Pages can); the guide says so.
- The admin gate is the same in every environment and has no development switch. Development
  differs only in how the admin signs in (a local key or test login the template names);
  `api-design` says so with the namespace rule.

## Open Questions

1. One argument for the generator, the bootstrap and `scaffold`: a repeatable
   `--frontend <dir>=<template>`? A lone frontend is then `--frontend site=frontend/astro`, a
   stack takes its frontend's directory from it, and a later run adds another. Recommended: yes,
   one spelling in all three; a flag two packages declare (`islands` on two Astro frontends) is
   given as `--flag <dir>:<name>=<bool>`.
   > A (Eitan, 2026-11-22). The per-package flag is the harness's spelling only: `scaffold` and
   > the bootstrap write it into the answers file, which the generator already reads per package.
2. The design had a non-admin frontend's generated client leave out `/api/admin/*`. Build it now?
   Recommended: no. A bundler already drops client calls nobody imports, so no admin request
   ships in a public bundle; the gain left is a compile error on a wrong call, for a flag in five
   templates. `api-design` states the rule in words; a filter follows if a review finds a call.
   > Leave them in (Eitan, 2026-11-22). He asked whether such a call should work in development
   > only: no environment decides it. The gate refuses it everywhere (next assumption).
3. The server's `api/admin/` folder needs the template's boundary lint to accept a nested module.
   Do `bun-express` and `python-fastapi` get it now? Recommended: no, only `serverless/cloudflare`,
   which the reference project uses. The other two get it with their first admin frontend.
   > All server types: "admin related routes should always sit under /api/admin/ on all server
   > types" (Eitan, 2026-11-22). C5 covers both servers.
4. A Worker has no file-based routing. What routes requests in `serverless/cloudflare` 2.0.0?
   (a) A `routes.ts` in each module on Hono, the usual Workers router: the module shape of the
   other two servers, and `functions/` goes. (b) Keep `functions/` and compile it with
   `wrangler pages functions build`, which Cloudflare keeps available: the smallest change, on a
   command of the product it steers away from. Recommended: (a).
   > (a) (Eitan, 2026-11-22), with one Worker first and modules that can scale out later.

## Steps

### Gates

| Gate | What | Who |
| --- | --- | --- |
| G1 | `Status: active`, the questions answered, the catalog named in scope | Eitan |
| G2 | S1 done, ADR 0015 and ADR 0016 accepted, catalog branch cut | Eitan accepts the ADRs |
| G3 | Both branches reviewed, pull requests into `dev` | Eitan merges |
| G4 | Catalog `v1.15.0` released | Eitan tags |
| G5 | H10 and P1 | Eitan merges |

### Spike

S1. Cloudflare's documentation and a local `wrangler dev`, no account: one Worker, one asset
directory with a folder per frontend, the host mapped to its folder through the `ASSETS`
binding. Per frontend, check what still applies when the Worker fetches the file: `_headers`
(the policy line `assemble` writes), `_redirects`, the 404 page, and a single-page fallback.
What does not apply, the Worker sets itself. The answer sets C3. The first deployment stays the
proof, as today.

> Done 2026-11-22 (wrangler 4.163.0, hono 4.13.20; the table is in ADR 0016). Pass: the host
> reaches the Worker; `_headers`, `_redirects` and the nearest `404.html` apply per folder to a
> file fetched through `ASSETS`; the scheduled handler runs beside assets; one frontend needs no
> Worker code for pages. Found: a redirect's `Location` carries the folder (the Worker removes
> it); a `_headers` or `_redirects` file inside a folder is served as text (`assemble` merges it
> into the root file and never copies it); Node and Bun do not resolve `<dir>.localhost` on
> Windows, a browser and curl do (a Node-side check uses `127.0.0.1` and sets the host header).

### Catalog

| Task | What |
| --- | --- |
| C0 | ADR 0015, "Several frontends, by directory": the request argument, the plan's list of frontends, flags per package, ports, the non-goals above. ADR 0016, "One Worker with static assets in place of Pages Functions": Cloudflare's statement, the router (question 4), one Worker for everything and the host per frontend (S1), what keeps a module able to move to its own Worker, what a project on 1.0.0 does |
| C1 | Tools: `tools/lib/plan.ts` holds a list of frontends in place of `frontendDir`; the request names each frontend's directory (question 1); `package-dir.ts` refuses a second frontend beside a `server` package; two frontends never share a dev port (the later one takes the next free port, recorded); `provenance.ts` records each. A flag two packages declare already goes per package in the answers file |
| C2 | `serverless/cloudflare` 2.0.0, one frontend first: a Worker entry that only mounts; a `routes.ts` in each module on Hono, mounted at `/api/<name>`, in place of `functions/`; `wrangler.jsonc` with `main`, `assets` (directory, the `ASSETS` binding, `run_worker_first`) in place of the Pages keys and `_routes.json`; the `jobs` flag as a `scheduled` handler and a cron trigger in the same Worker, `workers/jobs/` gone; `dev` and `start` on `wrangler dev`; `assemble` keeps the header merge and the policy line; the tests in workerd; the existing cases pass again |
| C2b | Modules that can move out: a module imports another only through its controller; a controller another module calls is async and takes and returns plain data, so a service binding can stand in for it; no state shared in memory between modules; the boundary lint and a test that mounts each module's router alone hold it |
| C3 | Several frontends on that Worker: `assemble` puts each build under its directory and merges each frontend's `_headers` and `_redirects` into the root files behind its folder (S1); the host map in the env module and `.env.example`; the Worker serves the host's frontend and removes the folder from a redirect's `Location`; `/api/*` on every host, `/api/admin/*` on the `admin` host alone; the admin gate refuses every request until the product writes its own (ADR 0015 A1); the boundary lint accepts `server/api/admin/<module>/`; the guide names that folder, the `/api/admin` prefix and the gate first in the chain |
| C4 | `frontend/astro` 1.1.0: its e2e starts the API with its own directory; it reads its port from the record; it generates as a second frontend |
| C5 | `server/bun-express` and `server/python-fastapi`, a minor each: the boundary lint accepts `api/admin/<module>/`; the guide names the folder, the `/api/admin` prefix and the role gate on the router's mount (with the `auth` flag) |
| C6 | Cases: `astro-cloudflare` with `site` and `admin` (islands on `admin`), e2e once; one frontend at a typed directory; `react-bun-express` at `app` in `single` and `split` (the Compose profile is also named `app`); an admin module in each server template; every case outside `serverless/cloudflare` unchanged |
| C7 | Guides, READMEs, changelogs, `docs/conventions.md`, `index.yaml`; `DEPLOYMENT.md` rewritten for Workers Builds and `wrangler deploy`; the functions guide gains "Moving from Pages Functions", after Cloudflare's own guide, and "Scaling out" (a module in its own Worker: its entry, its route, a service binding for the controllers it calls; when to do it) |
| C8 | One review of the branch, one fix wave, the pull request |

### Harness

1. `scripts/provenance.mjs` — `isFrontendDir(dir)`: `site`, `platform`, `admin`, `app` or
   `app-<tool>`. The one place the type names live in code.
2. `scripts/scaffold/request.mjs` — `parseArgs` takes `--frontend` and the per-package flag;
   `checkRequest` accepts a new frontend whose directory is typed, free and not nested, refuses
   one beside a `server` package, and lets a stack join a lone frontend at a typed directory;
   `baseArguments` and `nextArguments` pass each recorded frontend that is not at its default
   directory; `USAGE`.
3. `scripts/bootstrap.mjs` — `--frontend`; a new project's frontend must be typed (a
   `--template frontend/<id>` is refused, naming `--frontend`); `printDeploySteps` lists each
   frontend's port.
4. `scripts/readme.mjs` — `usageNotes` names each frontend with its port.
5. `scripts/verify/security.mjs` — `GLOBS` gains `**/api/admin/**`, a wrangler file named per
   frontend, and the Worker's entry file; the Pages middleware globs stay for projects on 1.0.0.
6. `scripts/verify.mjs` — a two-frontend fixture: each `testE2e` runs in turn, `--package <dir>`
   selects one. Change only what the fixture shows broken.
7. `scripts/scaffold/fake-catalog.mjs` and the tests of steps 1 to 6 — the fake generator takes
   `--frontend` and per-package flags.
8. `.claude/hooks/test/lanes.test.mjs` — cases for `site`, `admin`, `app-<tool>` and the older
   `frontend`; in a worktree, no library change.
9. Instruction text, each file at its word count or below (`AGENTS.md` is at 1,197 of 1,200,
   `dev-loop` at 2,555 of 2,600):
   - `.doc/product-definition.md` — a `Frontends` section (one row per frontend: directory, host,
     audience, search and sharing, sign-in, offline) replaces the Search and sharing line and
     defines the four types; the Ready to plan line follows.
   - `.doc/architecture.md` — the components table takes one row per frontend package.
   - `AGENTS.md` — the layout row, the Frontend bullet and the `ui-and-styling.md` pointer name a
     frontend package, not `frontend/`. The admin rule does not go here.
   - `.claude/rules/ui-and-styling.md` — `paths` covers the typed directories and `frontend/`.
   - `.claude/skills/api-design/SKILL.md` — the admin namespace: path prefix, folder, one gate,
     no call from another frontend; the `frontend/AGENTS.md` pointers name the package.
   - `.claude/skills/bootstrap-project/SKILL.md` — the type from the `Frontends` row, the
     `--frontend` argument, the stack narrowing per row.
   - `.claude/skills/writing-plans/` — `Scaffold:` gains a frontend; `template.md` has one
     `### Frontend (<dir>)` block per package.
   - `.claude/skills/dev-loop/` — `--package <dir>`; QA's lane as the record gives it;
     `scaffold-step.md` reads the row.
   - `.claude/agents/frontend.md`, `orchestrator.md`, `qa.md`, `reviewer.md` — the directory the
     plan's step names, its `AGENTS.md`, `--package <dir>`.
   - `ui-design` (the screenshot path), `code-review`, `error-handling`, `writing-tests`,
     `deployment` (two pointers) — the package's `AGENTS.md`.
   - `.claude/README.md`, `README.md` — one clause each: a project may hold several frontends.
   - `scripts/docs.test.mjs` — `projectFiles` names the typed directories' guides.
10. After G4: `catalog.lock` to `v1.15.0`; `minCatalog` in `.claude/harness.json` moves only if
    the updater must refuse an older catalog (decided there, with the reason in "As built").

## Validation

- V01 — `scaffold` adds a frontend at a typed directory to a project with a stack; the record,
  the lanes and the README show it — proof: `scaffold.test.mjs` "adds a frontend at a typed
  directory".
- V02 — An untyped, taken or nested directory is refused; `app-billing` is accepted; a project
  at `frontend/` rebuilds its BASE with the arguments it has today — proof: `request.test.mjs`.
- V03 — A second frontend beside a `server` package is refused with the reason, by `scaffold`
  and by the generator — proof: `request.test.mjs`; the catalog's plan tests.
- V04 — The bootstrap creates a new frontend only at a typed directory — proof:
  `bootstrap.test.mjs` "a new frontend needs a typed directory".
- V05 — The `frontend` agent's lanes hold `site/`, `admin/` and `app-<tool>/`, QA's their
  `tests/`, and a project at `frontend/` keeps its lanes — proof: `lanes.test.mjs`.
- V06 — `verify` runs each frontend's e2e and `--package admin` selects one — proof:
  `verify.test.mjs` "two frontends".
- V07 — A change under `api/admin/` asks for the security review — proof: the security test in
  `verify/helpers.test.mjs`.
- V08 — The README's usage notes name each frontend with its port — proof: `readme.test.mjs`.
- V09 — No instruction file grew; the budgets hold — proof: `docs.test.mjs`, and the word counts
  before and after in "As built".
- V10 — `astro-cloudflare` with `site` and `admin` generates; each builds; one Worker serves
  both, each on its host, and each e2e passes there; an unknown host answers 404; `/api/admin/*`
  answers 404 on the site's host; the dev ports differ — proof: the catalog case of C6.
- V11 — Every catalog case outside `serverless/cloudflare` generates the tree it did — proof:
  the catalog suite.
- V12 — In each of the three server templates a module under `api/admin/` passes the boundary
  lint, and its route answers 401 or 403 without the gate's credentials — proof: the catalog
  cases of C6.
- V13 — `serverless/cloudflare` 2.0.0 holds no `functions/` directory, no `_routes.json` and no
  `wrangler pages` command; `wrangler dev` serves the frontend's build, `/api/health` and the
  404 page; `_headers` and `_redirects` apply; with `jobs` on, the one Worker holds the
  scheduled handler and no second Worker exists — proof: the template's cases and its e2e.
- V14 — Each module's router answers its endpoints when mounted alone, and a module that imports
  another module's `service` or `model` fails the lint — proof: the template's boundary tests.
- V15 — Both harness suites pass — proof: `node --test ".claude/hooks/test/*.test.mjs"` and
  `node --test "scripts/**/*.test.mjs"`, one at a time, `core.fsmonitor=false`.
- P1 — One real run in a disposable clone: the bootstrap with `--stack astro-cloudflare
  --frontend site=frontend/astro`, then `scaffold --frontend admin=frontend/astro`, then
  `node scripts/verify.mjs` — proof: the commands' output and the run time, in "As built".

## Risks

- The Worker and its host map are proven locally only — S1 reads the documentation and runs
  `wrangler dev` first; no session deploys, so a project's first deployment is the proof.
- Headers, redirects and the 404 page per frontend may not apply to a file the Worker fetches —
  S1 finds out before C3; what does not apply is set in the Worker, as the reference project
  already does for its console.
- With several frontends every static request runs the Worker and counts as a billed request —
  accepted for a first deployment (Eitan's ruling); "Scaling out" names a Worker per frontend as
  the first step when the count matters.
- "Can move out later" is a promise no deployment tests — V14 mounts each module alone, and
  C2b's rules are the ones a service binding needs; the first real move may still find a gap.
- A project on `serverless/cloudflare` 1.0.0 cannot add a second frontend until it has moved to
  the Worker: the catalog that knows `--frontend` ships 2.0.0 only. The reference project's
  console split therefore starts with that move — accepted (Eitan's ruling on Workers); the
  guide's recipe and Cloudflare's own guide cover it.
- Workers previews and branch controls are less configurable than Pages', and a custom domain
  must sit in a Cloudflare zone — the guide states both before a project moves.
- This plan now holds two catalog changes (several frontends, the Worker) — C2 lands and passes
  the existing cases before C3 builds on it, so each can be reviewed alone.
- `verify` runs one more e2e suite per frontend — the reuse keys rerun only a frontend whose
  inputs changed; P1 records the time.
- `AGENTS.md` has three words of room — step 9 rewords in place and keeps the admin rule in
  `api-design`.
- A project on an older catalog passes `--frontend` to a generator that does not know it —
  `scaffold` names the catalog version it needs before it generates.
- The same template twice (two Astro frontends) is new to the generator: flag names and ports
  collide — the answers file carries flags per package, C1 assigns ports; C6's case holds both.

## Changes during the task

- 2026-11-22 — G1: Eitan set the plan active and named the catalog in scope.
- 2026-11-22 — S1 run (result under Spike). The catalog branch `feat/frontend-type` was cut from
  `dev` 7f2c720 before G2, to hold the two ADR drafts; nothing is committed there.
- 2026-11-22 — ADR 0015 and ADR 0016 drafted, `Status: proposed`. They add what the plan left
  open, each marked ▲ for Eitan: with a stack, a listed frontend uses the stack's own frontend
  template; several frontends with no API package are refused; the API package gets one
  `FRONTENDS` placeholder; the admin gate refuses every request where the server has no accounts.
- 2026-11-22 — Steps 4 to 6, 8 and 9 built, uncommitted. Step 5 adds `**/api/admin/**` only:
  the per-frontend wrangler file went with the one-Worker ruling, and the Worker entry's glob
  waits for C2 to name the file. Step 6 needed no change in `verify.mjs`, step 8 none in the
  hooks (the test was proven in the worktree `.claude/worktrees/030-lanes`, then copied).
- 2026-11-22 — Step 9 writes a frontend's directory as `<frontend>/` in every agent and skill,
  defined once in `AGENTS.md`, so no file grew: `AGENTS.md` 1,197 before and after, `dev-loop`
  2,555 both; `ui-and-styling.md` +5 (its `paths` list) and the product definition +113 (the
  `Frontends` section) are the additions. The two README clauses wait for H10: the pinned
  catalog cannot add a second frontend before it.
- 2026-11-22 — Steps 1 to 3 and 7 built by a Sonnet sub-agent, test-first, uncommitted. Beyond
  the steps: `scaffold` writes NEXT its own answers file (a per-package flag may name a package
  BASE lacks); its `generate` pipes the generator's error text to name `v1.15.0` when
  `--frontend` is unknown; a lone `frontend/` project that adds a `server` stack and a second
  frontend in one request is refused. One existing test changed its fixture: the bootstrap's
  `--template` cases use a server template, since a bare frontend template is now refused.
- 2026-11-22 — Suites, one file at a time: `scripts/` 20 files, 489 pass, 0 fail. Hooks 17
  files: 15 pass; `wrangler.test.mjs` and `wrangler-secrets.test.mjs` fail one test each, both
  on the contents of `.claude/settings.json`, which holds an uncommitted change this plan did
  not make (20:19, narrower wrangler deny rules). Both pass at f53732b. Left for Eitan.
- 2026-11-22 — Eitan: the `.claude/settings.json` change is his and "it's ok to commit";
  "complete your work". Read as: G2 (both ADRs accepted as drafted, their ▲ rows for his review
  at the `dev` → `main` merge) and commits on the harness branch. The two wrangler tests follow
  his settings (26 and 762 pass). Harness commits f8e8487, c1b1a22, a39c412. Not read as
  approval to push, to open a pull request or to commit in the catalog: each is asked.
- 2026-11-22 — Catalog build started, three Sonnet sub-agents at once, uncommitted: C1 in the
  catalog checkout (`tools/`, `schemas/` only); C5 and C2 with C2b each in a detached worktree
  (`../fullstack-templates-c5`, `../fullstack-templates-c2`), their changes to come back as
  patches. C1 keeps `FRONTEND_PATH` and `FRONTEND_OUT` (the first frontend) beside the new
  `FRONTENDS` until C3 moves the template off them. C3, C4, C6 and C7 follow once those land.
- 2026-11-22 — C1, C5, C2 with C2b, C3, C4, C6 and C7 built in the catalog checkout,
  uncommitted (the two worktrees' changes came back as patches). As built, beyond the tasks:
  - the generator adds `FRONTEND_HOSTS` (the local host map) and gives the `frontends` selection
    to frontend packages too; a directory with a slash is refused when a plan holds several;
  - `serverless/cloudflare` types with `wrangler types --check --strict-vars=false`
    (`ENVIRONMENT` is typed `string`), because the strict hash differs per project;
  - `assemble` and `start` take `--only <dir>`, so a frontend's e2e builds only itself;
  - the Astro dev proxy sends `<dir>.localhost` as the host, so the admin frontend reaches
    `/api/admin/*` in development;
  - `python-fastapi` needed a fallback route in the namespace so an unknown admin path stays
    behind the gate.
- 2026-11-22 — The session's own additions after reading the diffs and probing a kept
  two-frontend project (30 traversal and host requests, none crossed a folder): a page path with
  an encoded slash, backslash or dot is refused before the assets are asked; one API test no
  longer fails when `start` left a built `dist/`; the `start` test's cleanup tolerates a process
  tree that already ended. Step 5 gains the Worker's two entry files in the security globs.
- 2026-11-22 — Step 2 made exact: `baseArguments` passes no `--frontend` when the record holds
  the stack's one frontend at its default directory, and every recorded frontend in order
  otherwise; a lone frontend keeps `--template` and `--dir`.
- 2026-11-22 — P1 run before the release, in a disposable clone of this branch against a
  committed copy of the catalog's working tree (the pinned v1.14.0 does not know `--frontend`;
  `scaffold` refuses a catalog checkout with uncommitted changes). After `detach.mjs`:
  - `bootstrap.mjs --stack astro-cloudflare --frontend site=frontend/astro --name p1-proof
    --templates <copy>`: exit 0, 67 s, `site` on 4321;
  - `scaffold.mjs --frontend admin=frontend/astro --flag admin:islands=true --slug add-admin
    --templates <copy>`: exit 0, 242 s, `admin` on 4322, the Worker and `site` merged into their
    several-frontends variants, no conflict;
  - `verify.mjs --out .orchestrate/p1`: PASS, exit 0, 88 s: `check` 411 (Worker), 185 (`site`),
    185 (`admin`); `testDb` 118; `testE2e` 36 and 36; contract, readme and tree checks ok.
  The README names both frontends with their ports; `FRONTEND_HOSTS` is set for dev and empty in
  preview and production. P1 runs again on the released tag with H10.
- 2026-11-23 — Reviews (C8 and the harness branch), three Sonnet reviewers, no P0:
  - harness (`.orchestrate/frontend-type/review.md`): no P1. Fixed in 6e7647b: `--frontend`
    takes a template id of letters, digits and hyphens only; the bootstrap checks a per-package
    flag against the stack's packages; an answers file that holds no object is refused. Left for
    Eitan: his settings change dropped the `wrangler tail` ask rule (production logs stream
    unasked in the main session; sub-agents are still refused by the hook);
  - catalog, general: one P1, fixed — a `--frontend` directory equal to another package's was
    accepted and merged the two (`memberProblems` now refuses it). P2s fixed: several frontends
    with no API refused on the stack path too; a case's `packages:` key that its own `flags:`
    would overwrite is a validation problem; placeholder texts corrected; Pages wording removed;
    `assemble --frontend` refuses a value that is no pair or names no frontend; four guide
    sentences (a second frontend regenerates the package, the empty host map answers 500,
    `static/` files beside several frontends, the encoded-path 404);
  - catalog, security: no P1. Tests added for the admin namespace's spellings on the three
    servers and the host rule. Known limit, in ADR 0015 ▲: `bun-express` and `python-fastapi`
    decode a JSON body before the gate, so an anonymous caller with malformed JSON gets the 400
    envelope, not 401 or 403; no handler runs. Kept as built: a trailing-dot host is refused;
    the encoded-separator guard also refuses an encoded dot.
- 2026-11-23 — Gates after the fix wave. Catalog working tree: `validate` ok; tools check 852
  pass; cases `serverless/cloudflare/default`, `frontend/astro/default`, `server/bun-express/
  default` (434) and `server/python-fastapi/default` (957) pass; `frontend/astro/two` and
  `serverless/cloudflare/jobs` pass with their e2e. Harness: `scripts/` 20 files, 492 pass; the
  hooks suite last ran before the review (17 files pass) and no hook file changed since. P1 was
  not rerun after the fix wave. The catalog is uncommitted on `feat/frontend-type` (98 changed,
  21 new files): G3 waits for Eitan's word.
- 2026-11-23 — Not proven by any run: a deployment (no account); the assets service's own path
  decoding beyond the 30 local probes; "can move out later".

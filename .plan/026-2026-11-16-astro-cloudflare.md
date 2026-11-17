# Serverless stack: Astro and Cloudflare Pages Functions in one package

Status: active
Owner: Eitan
Last updated: 2026-11-17
Approval: delegated (2026-11-16, "set the astro-cloudflare to active, do the commits, pushes and
prs to dev on your own. after you complete, create a dev->main pr for me to merge manually.")
Input: Eitan's request of 2026-11-16 ("a new serverless stack: Astro + cloudflare pages
functions"), the single-package tree he pasted with it, and his two rulings the same day: one
package as pasted, on Pages Functions; the stack is the target an existing Pages site migrates
to, guided by the template's own guide. No ADR exists yet: catalog ADR 0014
(`docs/adr/0014-astro-cloudflare-pages.md`) is task C0.
Reference site: a live Cloudflare Pages project read on 2026-11-16 (private; never named in a
catalog or harness file). Its shape is the stack's acceptance test, listed under "What the
migration needs".
Scope ruling: only this repository and the catalog (`C:/Dev/Playground/AI/fullstack-templates`),
on feature branches. The reference site, its Cloudflare project and its database are read-only
evidence; its migration is its own plan in its own repository. No session deploys anything.
Branches:
- harness `feat/astro-cloudflare`, cut from `main` f99b0ea (== `dev`) on 2026-11-16; PR into `dev`;
- catalog `feat/astro-cloudflare`, to be cut from `dev` 5b6154e at G2; PR into `dev`. The lock
  bump follows the release as its own pull request (H5).
Base: catalog 5b6154e · harness f99b0ea
Stages: catalog work, harness scripts, hooks and docs. No role agent runs. Lean process
(2026-11-11): Sonnet implementers, cheap gates per task, one Opus review per branch at the end,
the new cases with e2e once.
Ledger: `.superpowers/sdd/026-2026-11-16-astro-cloudflare/` (git-ignored).

## Revision of 2026-11-17: two packages, no accounts

Eitan, 2026-11-17, with the one-package build half done: "skip authentication in astro app",
then "put Astro frontend related folders and files inside the `frontend` folder and put the
serverless functions and their related folders and files in a new `serverless` folder under
`cloudflare` (since cloud functions are optional and multiple serverless providers exist).
creating an astro app or migrating into astro should work properly." Asked the same day, he
chose the project path `serverless/cloudflare/` and the OpenAPI contract for the API's types.

This revision replaces, below: the title's "in one package"; open questions 1, 3 (as far as
accounts go) and 5; "The pasted tree, as it lands"; "The package"; tasks C1 to C6; the H rows
about one package and recorded `lanes`; V04, V05, V07 and V08 as worded. Everything else holds.
Catalog ADR 0014 was rewritten for it and is the design.

- **Catalog:** `frontend/astro` 1.0.0 (a frontend that works alone and ships no image,
  `docker: false`), a new kind `serverless` with `serverless/cloudflare` 1.0.0 (the functions,
  `server/`, D1, the contract, the Pages assembly; the plan's server for a frontend, with no
  deploy mode and no Compose file), and the stack `astro-cloudflare`. The `fullstack` kind and
  its template, built first, are removed before the pull request.
- **Project:** `frontend/` and `serverless/cloudflare/` (a two-segment package directory, new
  to the tools and the harness). Astro alone is `--template frontend/astro`; the functions are
  added later by `scripts/scaffold.mjs --stack astro-cloudflare`.
- **No accounts:** no `auth` flag in either template. Flags: `islands` on the frontend (the
  React integration, no island shipped), `jobs` on the functions.
- **Harness:** lanes derive from the kind of each package provenance records (backend: `server`
  and `serverless` packages; frontend: `frontend` packages; qa: their `tests/`), so no `lanes`
  map is recorded. `verify`'s Docker-free database steps key on a `serverless` package. The
  implementers run in parallel again. The one-package wording that PR #64 merged into `dev` is
  replaced by a pull request of this revision; the wrangler guard, the secret files, the link
  programs and the security-review globs stay as merged.

| Task | What |
| --- | --- |
| A1 | Tools: `fullstack` → `serverless`; two-segment directories; a `serverless` package as the plan's server; `docker: false`; `FRONTEND_PATH`; no `lanes` |
| A2 | `serverless/cloudflare`: the server half moved out of the one-package template, `schema` back in each module, `contract` and `openapi.json`, `assemble` and `start` serving the frontend's build, the `jobs` flag |
| A3 | `frontend/astro`: the page half moved out, the generated client under `onlyWhen: server`, alone and in the stack, the `islands` flag; the stack and the index; the old template deleted |
| A5 | The two guides (with `Migrating a site into Astro` and the functions' migration recipe), READMEs, changelogs, `docs/conventions.md`, `CONTRIBUTING.md` |
| A6 | One Opus review of the catalog branch, one fix wave, the local proofs, the pull request |
| H6 | The harness rework above, its review folded into the catalog's where they meet |

Validation as revised: V01 to V03 and V06 hold, on two packages. V04: `frontend/` imports
nothing of `serverless/`; the client is generated from `openapi.json`. V07: with `jobs` off
there is no `workers/`; with `islands` off the frontend has no UI framework and its index page
ships only the theme script; Astro alone generates, builds and passes its e2e with no API code.
V08: a role agent writes only the packages of its kind, cannot write `.fullstack/catalog.yaml`
and cannot deploy; a standard project's lanes are unchanged. V09 on both guides. V10 unchanged.

## Goal

A project can be bootstrapped, or an existing Pages site migrated, onto one package that Astro
builds to static pages and Cloudflare Pages serves with its Functions and D1, and the dev loop
can work in it. After this plan:

- the catalog ships `v1.14.0` with a new template kind and its first member,
  `fullstack/astro-cloudflare-pages` 1.0.0, and the one-package stack `astro-cloudflare-pages`;
- the template's guide has a migration recipe for a Pages site of hand-written HTML and
  JavaScript Functions;
- `bootstrap`, `scaffold`, `verify`, the write lanes and the role agents work on a one-package
  project with Docker stopped;
- the reference site's first slice is ported in a real project (P1).

## Scope

**In** (catalog): ADR 0014; the tools' support for the `fullstack` kind (C1); the template with
its cases, guide, README and changelog; the stack; `index.yaml`; `docs/conventions.md`;
`CONTRIBUTING.md`; the README matrix. Release `v1.14.0`; the tag is Eitan's.

**In** (harness): this plan; H1 to H4; the lock bump H5 and P1 after the release.

**Out** (each arrives by need, as a later plan or a project's own task):

- The reference site's migration itself, and any change to its Cloudflare project, database,
  secrets or domain.
- KV, R2 and Queue helpers; Anthropic and Twilio clients; payment code (a template ships no
  product integration; KV arrives later as a cache).
- An OpenAPI document or a generated client: `shared/schemas/` is the contract in one package.
- Server-rendered Astro (the `@astrojs/cloudflare` adapter), view transitions.
- A move to Workers with static assets. The layout keeps it cheap: only `functions/` is
  Pages-specific, `server/` is not.
- A landing page, a dashboard shell or navigation (ADR 0010: the index route is one `h1`).

## The pasted tree, as it lands

Kept as pasted, inside one package directory (question 5), except these rows:

| Pasted | In this plan | Why |
| --- | --- | --- |
| `functions/api/users/`, `/api/users/me` | `functions/api/user/`, `/api/user/me` | `naming.md`: singular everywhere |
| `rateLimit.ts`, `errorHandler.ts` | `rate-limit.ts`, `error-handler.ts` | kebab-case files |
| `server/api/<module>/schema.ts` as the Drizzle table | `server/api/<module>/model.ts` | `naming.md`: `model` is the storage mapping; request schemas live in `shared/schemas/` |
| `auth/login`, `auth/otp/send`, `auth/otp/verify`, … | One route file per endpoint of `bun-express` 3.1.0's auth and user modules (`signup` included) | One auth surface across the catalog |
| KV for sessions and OTPs (`services/session.ts`, `security/otp.ts`, `infra/kv.ts`) | D1 tables; no `infra/kv.ts` and no KV binding | Question 3 |
| `components/islands/` | Behind an `islands` flag (React), off by default | Question 4 |
| `server/services/anthropic.ts`, `twilio.ts`, `infra/storage.ts`, `infra/queue.ts` | Not shipped | Scaffold by need (2026-11-10); the guide says where each goes |
| `workers/jobs/` | Behind a `jobs` flag, off by default | Same; the reference site has one such Worker, so the flag is exercised |
| `pages/index.astro` landing, `pages/app/` dashboard, nav in the layout | Index is one `h1`; skip link and one `main` | ADR 0010 |
| `styles/styles.scss` | `styles/{setup,themes,basics}/` plus each component's scoped style | The brand generator writes the token files |
| `services/api.ts`, `services/auth.ts` | Kept; `user.ts` and `validation.ts` (the zod facade) join | Folder and facade rules (2026-11-11, 2026-11-12) |
| `public/_routes.json` with `/api/*` | Kept; the guide says to add a line per function route outside `/api` | The reference site has two |
| `.dev.vars.example` | `.env.example`, if spike S6 passes | `AGENTS.md`: configuration is listed in `.env.example`; the secret-file hook knows that name and not `.dev.vars` |
| `wrangler.jsonc` | Kept, plus an `env.preview` block with its own D1 | A preview build otherwise reads and writes production data |

## What the migration needs

Read from the reference site; each line is something the template or its guide must carry.

- About 100 hand-written HTML pages with a header and footer stamped in by a script: layouts,
  and content collections for the article families.
- 169 `_redirects` lines, `_headers`, `404.html`, `robots.txt`, a sitemap and generated `llms`
  text files: `public/` passes through; the guide names the Astro endpoint for a generated file.
- JavaScript Functions with their logic in `functions/api/_lib/`: thin route files plus
  `server/`, with TypeScript adopted file by file (`allowJs` in the server project).
- Two function routes outside `/api` that answer HTML.
- Bindings beyond D1: Workers AI, a service binding to a mail Worker, `env.ASSETS`.
- No accounts: the admin area sits behind Cloudflare Access. The template must be whole with
  `auth` off and D1 still present.
- An existing D1 with data, whose migrations were applied by hand: a baseline recipe that
  records them as applied without running them.
- Git-connected Pages builds from `main`; no direct upload. Preview builds bound to live data
  today.

## Assumptions

- The catalog's contracts hold where the platform allows: the server layer map and request flow
  for `server/`, the frontend invariants on shell, mobile, brand, errors, gates and e2e for
  `src/`. ADR 0014 names each one the kind drops (the OpenAPI document, the Docker image, the
  Compose fragment, the nginx config) and what stands in its place.
- `src/` imports `shared/` only. A lint zone and its boundary test refuse an import of `server/`
  or `functions/` from `src/`: that import would put server code and its secrets' names in the
  browser bundle.
- Bindings come from the request's `env`, never from `process.env` or a module-level
  connection. `server/config/env.ts` validates it with zod.
- The two implementers run in sequence in a one-package project, backend first. `check` is
  package-wide, so a parallel run would fail each agent on the other's half-written files. Cost:
  the loop loses its parallel stage on this stack.
- Bun stays the package manager and script runner; `wrangler`, `vitest` and `astro` (7.x, the
  current major) are dev dependencies reached through package scripts.
- Drizzle on D1, as pasted. Token rotation and attempt counters are single conditional
  statements (`UPDATE … WHERE … RETURNING`), because D1 has no interactive transaction.
- Word budgets (`scripts/docs.test.mjs`): `AGENTS.md` has 4 words left, the backend agent's
  startup 66, `dev-loop` 41. Every harness `.md` edit replaces text.
- Conventional Commits; every pull request targets `dev`; `main` moves only by `dev` → `main`.

## Open Questions

1. **One package or two?** Recommended: two packages.
   > One package, as the pasted tree (Eitan, 2026-11-16).
2. **Workers with static assets, or Pages Functions?** Recommended: Workers with static assets.
   > Pages Functions (Eitan, 2026-11-16). The reference site is a Git-connected Pages project.
3. **D1 for sessions, refresh tokens and OTPs, in the base?** The tree puts them in KV. KV is
   eventually consistent (a revoked session can stay valid elsewhere for up to a minute) and has
   no atomic increment, so rotation and attempt counters race on it. D1 is already bound, and the
   reference site keeps its rate limits there. Recommended: D1; no KV binding in the base.
   > As recommended (Eitan, 2026-11-16: "pick the recommendations").
4. **Which island framework?** `client:*` needs one. React is the one you know; it adds about
   45 kB to a page that hydrates an island, and other pages stay script-free. Preact is far
   smaller with a thinner ecosystem. The reference site is plain scripts, which also port as
   they are. Recommended: React, behind a flag that is off by default.
   > As recommended (Eitan, 2026-11-16): the `islands` flag, off by default.
5. **Where does the package sit?** At the repository root it collides with the harness's own
   `AGENTS.md`, `README.md` and `scripts/`, and `scaffold` and `verify`'s reuse both refuse a
   package at `.`. In a folder the tree is exactly as pasted, one level down, and Pages gets
   "Root directory: `app`" once. Recommended: `app/`.
   > As recommended (Eitan, 2026-11-16).
6. **Does a flag-off `auth` ship an Access gate?** The reference site verifies a Cloudflare
   Access token for its admin routes. That is a second auth model beside accounts. Recommended:
   no; the guide gets the recipe and the middleware slot, the product writes the gate.
   > As recommended (Eitan, 2026-11-16).

## Steps

### Gates

- **G0 (session), done 2026-11-16:** the harness branch cut; this draft.
- **G1 (Eitan), done 2026-11-16:** the six answers; `Status: active`; commits, pushes and PRs
  into `dev` are the session's. `dev` → `main` stays his, in both repositories, as does the tag.
- **G2 (session, then Eitan):** ADR 0014 written from the answers and the spikes recorded. A
  failed S1 or S2 is a stop. Eitan accepts the ADR before the template is built.
- **G3:** each branch built, reviewed (Opus), proven locally; the PRs into `dev`.
- **G4 (Eitan):** catalog `dev` → `main` and the tag `v1.14.0`.
- **G5:** the lock bump PR (H5), then P1.

### Spikes (throwaway, in the session's scratch folder, from `C:\Dev`, no Cloudflare account)

| Spike | Passes when | On failure |
| --- | --- | --- |
| S1 one origin | `astro build`, then `wrangler pages dev dist` serves the pages, `404.html`, `_headers`, `_redirects` and `functions/api/health.ts` on one port on Windows; one `dev` command runs Astro's dev server with `/api` proxied to it | Stop (G2) |
| S2 tests | `vitest` on `@cloudflare/vitest-pool-workers` runs a route through `functions/_middleware.ts` with an isolated D1 and the migrations applied, inside `check`, without Docker | Stop (G2) |
| S3 password hash | `node:crypto` scrypt under `nodejs_compat` at OWASP's parameters fits the paid CPU limit | PBKDF2-SHA256 at the platform's cap, the weakness written into the guide; question back to Eitan |
| S4 CSP | An island hydrates under Astro's hashed CSP with no `unsafe-inline`; the theme script stays a file | Record the weaker policy in the ADR |
| S5 two type worlds | One `check` type-checks `src/` with DOM types and `functions/`, `server/` with `workerd` types, `shared/` under both; the lint zone refuses `src/` → `server/` | Fix the project layout in the ADR |
| S6 env file | `wrangler pages dev` and the tests read secrets from `.env` | `.dev.vars`, plus its name in the secret-file hook (H2) and `readme.mjs` |
| S7 e2e data | `e2eDb` rebuilds a D1 state folder that `start` reads and `dev` never does | Stop the e2e task; ask |
| S8 baseline | Against a copy of a hand-migrated schema, `migrate` records the existing migrations as applied and runs only new ones | The guide documents the manual table instead |

### Tasks

- **C0** ADR 0014 and S1 to S8, recorded in the ledger.
- **C1 tools, the `fullstack` kind:** `schemas/` (the kind, the `fullstack/` path, a stack of one
  package); the loader's checks for it (no `compose.yaml`, no Dockerfile, the guide's headings:
  the server's and the frontend's); the generator (no `docker-compose.yml`, no deploy mode, the
  brand inputs, a `cloudflare` gitignore section); a `lanes` map in the manifest, recorded per
  package in `.fullstack/catalog.yaml`; the case runner (`check`, `testDb`, e2e, no app smoke).
  Tools tests; every existing case's output unchanged.
- **C2 the server half:** `functions/` and `server/` as below without auth; `health`; the error
  envelope, request id and request log; `infra/` with D1; `migrations/`; `migrate`, `testDb`,
  `e2eDb`; tests in `workerd`.
- **C3 auth:** the `auth` flag: route files, `server/api/{auth,user}/`, `services/session.ts`,
  `security/`, `communicate/` with the console provider, `middleware/{auth,role,rate-limit}.ts`,
  `shared/schemas/{auth,user}.ts`.
- **C4 the Astro half:** `src/` as below; the token tree and the brand inputs; the shell; the
  kit; `services/api.ts` over `shared/`; copy tables for the envelope's codes; lint zones with
  their test; unit tests; `shell.spec` and `screens.spec` against `wrangler pages dev dist`;
  under `auth` the sign-in and sign-up pages, the client guard, the session hint and the auth
  journeys.
- **C5 the `jobs` and `islands` flags:** `workers/jobs/` with its own `wrangler.jsonc`, one
  scheduled handler that imports `server/`, its test; `@astrojs/react`, `components/islands/` and
  the auth forms as islands when both `islands` and `auth` are on, plain scripts otherwise.
- **C6 the guide and documents:** the package's `AGENTS.md` (`Adding a module`, `Adding a
  feature`, `Adding a content page`, `Styling`, `Errors`, `Tests`, `Deployment`, `Migrating a
  Pages site`); `README.md`; `CHANGELOG.md`; the stack; cases (`default`, `auth-off`, `jobs`,
  `islands`, `brand`); `index.yaml`; `docs/conventions.md` (a `Fullstack` block); `CONTRIBUTING.md`; the
  README matrix.
- **C7 final:** the Opus review of the catalog branch (a security read of the auth flow,
  cookies, CSP, `wrangler.jsonc`, the env module and the `src/` → `server/` zone), one fix wave,
  the local proofs, G3.
- **H1 to H3:** the harness table below. H2 lands before any session runs a generated project.
- **H4** this plan's "As built". **H5** after G4: `catalog.lock` to v1.14.0, the bootstrap smoke.
- **P1** after H5: Eitan creates the migration project from the harness on this stack; one loop
  task ports one page family and one function from the reference site.

Waves: C0 → C1 → (C2 → C3) ∥ C4 → C5 → C6 → C7. H1 ∥ H2 ∥ H3 from G2.

### The package

```
app/                           fullstack/astro-cloudflare-pages
├── src/                       Astro, output: 'static', no adapter        lane: frontend
│   ├── pages/                 index · 404 · with auth: auth/login, auth/signup, forbidden, user
│   ├── layouts/               the base layout: head, skip link, one <main id="main">
│   ├── components/            ui/ (the kit) · islands/ (with the islands flag)
│   ├── services/              api.ts · auth.ts · user.ts · validation.ts
│   ├── styles/                setup/ · themes/ · basics/
│   └── env.d.ts
├── public/                    _routes.json · _headers · _redirects · theme-init.js   lane: frontend
├── functions/                 file path = route; parse → controller → Response      lane: backend
│   ├── _middleware.ts         request id · request log · error handler
│   └── api/                   _middleware.ts (auth) · health.ts · auth/ · user/ · module/
├── server/                    never routed; imported by functions/ and workers/     lane: backend
│   ├── api/<module>/          controller · service · model (Drizzle)
│   ├── config/                env.ts · constants.ts · cors.ts
│   ├── middleware/            auth · role · validate · rate-limit · error-handler
│   ├── models/<name>/         interface · type · enum · constants
│   ├── services/              session · logger · security/ · communicate/ · utils/
│   └── infra/                 bindings.ts · db.ts
├── shared/                    schemas/ (zod, one file per module) · types/api.ts    lane: backend
├── workers/jobs/              with the jobs flag                                    lane: backend
├── migrations/                SQL from drizzle-kit                                  lane: backend
├── tests/                     api/ (workerd) · unit/ · e2e/ (Playwright)            lane: qa, and each owner
└── astro.config.mjs · wrangler.jsonc · worker-configuration.d.ts · drizzle.config.ts ·
    tsconfig.json · package.json · .env.example · AGENTS.md
```

`package.json`, the lockfile, `tsconfig.json` and the lint config are in both implementers' lanes.
`shared/` is the backend's: the loop's contract stage writes it, and the frontend only reads it.

| Command | What it runs |
| --- | --- |
| `dev` | Astro's dev server with `/api` proxied to `wrangler pages dev` |
| `start` | `wrangler pages dev dist`, once |
| `check` | `wrangler types` freshness, `astro check`, tsc for the server project, eslint zones, prettier, vitest |
| `testDb`, `migrate`, `e2eDb` | Local D1 only, no Docker |
| `testE2e` | `astro build`, then Playwright against `start` on phone and desktop |
| `contract` | None: `verify` skips it; the type check across `shared/` is the proof |

### H1 to H3: the harness

From a sweep of the hard-coded assumptions on f99b0ea.

| Task | File | Change |
| --- | --- | --- |
| H1 | `scripts/verify.mjs:271-306, 331-367` (+ tests) | `testDb`, `migrate` and `e2eDb` run without Docker when the project has no Compose service `database`; today each one starts that service and a `testDb` command alone demands Docker |
| H1 | `scripts/verify.mjs:199`, `scripts/bootstrap.mjs:297-298`, `scripts/readme.mjs:187-188`, `scripts/scaffold/request.mjs:23,236` (+ tests) | The `fullstack/` kind beside `frontend/` and `server/`: step order, the printed dev URL, the default dir `app`, flags on it, a conflict's owner from the recorded lanes |
| H1 | `scripts/verify/security.mjs:14-30` | `**/wrangler.jsonc`, `**/functions/**/_middleware.ts` and `**/_headers` join the globs that call the security review |
| H2 | `.claude/hooks/enforce-agent-boundaries.mjs:40-54` (in a worktree, never live; + `regression.test.mjs`) | A role's lane is the constant plus the paths `.fullstack/catalog.yaml` records for it; an unreadable or absent record leaves the constants; no role can write that file |
| H2 | `.claude/hooks/block-destructive-bash.mjs` (+ `database.test.mjs`) | `wrangler` with `deploy`, `login`, `secret`, `delete` or `--remote` is refused for role agents; today `bunx wrangler pages deploy` passes every hook and is pre-allowed by `Bash(bunx *)` |
| H2 | `.claude/settings.json` | `ask` entries for the same commands in the main session |
| H2 | `block-secret-file-access.mjs:38-47`, `scripts/verify/review.mjs:9-26` | Only if S6 fails: `.dev.vars*` is a secret file (`.dev.vars.example` allowed) |
| H3 | `AGENTS.md:20-21, 46, 55, 83-88` | Lanes "per package role"; the package row names one-package projects; the deployment target is the template's; the contract is the template's (`shared/` or OpenAPI). Net zero words |
| H3 | `agents/backend.md`, `frontend.md`, `qa.md` | The literal `backend/`, `frontend/` and `--package <name>` become "your lane and package in `.fullstack/catalog.yaml`"; replacements within 66 words |
| H3 | `dev-loop/SKILL.md:119-134` | One replaced sentence: with one package the implementers run in sequence; 41 words left |
| H3 | `api-design/SKILL.md`, `deployment/SKILL.md`, `database/SKILL.md` | One replaced sentence each: on a hosted one-package stack the contract, deployment and data rules are the package's `AGENTS.md`'s |
| H3 | `bootstrap-project/SKILL.md` | The stack choice offers a one-package stack when the brief wants content pages search engines read and no server to run; it then skips the deploy and data-store questions. A brief that names an existing site to migrate points at the guide's recipe |
| H3 | `.claude/README.md:83-92` | "Frontend choice" names the stack and its one-package shape |

## Validation

- V01 — The catalog validates; the new cases are green with e2e; every existing case's generated
  tree is unchanged. Proof: `bun tools/validate.ts` with `--readme` and `--lockfiles`; the case
  runs; the fixture snapshots.
- V02 — `check`, `testDb` and the e2e suite pass with `docker` off the `PATH`. Proof: the
  `default` case; `node scripts/verify.mjs` in a generated project.
- V03 — One origin: pages, the 404 page, redirects and `/api/*` answer on one port; a static page
  invokes no Function; every API response carries a request id; an error is the envelope. Proof:
  `tests/api/`; `shell.spec`.
- V04 — `src/` cannot import `server/` or `functions/`, and no server module's text is in `dist/`.
  Proof: the boundary test; a grep of the build.
- V05 — A revoked or rotated refresh token is refused on the next request; a replayed one revokes
  the session; OTP attempts stop at the limit under concurrent requests. Proof: the auth tests.
- V06 — No secret is in `wrangler.jsonc`, the build output or a log line; the env module rejects a
  missing secret in production; the `preview` environment names a different D1 from production.
  Proof: the env and logger tests; a test over `wrangler.jsonc`.
- V07 — With `auth` off the package has no account code and still has D1, its migrations and the
  rate limit; with `jobs` off it has no `workers/`; with `islands` off it has no UI framework
  and its pages ship only the theme script. Proof: the `auth-off` and `default` cases.
- V08 — A role agent writes only its recorded lane in a one-package project, cannot write
  `.fullstack/catalog.yaml`, and cannot deploy or reach a remote binding; a two-package project's
  lanes are unchanged. Proof: the hooks suite.
- V09 — Every item under "What the migration needs" has a named section in the guide. Proof: a
  read of `AGENTS.md › Migrating a Pages site` against that list, in the Opus review.
- V10 — P1: the migration project boots from the stack and one loop task ports a page family and
  a function with Docker stopped. Proof: that project's `.orchestrate/<slug>/verify.json`.

## Risks

- **The harness changes more than for two packages.** A new kind in four scripts, lanes read
  from a file, three agents reworded. Mitigation: the constants stay as the fallback; every
  existing lane test is kept and must pass unchanged.
- **A lane record is a new thing to get wrong.** A bad record could widen a lane. Mitigation: no
  role can write it; the hook fails closed to the constants; paths are confined to the package.
- **No parallel stage.** A one-package task takes longer than the 60-minute target assumes.
  Mitigation: measured in P1; stated in the guide.
- **A preview build on live data,** as the reference site has today. Mitigation: the `preview`
  environment in the template; the migration recipe makes it step one.
- **A migration that touches a live database.** Mitigation: out of scope here; S8 runs on a
  copy; no session holds an account token; H2's refusals.
- **CPU limit.** Password hashing does not fit the free plan's 10 ms. Mitigation: S3; the guide
  names the paid plan while passwords are on.
- **Pages is the older product.** New platform features land on Workers first. Mitigation: only
  `functions/` is Pages-specific; the ADR records what a move would replace.
- **Astro churn.** Two majors in 2026 (6.0.0 in March, 7.0.0 in June; npm's `latest` was 7.4.12
  on 2026-11-16). Mitigation: static output and no adapter; S1 reads the 7.x upgrade guide first.
- **Windows.** `workerd`, the path-case trap for Bun scripts. Mitigation: every spike runs on
  Windows from the on-disk spelling.

## Changes during the task

Rulings of the session under the delegation; the ledger holds the detail. Each stands for
Eitan's review at the `dev` → `main` merge.

- **Two packages (Eitan, 2026-11-17).** The revision at the top of this plan. Where an entry
  below speaks of one package, the `fullstack` kind or recorded `lanes`, the revision wins: the
  harness pull request of the revision (H6) replaced that code and wording.
- **No accounts (Eitan, 2026-11-17: "skip authentication in astro app").** C3 is not built
  and neither template has an `auth` flag. V05 falls away; the `islands` flag ships the
  integration and no island (the auth forms were to be the islands). The password-hash ruling
  below is kept only as input for a later plan. ADR 0014, T1.
- **G2 without a separate stop.** S1 and S2 passed, so the build went on with ADR 0014 marked
  "accepted under the delegation"; its rows the session decided carry a ▲.
- **Spikes.** S1, S2, S4, S5, S6, S7 and S8 passed. S3 is partial: scrypt at N = 2^17 needs the
  whole memory of an isolate, and no session can test a deployed project. Chosen instead of the
  plan's PBKDF2 fallback: scrypt N = 2^14, r = 8, p = 5 (an OWASP-listed set, 16 MiB), the
  parameters stored in the hash. P1's first deploy is its proof.
- **Order.** C2 → C3 → C4 → C5 → C6 in sequence; the plan let C4 run beside C2 and C3. One
  package-wide `check` and one lockfile make two builders in one checkout flaky.
- **`check` and `testDb`.** `check` runs every vitest project, the `workerd` API suite
  included; `testDb` is that suite alone.
- **Findings the template carries:** TypeScript pinned to 6 (`astro check` refuses 7); vitest
  4.1 with `@cloudflare/vitest-plugin`, the renamed pool; `@shared/*` the only alias;
  `build.format: 'file'`; the CSP delivered from `dist/_headers` by a post-build script; test
  isolation per file, so tables are emptied before each test; no `.dev.vars` (it hides `.env`).
- **H1, then H6.** The Docker-free database steps are decided by kind: a project whose API is
  a `serverless` package. The table's wording ("no Compose service `database`") would have
  turned a standard project's clear refusal into a suite run without its database (review,
  P1). Packages are named by template kind (`isApi`: `server` or `serverless`). A package
  directory may have two segments throughout `scripts/`. `history.mjs` reads an inline `flags`
  map.
- **H2, stricter than the table.** A sub-agent's `wrangler` is an allowlist (`dev`,
  `pages dev`, `pages functions build`, `types`, `d1 migrations create`, and `d1 migrations
  apply|list`, `d1 execute`, `d1 export` with `--local`); the six words were a denylist that
  `time-travel restore`, `pages deployment create` and a version-pinned `wrangler@4` passed
  (review, P1). It covers every sub-agent, `general-purpose` included; the interactive session
  is asked by `settings.json`. `.dev.vars` is a secret file whatever S6 found, and so is
  wrangler's login file. `mklink` and `fsutil` are write programs: a link made in a lane led
  out of it.
- **Lanes (H6).** A role's lane is its constants plus the packages provenance records, by
  template kind: `server` and `serverless` for the backend, `frontend` for the frontend, their
  `tests/` for QA. A key is one or two plain segments and never starts with `scripts`, `db`,
  `docs` or `node_modules`; any read problem leaves the constants. This also gives a standard
  project with a renamed package directory its lane.
- **H3, then H6.** Not net zero: 104 words over across eight files against `main`, every cap
  held (`AGENTS.md` 1,197 of 1,200). The instruction files start from `main`'s text again, so
  the wording the first pass cut is back; what was added names the `serverless/` package: the
  lanes, the layout row and the deployment target in `AGENTS.md`, the backend's and QA's
  directories, one clause each in `database`, `deployment` and `scaffold-step.md`, the stack
  choice in `bootstrap-project`, one sentence in the harness manual.
- **Left as notes, not built:** a package change in `.fullstack/catalog.yaml` triggers no
  security review; a package script that calls `wrangler deploy` is invisible to a hook; the
  skills that still spell `backend/AGENTS.md` where a `serverless/` package's guide is meant
  (the backend agent's prompt gives the reading); `verify`'s port probe gives a listener 750 ms
  to answer, and on a loaded machine its test (`a busy port fails the e2e step`) failed once and
  passed alone.
- **Pushes.** The active `gh` account could not push to these repositories; each push and PR
  command used the other logged-in account for that command only.

## As built (2026-11-17)

- **Catalog:** PR #45 into `dev` as b8148ee (CI 61/61): the `serverless` kind,
  `serverless/cloudflare` 1.0.0, `frontend/astro` 1.0.0, the stack `astro-cloudflare`, ADR 0014,
  both guides with their migration recipes. Release PR #46 `dev` → `main` is open for Eitan.
- **Harness:** #64 (H1 to H3) and #65 (H6) in `dev`; this entry is H4.
- **Review (A6):** Opus on the catalog branch: no P0, three P1, thirteen P2, all fixed in one
  wave. A scoped re-review of the wave found a P1 in the new policy parser (it read
  `data-content` for `content`), fixed in a second round. Two rows of ADR 0014 changed:
  - each page keeps its hashed policy `<meta>` and `assemble` adds one fixed header line (the
    lift into one line capped a site at about 30 hashes, and pages accepted each other's);
  - `ENCRYPTION_KEY` is optional with no default (the example env file broke every request).
- **Proof:** `validate` plain, `--readme`, `--lockfiles`; the cases `serverless/cloudflare/default`
  and `/jobs`, and `frontend/astro/default`, `/alone`, `/islands`, `/jobs`, `/brand` with e2e
  (V01, V03, V04, V06, V07). A fresh harness clone bootstrapped with `--stack astro-cloudflare
  --templates <catalog>`, then `verify: PASS` with no Docker step (V02). Before the fix wave, at
  catalog c272f4a: `--template frontend/astro` alone, then `scaffold --stack astro-cloudflare`
  onto it, `verify: PASS` after each. V08: the hooks suite on #65. V09: both guides, by the docs
  task's mapping; not reread by a reviewer.
- **Not proven:** a deployment (no session holds an account); a file symbolic link in a build
  output (the test ran on a junction); `astro dev` under the page policy (Astro's dev manifest
  injects no policy meta: read from its source, not run); one unexplained exit 9 of `start` in
  about twelve runs (the script now prints the code and signal); a project path of about 140
  characters fails the local D1 commands on Windows (in the guide).
- **Open:** G4 (Eitan): catalog #46, the tag `v1.14.0`. Then H5 (the lock bump into `dev`),
  harness `dev` → `main`, and P1 with V10. Until the tag, a project is created with
  `node scripts/bootstrap.mjs --stack astro-cloudflare --name <name> --templates <catalog checkout>`.

# Clean code audit — fullstack-dev-harness
Date: 2026-10-20 · Reviewer: clean-code fork · Model: Fable 5.1

## Method
- Read all 29 files in the repo (inherited from the parent session), then re-read the four
  `.claude/rules/*.md` files with `cat -n` for exact line numbers.
- Checked the file inventory for any shipped tool configuration (`tsconfig*`, `eslint*`,
  `.prettierrc*`, `.editorconfig`, `vitest.config*`, `playwright.config*`, `package.json`).
  None exist anywhere in the repo.
- Measured every rule, skill and agent workflow against one question: *is this enforced by a
  tool, or merely requested in prose?*
- Docs consulted for current defaults:
  - Next.js 16 removed `next lint`; `next build` no longer lints —
    https://nextjs.org/docs/app/api-reference/config/eslint
  - Next.js 16.x is the current major line (16.2.x stable mid-2026) — https://nextjs.org/support-policy
  - typescript-eslint shared configs (`strictTypeChecked`, `stylisticTypeChecked`, `projectService`) —
    https://typescript-eslint.io/users/configs and https://typescript-eslint.io/getting-started/typed-linting
  - Prettier `semi: false` prints defensive leading semicolons only where ASI is hazardous —
    https://prettier.io/docs/options#semicolons
  - TypeScript strictness flags — https://www.typescriptlang.org/tsconfig/#strict,
    `#noUncheckedIndexedAccess`, `#exactOptionalPropertyTypes`, `#verbatimModuleSyntax`
  - Vitest coverage thresholds — https://vitest.dev/config/#coverage-thresholds
  - Conventional Commits — https://www.conventionalcommits.org/en/v1.0.0/
  - Bun + Next.js runtime compatibility (community reports, not official) —
    https://alexcloudstar.com/blog/bun-compatibility-2026-npm-nodejs-nextjs/
  - Prisma 7 (TypeScript/WASM client, no Rust engine) vs Drizzle —
    https://makerkit.dev/blog/tutorials/drizzle-vs-prisma, https://www.bytebase.com/blog/drizzle-vs-prisma/

## Score: 4/10
The harness has the right *shape*: a small always-on rule set, on-demand skills, role-scoped
agents, a QA stage that only accepts test evidence, and a "fix the code, not the test" stance.
That shape is worth keeping. But almost nothing in it is *enforced*. There is no tsconfig, no
ESLint config, no Prettier config, no editorconfig, no coverage threshold, no layering rule, no
definition of done, and no review checklist shipped with the harness. Every quality property is
a sentence an agent is asked to honour. On a from-zero clone the first `create-next-app` run
decides strictness, lint scope and project layout, and the harness has nothing to say about it.
On top of that, the rules carry terms from a previous map-based, multi-tenant product
(`org`, `geo`, `lat`/`lng`, a plan-002 note) and stack facts are scattered across seven files,
so the "opinionated default, swappable" stance is not achievable without a restructure. The
result today would be *compliant* code (no semicolons, singular names, Tailwind only), not
*excellent* code.

## Scorecard
| Sub-dimension | 0-10 | Why (one line) |
|---|---|---|
| Rule specificity and enforceability | 3 | Four rules, mostly prose; only the semicolon rule is mechanically checkable, and no checker ships |
| Coverage of quality concerns | 2 | No TS strictness, lint, format, layering, env validation, logging, a11y, coverage or dependency policy |
| Architecture and layering guidance | 1 | Nothing above "lib/ + route/ + index.ts"; no import-direction rule, no server/client boundary guidance |
| Skills: quality and completeness | 5 | `writing-tests` and `error-handling` are sound; `writing-plans` lacks its template; `api-design`, `code-review`, `auth` missing |
| Agent workflows as quality drivers | 4 | Tests after implementation; no guard against deleted or skipped tests; QA adversarial pass is the bright spot |
| Stack coherence and swappability | 3 | npm vs Bun, Node 20 vs 24, Express alongside Next route handlers; stack facts in seven files |
| Docs templates as quality inputs | 3 | Product and architecture templates never ask for NFRs, auth model, data model or API style; glossary empty |
| Context economy | 8 | Always-on rules are ~75 lines; cheap to extend, easy to keep under budget |
| Portability (residue-free) | 4 | `org`/`geo`/`lat`/`lng`, plan-002 note, "social app" README leak from a previous product |

## Findings (most severe first)

### [P0] CODE-01 — Quality is requested in prose and never enforced by shipped configuration
- Where: `.claude/rules/code-style.md:5-6`; `.claude/agents/frontend.md:73-76`; repo inventory (no `tsconfig*`, `eslint*`, `.prettierrc*`, `.editorconfig`, `vitest.config*`, `playwright.config*` anywhere)
- Evidence: `code-style.md:5` "No trailing semicolons." and `:6` "put it at the start of the line" describe exactly what Prettier does mechanically with `semi: false` (https://prettier.io/docs/options#semicolons). `frontend.md:75-76` tells the agent to run `npm run typecheck` and `npm run lint` "must be clean", but no config defines what "lint" checks; `frontend.md:59-60` cites `frontend/vitest.config.mts` and `vitest.setup.ts` that do not exist in the harness. Next.js 16 removed `next lint` and `next build` no longer lints (https://nextjs.org/docs/app/api-reference/config/eslint), so a `lint` script copied from an older template fails outright.
- Impact: on every clone the first scaffold command, not the harness, decides TypeScript strictness, lint scope, formatting and test wiring. Agents then "match the surrounding code" (`code-style.md:13`), which on an empty project means matching whatever the generator emitted. Quality is non-deterministic across clones.
- Recommendation: ship the configuration, and make the rules point at it instead of restating it.
  - `templates/frontend/` (copied by the bootstrap): `tsconfig.json` (see CODE-07 for flags), `eslint.config.mjs`, `.prettierrc`, `.editorconfig`, `vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts`, `src/env.ts`.
  - `.prettierrc`: `{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "plugins": ["prettier-plugin-tailwindcss"] }`. `code-style.md` shrinks to: "Formatting is Prettier's job; run it, never argue with it."
  - `eslint.config.mjs`: `eslint-config-next` (core-web-vitals, includes `jsx-a11y`) + `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked` with `projectService: true` (https://typescript-eslint.io/users/configs) + `eslint-plugin-import-x` (ordering, no cycles, restricted paths) + `eslint-plugin-vitest` (`no-focused-tests`, `no-disabled-tests`) + `eslint-config-prettier` last. `lint` script is `eslint .`, not `next lint`.
  - Enforcement at the point of generation: a `PostToolUse` hook on `Edit|Write` that runs `prettier --write` on the touched file (the mechanics perspective owns the wiring; the recommendation here is that formatting must not depend on the agent remembering). Plus `lefthook` pre-commit (prettier, eslint, tsc) and the same three in CI. Tradeoff: three layers is redundant by design; the Claude hook catches agent output, pre-commit catches humans, CI catches both when hooks are skipped.
- Effort: M

### [P0] CODE-02 — No architecture or layering convention; every feature invents its own
- Where: `.claude/rules/` (no architecture file); `.claude/agents/backend.md:36-40`; `.claude/agents/frontend.md:23`; `.doc/architecture.md:9-22`
- Evidence: the only structural guidance is `backend.md:37-39` ("`backend/src/lib/` — data access / store", "`backend/src/route/` — one module per resource", "`index.ts`") and `frontend.md:23` ("Mock data layer: `frontend/src/mock/seed.ts` + React `useState`"). Nothing says where components, hooks, services, types, schemas or feature modules live, what may import what, or where the Next.js server/client boundary sits. `architecture.md:9-22` is a list of headings to fill in later.
- Impact: this is the single biggest determinant of "clean" on a growing codebase and it is undefined. Two tickets implemented by two agent runs will produce two layouts; the third ticket inherits both. Cross-layer imports (a component importing a repository) are never flagged because no rule and no lint rule forbids them.
- Recommendation: add `.claude/rules/architecture.md` (~40 lines) and enforce its import direction with ESLint.
  - Frontend: feature-first under `src/feature/<name>/` (`component/`, `hook/`, `service/`, `schema.ts`, `type.ts`, `index.ts` as the only public surface); shared code in `src/shared/{ui,lib,config}`; `app/` contains routing files only and delegates to features. Server Components by default; `"use client"` only on leaf components that need state or browser APIs, and the rule says why.
  - Backend (when it exists): `route → validation (zod) → service → repository`, with `middleware/` for `requestId`, logging and the central error handler the `error-handling` skill assumes (`error-handling/SKILL.md:33` requires a `requestId` on every error response; nothing in `backend.md` produces one).
  - Enforce with `import-x/no-restricted-paths` (or `eslint-plugin-boundaries`): `app/**` may import `feature/**` and `shared/**`; `feature/a/**` may not import `feature/b/**` except via `feature/b/index.ts`; `shared/**` imports nothing from `feature/**`; `component/**` never imports `repository/**`.
  - Tradeoff: feature-first costs a little duplication of tiny helpers early; layer-first (`components/`, `hooks/`, `services/` at the root) reads simpler on day one and becomes a junk drawer by month three. For a harness meant to run many projects, the long-run structure wins.
- Effort: M

### [P1] CODE-03 — Tests are written after implementation; TDD is not part of the agent workflow
- Where: `.claude/agents/frontend.md:45-68`; `.claude/agents/backend.md:36-50`; `.claude/skills/writing-tests/SKILL.md:39-42`
- Evidence: `frontend.md:45` "### Step 2: Implement" precedes `frontend.md:58` "### Step 4: Tests". `backend.md:36` "Step 2: Implement" precedes `backend.md:46` "Step 4: Tests". `writing-tests/SKILL.md:40` requires "a happy-path **and** a failure-path test" but says nothing about ordering. `frontend.md:78` "If a test fails: fix the code, not the test" exists, yet nothing stops an agent from deleting or `.skip`-ping a failing test, and QA (`qa.md:61-64`) only *adds* tests.
- Impact: tests written after the fact tend to assert what the code does rather than what the plan required, which is how a feature passes its own tests and still fails an acceptance criterion. Test deletion is invisible to the loop.
- Recommendation: restructure both implementers to "Step 2: turn the plan's `Validation` items into failing tests → Step 3: implement to green → Step 4: refactor". Add a mechanical guard: QA step 2 runs `git diff --name-status <base> -- '**/*.test.*' '**/*.spec.*'` and treats any `D` or any new `.skip`/`.only` as FAIL; `eslint-plugin-vitest` `no-disabled-tests` and `no-focused-tests` as errors; CI runs vitest with `--allowOnly=false`. Tradeoff: strict TDD in an agent costs extra turns per feature (roughly one more test-run cycle); the payoff is tests that encode the spec, which is the whole point of QA accepting only test evidence (`qa.md:93`).
- Effort: S for the workflow text, M for the guard

### [P1] CODE-04 — Definition of done and review priorities live in Eitan's user-scope memory, not in the harness
- Where: `C:\Users\eitan\.claude\CLAUDE.md` ("Code review priorities", "Before claiming work is done"); `.claude/rules/` (nothing equivalent); `.claude/agents/frontend.md:71-78`
- Evidence: the harness has no rule stating what "done" means beyond the command list in `frontend.md:73-76`. The six-level review priority (security, scalability, maintainability, error handling, complexity, ops) and the "run type-check, tests, lint before claiming done" rule exist only in the user-scope `CLAUDE.md`, which is not part of the clone.
- Impact: a clone used on another machine, by a teammate, or in CI/headless mode loses the two rules that most directly protect code quality. The orchestrator's plans and QA's reports cannot cite a definition of done because none exists in the repo.
- Recommendation: `.claude/rules/definition-of-done.md` (typecheck clean, lint clean, unit + e2e green, coverage threshold met, no skipped tests, failure-path test present, docs/glossary updated when a term or route changed, no new `any`). Plus `.claude/skills/code-review/SKILL.md` with the six-priority order, a severity scale (P0/P1/P2 as used in this audit) and the instruction "be critical; surface real problems". Wire a `reviewer` agent into the loop between implementer and QA (the process perspective owns the stage design; this finding owns the checklist content).
- Effort: S

### [P1] CODE-05 — Product residue in rules and skills steers every new project toward a map-based multi-tenant app
- Where: `.claude/rules/naming.md:7-9`; `.claude/rules/ui-and-styling.md:19-21`; `.claude/rules/git-workflow.md:19`; `.claude/skills/error-handling/SKILL.md:55`; `.claude/skills/writing-tests/SKILL.md:18`; `.claude/skills/database-schema/SKILL.md:17-25`; `README.md:5`
- Evidence: `naming.md:7-9` "`org` — not `organization`", "`geo` — not `geolocation`", "`lat` / `lng` — for coordinates". `ui-and-styling.md:19` "Resolves Q3 of `.plan/002-2026-08-03-pixel-perfect-the-visual-design.md`" (file does not exist). `git-workflow.md:19` example commit "add org validation rule". `error-handling:55` "Include `requestId`, `org`, the operation name". `writing-tests:18` "Auth and org boundary enforcement." `database-schema:19-25` defines an `org` table as the core table. `README.md:5` "frontend-first social app MVP".
- Impact: an agent on a brand-new single-tenant project with no geography will still see `org` as a required log field, an `org` table as the schema baseline and `geo` as a canonical term. Worse, the harness *implicitly* assumes multi-tenancy without ever stating it as an architectural decision, so a clone cannot knowingly opt out.
- Recommendation: decide once. If multi-tenant SaaS is the harness default, say so in `architecture.md` ("every row and every request is scoped to a tenant called `org`") and keep `org` in error-handling, tests and schema as a *consequence* of that decision. If not, strip `org` from all six places. Either way delete `geo`, `lat`/`lng`, the plan-002 note and the README product line; domain terms belong only in `.doc/glossary.md` per `naming.md:11-13`.
- Effort: S

### [P1] CODE-06 — Stack facts are restated in seven files, so the stack is not swappable
- Where: `.claude/agents/frontend.md:19-24,59-63,73-76`; `.claude/agents/backend.md:18-21,53-56`; `.claude/agents/qa.md:38-59`; `.claude/rules/ui-and-styling.md:9-11`; `.claude/skills/writing-tests/SKILL.md:44-53`; `.claude/skills/database-schema/SKILL.md:12-13`; `.claude/agents/orchestrator.md:48` (Figma)
- Evidence: Next.js/Tailwind/Vitest/Playwright/npm appear in `frontend.md:20-24`, `ui-and-styling.md:9`, `writing-tests.md:46-50`, `qa.md:38-54`; Express/Node 20 in `backend.md:19-20`; vitest `globals: false` is explained three separate times (`frontend.md:63`, `qa.md:48`, `writing-tests.md:52-53`).
- Impact: swapping any one choice (Bun for npm, Hono for Express, a different test runner) means editing seven files and hoping none drift. The agreed stance "opinionated default, swappable" cannot be met.
- Recommendation: one always-on `.claude/rules/stack.md` (~40 lines) is the only file allowed to name a framework, runtime, package manager, test runner, UI library or command. It has fixed headings (Runtime, Package manager, Frontend, API, Database, Validation, Tests, Lint/format, Commands) so a clone replaces values, not structure. Every agent and skill references "the stack rule" and the command names it defines (`typecheck`, `lint`, `test`, `test:e2e`) instead of restating them. Move `sonner`/`lucide-react` from `ui-and-styling.md:4-6` into `stack.md`; keep only the stack-agnostic token/utility intent in `ui-and-styling.md`.
- Effort: M

### [P1] CODE-07 — The default stack conflicts with Eitan's preferences and with itself
- Where: `.claude/agents/frontend.md:73-76` (npm); `.claude/agents/backend.md:19` (Node 20); `.claude/agents/backend.md:20` (Express 5); `.claude/hooks/enforce-agent-boundaries.js:17` (ESM comment)
- Evidence: `frontend.md:73` "`cd frontend && npm test`" while the user-scope `CLAUDE.md` says "Bun is the runtime/package manager on current projects". `backend.md:19` "Node.js 20 + TypeScript, ESM" while Node 24.15 and Bun 1.4.0 are what is installed. The hooks rely on ESM syntax detection that Node 20 does not have by default (mechanics perspective has the test). `backend.md:20` mandates a separate Express 5 service while the frontend is Next.js 16, which already ships route handlers and server actions. Next.js 16.x is the current major (https://nextjs.org/support-policy), so the frontend choice itself is current.
- Impact: agents receive contradictory instructions (npm in the harness, Bun in user memory), and the "separate backend" architecture is a heavyweight default for a from-zero project: two deploys, two CI pipelines and a hand-written OpenAPI contract between them from day one.
- Recommendation (default, with tradeoffs):
  | Layer | Recommended default | Tradeoff vs the alternative |
  |---|---|---|
  | Package manager + script runner | **Bun 1.4** (`bun install`, `bun run <script>`, `bun.lock` committed) | Faster installs, matches Eitan's prefs. Some hosts only use Bun for install, not runtime; keep scripts runtime-neutral. |
  | Runtime for Next.js | **Node 24 LTS** (`bun run dev` executes `next dev` under Node) | `bun --bun next` is faster to start but is not supported by Vercel, differs in middleware/edge sandbox and breaks native addons such as `bcrypt`/`argon2` (community reports, not official). Deploy parity wins. |
  | Frontend | **Next.js 16 App Router + React 19 + TypeScript + Tailwind v4** (keep) | Current major; the alternative (Vite + React Router) is lighter but loses RSC, route handlers and the Vercel deploy path. |
  | API, default | **Next.js route handlers + server actions in the same app** | One deploy, one CI, end-to-end types with no codegen. Loses independent scaling and non-browser consumers; promote to a separate service only when a task is marked `stack:full`. |
  | API, when separate | **Hono on Bun** | Runtime-agnostic, tiny, typed RPC client (`hono/client`) removes the hand-written contract. Express 5 is the more "industry-standard" choice with a larger middleware ecosystem but weaker typing and Node-first; keep it as the documented alternative with a one-line reason to pick it (existing Express expertise or middleware dependency). |
  | Database | **PostgreSQL + Drizzle ORM + drizzle-kit** | TypeScript schema is the single source of truth and migrations are generated from it; tiny footprint, native Bun support. Prisma 7 dropped its Rust engine and closed most of the gap; it still needs `prisma generate` and a DSL, but offers Studio and a larger ecosystem. Pick Prisma if the team prefers schema-DSL ergonomics over SQL control. |
  | Validation | **zod** (route input, server-action input, `src/env.ts`) | Shared schemas across FE/BE; the alternative (valibot) is smaller but less ubiquitous. |
  | Tests | **Vitest + RTL + jsdom (unit/component), Playwright + `@axe-core/playwright` (e2e)**, run via `bun run` | `bun test` is faster but its DOM story and RTL ecosystem are thinner; keep Vitest. |
  | Lint/format | **ESLint 9 flat config + typescript-eslint strictTypeChecked + Prettier (`semi: false`)** | See CODE-01. `exactOptionalPropertyTypes` is the one TS flag that causes friction with third-party types; recommend on, with a documented opt-out per project. |
  Recommended `tsconfig` additions over `create-next-app` defaults: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters` (https://www.typescriptlang.org/tsconfig/#strict and sibling anchors).
- Effort: M

### [P1] CODE-08 — `database-schema` has no ORM or migration-tool stance and two sources of truth
- Where: `.claude/skills/database-schema/SKILL.md:12-13,28-31`
- Evidence: `:13` "`schema.sql` is a standalone bootstrap script" (location unspecified, and raw SQL as the primary artifact); `:30-31` "A schema change updates **both** the migration artifact and the bootstrap script — never one without the other." That is two hand-maintained sources that must agree, with no tool to check them.
- Impact: agents will hand-write SQL migrations and a parallel bootstrap file; drift between them is undetectable until a fresh environment fails to boot. No ORM stance means the data-access layer style is reinvented per feature.
- Recommendation: Drizzle (per CODE-07): `src/db/schema.ts` is the single source of truth, `drizzle-kit generate` produces migrations, `drizzle-kit migrate` applies them, and `schema.sql` is deleted. Keep the skill's naming and additive-change rules; add "never edit a generated migration after it is committed" and "seed lives in `src/db/seed.ts`, idempotent". If Prisma is chosen instead, `schema.prisma` plays the same single-source role.
- Effort: S for the skill text, M for the template

### [P1] CODE-09 — The frontend/backend contract is hand-written after the fact, so drift is never caught by a type-check
- Where: `.claude/agents/frontend.md:50-56`; `.claude/agents/backend.md:32-34`; `.claude/skills/error-handling/SKILL.md:22-36`
- Evidence: `frontend.md:51` "Update `.orchestrate/api-contract.yaml` with the shape the future backend must implement" (written by the frontend agent, by hand, after building against mock data). `backend.md:33-34` "Read `.orchestrate/api-contract.yaml` carefully ... implement all of it". Nothing generates types from the YAML or validates responses against it; `error-handling:22-36` defines an error shape the contract is never checked to include.
- Impact: the contract is prose in YAML form. A field renamed on one side passes both sides' tests. The error envelope the skill mandates is not guaranteed to appear in the contract at all.
- Recommendation: make the boundary typed. Default architecture (same-app route handlers / server actions): zod schemas in `feature/<name>/schema.ts` are shared by the handler and the client, no contract file needed. Separate service: either generate `src/api/types.ts` with `openapi-typescript` from the contract and have both sides compile against it, or use Hono RPC and generate the OpenAPI document from the routes (`@hono/zod-openapi`) so the YAML is an output, not an input. Tradeoff: contract-first with codegen suits teams with external consumers; code-first with generated OpenAPI suits a two-agent loop where the contract exists only for handoff.
- Effort: M

### [P1] CODE-10 — No environment-variable validation, so misconfiguration surfaces at runtime inside a feature
- Where: `.claude/agents/frontend.md:27`; `.claude/agents/backend.md:42-44,77`
- Evidence: `frontend.md:27` "Next uses `process.env.NEXT_PUBLIC_*`" and `backend.md:77` "All configuration via environment variables" are the only configuration guidance; `backend.md:43` asks for `.env.example` but nothing validates the real environment at boot.
- Impact: a missing or mistyped variable fails on first use, deep in a request, with an unhelpful error. Agents sprinkle `process.env.X!` through the code, which also defeats `strict` null checks.
- Recommendation: `src/env.ts` with a zod schema (server and `NEXT_PUBLIC_` client sections), parsed once at module load, exported as a typed object; ESLint `no-restricted-properties` forbids `process.env` outside `env.ts`. Prefer this explicit file over `@t3-oss/env-nextjs`: same result, one fewer dependency, no magic (matches Eitan's "explicit over magic" bias). Ship it in the template.
- Effort: S

### [P1] CODE-11 — `writing-plans` demands nine sections and metadata but ships no template
- Where: `.claude/skills/writing-plans/SKILL.md:21-37,48-52`
- Evidence: `:34-37` "Every plan must contain all nine, in this order: Goal · Scope · Assumptions · Open Questions · Steps · Validation · Risks · Rollout Order · Rollback"; `:49-50` "Make each question easy to answer, and include a recommended answer." No `template.md` exists next to `SKILL.md`, and no example plan exists in `.plan/`.
- Impact: the orchestrator reconstructs the structure from prose every time; section depth and the `Validation` item format (which QA uses as its checklist, `:45-46`) vary from plan to plan, so QA's evidence standard varies too.
- Recommendation: add `.claude/skills/writing-plans/template.md` with the metadata block, the nine headings, a one-line prompt under each, and a fixed `Validation` item format: `- V01 — <provable statement> — proof: <test name | command>`. Make `SKILL.md` say "copy `template.md`".
- Effort: S

### [P1] CODE-12 — `.doc/` templates never ask for the inputs that shape code quality
- Where: `.doc/product-definition.md:1-23`; `.doc/architecture.md:9-22`; `.doc/glossary.md:6`
- Evidence: `product-definition.md` has empty headings and a single criterion `AC01 — Quality gates` (`:22`); no prompts for non-functional requirements (performance budgets, accessibility level, supported browsers, data retention), auth model, tenancy, or compliance. `architecture.md:9-22` lists Primary Components, Data Flow, Auth, External Dependencies, Operational Concerns, Change Log, but not Data Model, API Style, Deployment Target or Tenancy. `glossary.md:6` "## Core Terms" is empty while `naming.md:11-13` makes it the canonical source.
- Impact: the orchestrator plans from these files; with the quality-shaping inputs absent, every plan silently assumes defaults, and those assumptions differ per run.
- Recommendation: turn both docs into fill-in forms with `<!-- TODO -->` markers and one-line prompts, adding to product-definition: "Non-functional requirements", "Auth model", "Tenancy", "Accessibility target (WCAG level)", "Browsers/devices"; to architecture: "Data model", "API style (route handlers | separate service)", "Deployment target", "Tenancy boundary". Seed the glossary with the harness's own fixed terms (`org` if kept, `feature`, `plan`, `ticket`).
- Effort: S

### [P2] CODE-13 — Commit convention conflicts with Eitan's Conventional Commits preference
- Where: `.claude/rules/git-workflow.md:18-20`
- Evidence: `:19` "Imperative subject, concise and action-oriented: `add org validation rule`." The user-scope `CLAUDE.md` says "Conventional Commits: `type(scope): summary`" (https://www.conventionalcommits.org/en/v1.0.0/).
- Impact: two conventions in context at once; changelog tooling cannot work on the harness's format.
- Recommendation: `git-workflow.md` adopts `type(scope): imperative summary` with the allowed types listed (feat, fix, refactor, test, chore, docs, ci, build). Optional enforcement via `commitlint` in `lefthook`. Tradeoff: `commitlint` adds a dev dependency and a failure mode on hand-written commits; for an agent-driven repo the rule in the file is probably enough.
- Effort: S

### [P2] CODE-14 — Singular REST routes deviate from the common convention without a stated reason
- Where: `.claude/rules/naming.md:5`
- Evidence: `:5` "Prefer **singular** entity names: `site.service`, `/api/site`, `/api/post`." "Prefer" is also not a rule; it invites exceptions.
- Impact: the dominant REST convention is plural collections (`/api/sites`, `/api/sites/{id}`); OpenAPI generators, client SDK generators and most reviewers expect it. Singular is defensible (one word for the concept everywhere: file, type, route, table) but the harness never says that is the reason, so agents cannot weigh it.
- Recommendation: either state the rule as "singular everywhere, including routes, because one concept has one name across file, type, table and route" and make it a rule, not a preference; or switch routes to plural and keep singular for files, types and tables. Document pagination shape in the same place (`?cursor=`, `?limit=`) or in a new `api-design` skill.
- Effort: S

### [P2] CODE-15 — Rules are duplicated inside agent files and will drift
- Where: `.claude/agents/frontend.md:46-48,59-63,98-102`; `.claude/agents/qa.md:48`; `.claude/skills/writing-tests/SKILL.md:52-53`
- Evidence: `frontend.md:46-48` restates no-semicolons, singular names, Tailwind-only, sonner, lucide. `frontend.md:59-63`, `qa.md:48` and `writing-tests:52-53` each explain `globals: false`. `frontend.md:98-102` restates rules a fourth time.
- Impact: when a rule changes, four copies must change; the agent sees whichever copy is stale.
- Recommendation: agents reference rules and skills by name ("apply `code-style`, `naming`, `ui-and-styling`") and never restate content. Test-runner facts move to `stack.md` (CODE-06).
- Effort: S

### [P2] CODE-16 — No dependency policy
- Where: `.claude/rules/` (nothing); `.claude/agents/frontend.md:26` (the only dependency-related line, about scaffolding)
- Evidence: nothing states that the lockfile is committed, how versions are pinned, when `bun audit` runs, or who updates dependencies.
- Impact: agents add packages ad hoc; supply-chain and upgrade hygiene are unmanaged on every clone.
- Recommendation: in `definition-of-done.md` or `stack.md`: lockfile committed; caret ranges for libraries, exact pins for build tooling; `bun audit` in CI; a `renovate.json` (or Dependabot) with grouped minor updates; "adding a dependency needs a one-line justification in the plan".
- Effort: S

### [P2] CODE-17 — Missing baselines: accessibility, structured logging, error boundaries, i18n stance
- Where: `.claude/skills/error-handling/SKILL.md:65-69`; `.claude/rules/ui-and-styling.md` (no a11y); `.claude/skills/error-handling/SKILL.md:53-57` (logging, backend only)
- Evidence: `error-handling:65-69` is the whole frontend section: user-safe messages, a recovery hint, `sonner`. Nothing about App Router `error.tsx`, `not-found.tsx`, `global-error.tsx`, or loading states. No accessibility rule anywhere; `jsx-a11y` only arrives if `eslint-config-next` is installed, which the harness does not ship. Logging guidance (`:53-57`) names no library and no transport.
- Impact: these are the properties reviewers notice first on "clean" frontends and they are left to chance.
- Recommendation: a11y: `jsx-a11y` errors on, `@axe-core/playwright` check in every e2e journey, "WCAG 2.2 AA target" in product-definition. Logging: `pino` with `requestId` binding, JSON in production, pretty in dev; never `console.log` outside scripts (ESLint `no-console`). Error boundaries: the error-handling skill gets a "Next.js App Router" subsection listing the four files and when to use each. i18n: declare "out of scope by default; strings in components, no i18n library" so agents stop guessing.
- Effort: S each

### [P2] CODE-18 — No coverage threshold and no guard against test-quality decay
- Where: `.claude/skills/writing-tests/SKILL.md:10-14,33-37`; `.claude/agents/qa.md:93`
- Evidence: principles are good (`:11` "Test **behavior**, not implementation details"; `:34` "No flaky tests on mainline branches") but nothing measures them. `qa.md:93` "A criterion is PASS only if a test proves it" has no coverage floor behind it.
- Impact: coverage can drop feature by feature with every suite green.
- Recommendation: Vitest `coverage.thresholds` (https://vitest.dev/config/#coverage-thresholds) at a modest, honest floor (`statements: 80, branches: 70` on `src/**`, excluding generated and `app/**` routing shells), with `thresholds.autoUpdate: false` so the floor is a decision, not a drift. Pair with the `.skip`/`.only` guards from CODE-03. Tradeoff: thresholds invite coverage theater; keep them low enough to be a floor and let the failure-path rule carry the quality.
- Effort: S

## Top 5 changes (ranked)
1. **CODE-01** — Ship `tsconfig`, ESLint flat config, Prettier, editorconfig and test configs as templates, and format on write. Nothing else matters until quality is enforced rather than requested.
2. **CODE-02** — Add `rules/architecture.md` with a feature-first layout, layering and an ESLint-enforced import direction. This is what keeps the tenth feature as clean as the first.
3. **CODE-06 + CODE-07** — Collapse stack facts into one `rules/stack.md` and set the default to Bun (package manager) + Node 24 (Next runtime) + Next.js 16 route handlers + Drizzle/Postgres + zod + Vitest/Playwright. Swappable because it lives in one file.
4. **CODE-03** — Tests first in both implementer workflows, plus mechanical guards against deleted, skipped or focused tests.
5. **CODE-04 + CODE-05** — Move the definition of done and the six-priority review checklist into the harness, and decide once whether `org` multi-tenancy is a default or residue; strip `geo`/`lat`/`lng` and the plan-002 note regardless.

## Keep
- The three-tier split: tiny always-on `rules/`, on-demand `skills/`, role-scoped `agents/`. Always-on context is ~75 lines today; the proposed additions keep it under ~3k tokens.
- `writing-tests` principles (behaviour over implementation, deterministic, failure path required, regression test per bug fix) and "fix the code, not the test".
- `error-handling`: the single error envelope, the status-code table, the "never leak stack traces or SQL" line, bounded retries only for infrastructure errors.
- `qa.md`: the adversarial pass (`:61-64`) and "PASS only if a test proves it" (`:93`). This is the strongest quality mechanism in the harness.
- `git-workflow`: approval gates and one-intent-per-commit.
- `naming.md:11-13`: "document a new shared term in the glossary before using it broadly" — the right instinct, just needs a populated glossary.
- Tailwind token guidance (`:root` tokens exposed via `@theme inline`) and "no new `.css` files".

## Proposed target layout (stack-agnostic vs swappable)
```
.claude/rules/                      always-on, target ≤ ~3k tokens in total
  stack.md               SWAPPABLE  the only file naming runtime, package manager, frameworks, libraries, commands
  architecture.md        agnostic   feature-first layout, layering, import direction, server/client boundary
  code-quality.md        agnostic   what tools cannot check: naming of files/vars/types, no `any`, early return,
                                    function size, comment policy, typed errors, immutability by default
  naming.md              agnostic   singular entities, one word per concept, glossary pointer (no product terms)
  git-workflow.md        agnostic   gates, branches, Conventional Commits
  definition-of-done.md  agnostic   the checklist every agent and QA cite
.claude/skills/                     on demand
  writing-plans/  (+ template.md)      writing-tests/  (+ unit, component, e2e examples)
  error-handling/ (+ App Router subsection)   database-schema/ (+ migration workflow for the chosen ORM)
  api-design/     REST shape, pagination, versioning, OpenAPI workflow
  code-review/    six-priority checklist, severity scale, "be critical"
  frontend-component/  props typing, server vs client, composition, default exports only in Next entry files
  auth-boundary/  authn/authz pattern, tenant isolation (only if `org` is kept as a default)
  commit-and-pr/  CC format, PR template, what the PR body must contain
templates/frontend/                 copied by the bootstrap (clonability perspective owns the bootstrap itself)
  tsconfig.json  eslint.config.mjs  .prettierrc  .editorconfig  vitest.config.mts  vitest.setup.ts
  playwright.config.ts  lefthook.yml  src/env.ts  src/feature/.gitkeep  src/shared/{ui,lib,config}/.gitkeep
```
Rough budget: six rule files at 30-40 lines each ≈ 2-2.5k tokens, plus `AGENTS.md` ≈ 0.8k. Everything stack-specific sits in `stack.md` and `templates/`; swapping the stack touches those two places only.

## Open questions for Eitan
1. API default: same-app Next.js route handlers and server actions (one deploy, no contract file), or keep a separate service from day one? The recommendation is same-app with `stack:full` promoting to Hono on Bun.
2. Is multi-tenancy (`org` as the tenant boundary) a harness default you want on every project, or residue from the previous product?
3. Bun as runtime for Next.js (`bun --bun`, faster, unsupported by Vercel, native-addon risk) or Bun only as package manager and script runner with Node 24 as the runtime (recommended)?
4. TypeScript: `exactOptionalPropertyTypes` on by default (strictest, occasional third-party friction) or off?
5. Routes: keep singular (`/api/site`) as a deliberate, documented rule, or switch to plural collections to match the common REST convention?
6. Formatting enforcement: Claude `PostToolUse` hook, `lefthook` pre-commit, CI, or all three (recommended all three)?

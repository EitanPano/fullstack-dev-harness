# Harness audit — synthesis
Date: 2026-10-20 · Synthesised by the parent session (Fable 5.1) from five perspective reports
in this directory. Every roadmap item below traces to finding ids in those reports.

Goal measured against: *clone this harness, start a fullstack project from zero, get very
high quality clean code.*

## Overall rank: 3.5 / 10

| Perspective | Report | Score | Weight | One-line verdict |
|---|---|---|---|---|
| Security | `02-security.md` | 3 | 25% | Right architecture (hooks over permissions, exit 2), regex-thin implementation; 72 of 104 should-block payloads get through; all hooks fail open |
| Clean code | `03-clean-code.md` | 4 | 25% | Right shape (tiny rules, skills, role agents, QA on evidence); nothing enforced by shipped config; no layering rule |
| Mechanics | `01-mechanics.md` | 4 | 20% | Static config valid; the one guardrail that gives the loop its shape never receives its role signal |
| Clonability | `04-clonability.md` | 3 | 15% | Good layout and intent; a fresh clone cannot execute the documented process; ~2 days to first feature |
| Process | `05-process.md` | 3 | 15% | Sound role model on paper; driver missing, no review stage, no failure path, Linear mandatory |
| **Weighted** | | **3.45** | | |

Reading the number: the harness is a well-designed *skeleton* with the enforcement layer
unplugged. Four of the five perspectives independently converged on the same two root causes,
which is why the fixes are concentrated and mostly small.

## Independent verification by the parent

- Repo untouched: 34 files = 29 originals + 5 reports. Nothing else modified.
- Security bypass matrix replayed from the saved payload files: counts match the report
  (destructive 10 blocked / 33 bypass / 5 false-positive; secret 18 / 24 / 4; boundary 9 / 10 / 1;
  fail-open probes 5 / 5 bypass).
- Mechanics payloads replayed: a payload carrying `agent_type: "frontend"` writing to
  `backend/x.ts` exits 0 today and 2 with `AGENT_ROLE` set; Node 20 emulation
  (`--no-experimental-detect-module`) crashes the boundary hook with exit 1.
- Every P0 in every report carries executed evidence or a `file:line` quote. No downgrades.

## The two root causes

**R1 — The enforcement layer is unplugged.** The boundary hook keys on `AGENT_ROLE`, which
only the missing `dev-loop.js` would set, while Claude Code already sends `agent_type` in every
hook payload inside a subagent (docs cited in `01-mechanics.md` MECH-01 and `05-process.md`
PROC-02). All three hooks `exit(0)` on any parse failure or crash, and the ESM hook crashes on
the Node 20 that `backend.md` mandates. Net effect: the role lanes, the secret guard and the
destructive guard are prose in every session a clone can start.
*(MECH-01, MECH-02, SEC-01, PROC-02, CLONE-01, SEC-13)*

**R2 — Quality is requested, never enforced.** No `tsconfig`, ESLint, Prettier, editorconfig,
test config, coverage floor, layering rule, definition of done or review checklist ships with
the harness. The first `create-next-app` run on a clone decides strictness and layout, and the
agents are told to "match the surrounding code". The stack is restated in seven files with
contradictions (npm vs Bun, Node 20 vs 24, Express beside Next route handlers).
*(CODE-01, CODE-02, CODE-04, CODE-06, CODE-07, CLONE-12)*

Everything else is either a consequence of R1/R2 or template hygiene.

## Deduplicated findings, ranked

Severity: **P0** breaks a clone, silently defeats a guardrail, or steers agents toward wrong
code. **P1** materially lowers code quality or costs time on every project. **P2** polish.

| # | Sev | Cluster | Finding ids | Effort |
|---|---|---|---|---|
| 1 | P0 | Boundary hook never gets a role signal | MECH-01, PROC-02, CLONE-01 | S |
| 2 | P0 | All hooks fail open (parse error, crash, Node 20 ESM) | MECH-02, SEC-01, SEC-13, CLONE-09 | S |
| 3 | P0 | Loop driver missing; process defined only in terms of it | CLONE-01, PROC-01, PROC-10, MECH-11 | M |
| 4 | P0 | `frontend/` app does not exist and scaffolding it is forbidden | CLONE-02 | M |
| 5 | P0 | Destructive + secret guards are one-spelling regexes; zero PowerShell coverage; false positives block routine work | SEC-02, SEC-04, SEC-08, SEC-09, MECH-09 | M |
| 6 | P0 | Role boundary covers Edit/Write only; Bash redirects, `sed -i`, NotebookEdit bypass; agent can unwire its own hook | SEC-03, SEC-06, SEC-07 | M |
| 7 | P0 | No shipped quality config; `next lint` removed in Next 16 so copied scripts fail | CODE-01, CODE-10, CODE-18 | M |
| 8 | P0 | No architecture / layering / import-direction rule | CODE-02 | M |
| 9 | P0 | No `.gitignore`, not a git repo; first `git add .` stages run output and any `.env` | CLONE-03, SEC-10 | S |
| 10 | P0 | Demo residue feeds the first planning run ("social app", `profile page`, `hooha.md`) | CLONE-04, CLONE-15, MECH-12 | S |
| 11 | P1 | Stack named in seven files with contradictions; npm vs Bun; Node 20 vs 24; no `package.json`/`engines` | CODE-06, CODE-07, CLONE-12, CLONE-08, MECH-06, MECH-07, CODE-15 | M |
| 12 | P1 | No review stage; `security-reviewer` orphaned; QA FAIL has no owner or retry bound; magic-string handoffs | PROC-03, PROC-04, PROC-05, SEC-10, CODE-04 | M |
| 13 | P1 | All agents on `opus` against the model policy; no cost trace | PROC-06, MECH-13 | S |
| 14 | P1 | Hook invocation depends on cwd; full blocked command echoed to transcript | MECH-03, SEC-14 | S |
| 15 | P1 | MCP servers pre-approved for a `.mcp.json` that does not exist; Linear mandatory, Figma assumed | MECH-05, SEC-05, CLONE-06, PROC-09 | S |
| 16 | P1 | Write-path constraints have three owners that already disagree (e2e dir, dead `tests/` lane, orchestrator unenforced) | PROC-07, CLONE-12 | S |
| 17 | P1 | Product residue in rules and skills (`org`, `geo`, `lat`/`lng`, plan-002 note); multi-tenancy assumed without being decided | CODE-05, CLONE-13 | S |
| 18 | P1 | Tests written after implementation; nothing detects deleted or skipped tests | CODE-03, PROC-12 | S/M |
| 19 | P1 | Rules probably loaded twice (native + `@` import); Cursor/Copilot pointers never see them | MECH-04, MECH-08, CLONE-11 | S |
| 20 | P1 | No bootstrap step; `.doc/` templates have no fill-in markers or quality-shaping prompts | CLONE-05, CLONE-07, CODE-12, CLONE-14 | M |
| 21 | P1 | Guardrails have no tests | SEC-11 | S |
| 22 | P1 | `writing-plans` has no template; `database-schema` has two sources of truth and no ORM stance; FE/BE contract is hand-written YAML never type-checked | CODE-11, CODE-08, CODE-09, PROC-08 | M |
| 23 | P1 | No lifecycle: existing clones cannot receive harness fixes | CLONE-10 | L |
| 24 | P2 | Commit convention conflicts with Conventional Commits; singular routes undocumented; no dependency policy | CODE-13, CODE-14, CODE-16 | S |
| 25 | P2 | Missing baselines: a11y, structured logging, App Router error files, i18n stance | CODE-17 | S |
| 26 | P2 | `--force-with-lease` blocked by prefix accident; trust-dialog caveat undocumented; secret hook on `*` matcher | SEC-12, MECH-14, MECH-10 | S |
| 27 | P2 | `frontend`/`backend` descriptions give auto-delegation nothing to match | PROC-11, MECH-13 | S |

## Where the reports disagree, and the call

1. **Where destructive denies live.** Mechanics: keep them in the hook only, drop the
   overlapping `permissions.deny` lines. Security: move high-confidence patterns into
   `permissions.deny` (evaluated even when a hook allows, AST-parses PowerShell, canonicalises
   aliases) and rewrite the hook as a tokenised intent matcher on `Bash|PowerShell`.
   **Call: Security's layering.** Deny rules are the only layer that reaches the PowerShell
   tool with alias normalisation. Tradeoff: two places to maintain; mitigated by the hook test
   suite (#21) and a comment in `settings.json` naming the split.
2. **`security-reviewer`: merge or keep.** Process: one `reviewer` agent, security first in
   Eitan's priority order. Security: a required separate stage with an ASVS-style checklist.
   **Call: one reviewer agent on Opus with security as the first section of its checklist.**
   Cheaper, one report, and the checklist order already makes security hard to skip. Revisit if
   security findings get crowded out in practice.
3. **Default API shape.** Clean code: same-app Next.js route handlers and server actions by
   default, Hono on Bun only for `stack:full`. Process: contract-in-plan and parallel FE/BE for
   `stack:full`. These compose: same-app default needs no contract file; for `stack:full` the
   orchestrator's plan carries the contract draft, the backend emits OpenAPI from code
   (`@hono/zod-openapi`), and FE types are generated from that output. **Call: adopt both.**
   Tradeoff stated in `03-clean-code.md` CODE-07: same-app loses independent scaling.
4. **Node floor.** Mechanics: `>=22.12` or rename hooks to `.mjs`. Clean code: Node 24 LTS as
   the Next runtime, Bun as package manager and script runner. **Call: Node 24 as the declared
   runtime, Bun for install and scripts, and hooks renamed to `.mjs` regardless** so they load on
   any Node without depending on module detection or a `package.json` field.
5. **Rules location for multi-tool parity.** Mechanics and Clonability both offer "drop the `@`
   imports" vs "inline rules into AGENTS.md". **Call: pending Eitan's answer to open question 1.**
   Default if no answer: Claude-Code-first, drop the four `@` lines, delete the Cursor and
   Copilot pointer files (both tools read `AGENTS.md` natively anyway).

## Roadmap

Ordered by what unblocks what. Phase 0 and 1 are the guardrail layer and are almost entirely
small edits; nothing in later phases is trustworthy until they land.

### Phase 0 — Plug the enforcement layer in (about 1 day, all S)
Branch: `chore/harness-audit-fixes` after `git init`.
- `git init`, root `.gitignore` (`.env*`, `!.env.example`, `.orchestrate/*`,
  `!.orchestrate/README.md`, `node_modules/`, `.next/`, `coverage/`, `playwright-report/`,
  `test-results/`, `.claude/settings.local.json`). [#9]
- Root `package.json`: `"type": "module"`, `"private": true`, harness `version`,
  `engines.node >=24`, `packageManager` Bun, scripts `hooks:test`. [#2, #11]
- Rename hooks to `.mjs`; `settings.json` hook entries to exec form with
  `${CLAUDE_PROJECT_DIR}` and `"onFailure": "block"`. [#2, #14]
- In every hook: `exit(2)` on parse failure, empty stdin, missing `tool_input`; resolve the
  project root from `CLAUDE_PROJECT_DIR ?? payload.cwd`; print the matched pattern and program,
  not the full command. [#2, #14]
- Boundary hook: `const role = payload.agent_type ?? process.env.AGENT_ROLE`; unknown role with
  a value set → exit 2; empty `file_path` → exit 2; `path.resolve` before `path.relative`;
  compare directory prefixes with trailing `/` and files with `===`; inspect `notebook_path`.
  [#1, #6 part]
- Promote the audit's 134-payload matrix into `.claude/hooks/__tests__/` run by `node --test`
  from `bun run hooks:test`; assert expected exit per case. [#21]
- Delete `hooha.md`; strip README product line, `profile page`, `Setup` done item, the
  plan-002 note, "demo" and `dev-loop.js` comments in hooks. [#10, #17 part]

### Phase 1 — Harden the guards (1–2 days, M)
- `permissions.deny`: gitignore-semantics secret rules (`Read(.env*)`, `Read(**/*.pem)`,
  `Read(**/id_rsa*)`, `Read(**/secrets.*)`, `Read(**/credentials*)`, `Read(~/.aws/**)`,
  `Read(~/.ssh/**)`, `Read(~/.npmrc)`), `Edit(.claude/**)` and `Edit(.git/**)` for role
  sessions, and a `PowerShell(...)` twin for every `Bash(...)` destructive deny. [#5]
- Destructive hook as a tokenised intent matcher (split on `&&`/`||`/`;`/`|`, normalise `rm`
  flag forms, program + flag-set tuples, SQL without the end anchor, `prisma migrate reset`,
  `drizzle-kit drop`, `rimraf`, `find -delete`, `git clean`/`branch -D`/`stash clear`/`push +ref`,
  docker prune, `FLUSHALL`, `dropDatabase`); registered on `Bash|PowerShell`; skip quoted
  message bodies and comments to kill the false positives. [#5]
- Secret hook: name list above plus env-dump detection (`printenv`, `env`, `set`,
  `Get-ChildItem Env:`, `console.log(process.env)`, `Bun.env`, `-r dotenv/config`); inspect every
  string and string-array field of `tool_input`, not four named ones. [#5]
- Boundary hook on `Bash|PowerShell` too: with a role set, deny shell writes (`>`, `>>`, `tee`,
  `sed -i`, `cp`, `mv`, `rsync`, `git apply`) and require Edit/Write. [#6]
- Remove `enabledMcpjsonServers`; ship `.mcp.json.example` with pinned versions; add
  `permissions.disableBypassPermissionsMode: "disable"`; document `acceptEdits` + allow list as
  the loop's permission mode. [#15, #6]
- `.env.example` at root with `LINEAR_API_KEY=` placeholder; policy note that real secrets live
  in the shell profile or keychain, never in the working directory Bun and Next auto-load. [#5]

### Phase 2 — Rewire the loop onto native Claude Code (1–2 days, M)
- `.claude/skills/dev-loop/SKILL.md` replaces every `dev-loop.js` reference: pick task → branch
  → orchestrator subagent writes plan (`Status: draft`) → human edits `Status: active` →
  implementers → reviewer → QA → human commit gate. Skill refuses to start implementers on a
  draft plan. [#3]
- JSON stage reports with a committed schema (`stage`, `task`, `files_changed`, `tests`,
  `ac_claimed`, `verdict`, `findings`, `handoff`) validated by a `SubagentStop` hook that sends
  the agent back on an invalid report; bounded fix loop (2 rounds) on `verdict: fail` or
  `blocking ≠ []`; drop `STATUS: DONE` and `TICKETS_JSON`. [#12]
- `reviewer` agent (absorbs `security-reviewer`): Opus, `disallowedTools: Edit, Write,
  NotebookEdit`, checklist in Eitan's six-priority order, JSON report with `blocking`/`advisory`.
  Implementers and QA on Sonnet. `SubagentStop` hook appends `{ts, agent_type, agent_id,
  transcript}` to `.orchestrate/trace.jsonl`. [#12, #13]
- `tracker: none | linear` at the top of `000-backlog.md`; Job B skipped on `none`; Figma steps
  conditional on the `figma:` marker and the tool being present. Backlog grammar documented. [#15]
- One owner per constraint: write paths in the hook table only; tool availability in frontmatter
  only; behaviour in prose. Resolve e2e dir to `frontend/tests/e2e/`, delete the root `tests/`
  lane, give the orchestrator `disallowedTools` on app code. [#16]
- Real `description` lines for `frontend` and `backend`; `disallowedTools: Agent` and `maxTurns`
  on implementers; `skills: [writing-tests]` preload. [#27]

### Phase 3 — Make quality enforced, not requested (2–3 days, M)
- `.claude/rules/stack.md`: the only file allowed to name runtime, package manager, frameworks,
  libraries and commands. Default: Bun 1.4 (install + scripts), Node 24 (runtime), Next.js 16 App
  Router + React 19 + TypeScript + Tailwind v4, same-app route handlers and server actions
  (Hono on Bun when `stack:full`), Postgres + Drizzle, zod, Vitest + RTL + jsdom, Playwright +
  axe, ESLint 9 flat + typescript-eslint strictTypeChecked + Prettier `semi: false`. Agents and
  skills reference it instead of restating. [#11]
- `.claude/rules/architecture.md`: feature-first `src/feature/<name>/`, `src/shared/`, `app/`
  routing-only, Server Components by default; backend `route → validation → service →
  repository`; import direction enforced by `import-x/no-restricted-paths`. [#8]
- `.claude/rules/definition-of-done.md` and `.claude/skills/code-review/SKILL.md` (six-priority
  order, P0/P1/P2 scale, "be critical"). [#12]
- `templates/frontend/`: `tsconfig.json` (strict + `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, unused checks),
  `eslint.config.mjs`, `.prettierrc`, `.editorconfig`, `vitest.config.mts` (coverage floor
  80/70, `allowOnly: false`), `vitest.setup.ts`, `playwright.config.ts`, `lefthook.yml`,
  `src/env.ts` (zod, `process.env` banned elsewhere). `lint` script is `eslint .`. [#7]
- `PostToolUse` hook on `Edit|Write` runs `prettier --write` on the touched file; `lefthook`
  pre-commit and CI (`.github/workflows/ci.yml` running `bun run check`) repeat the gates. [#7]
- Implementer workflow reordered: plan `Validation` → failing tests → implement → green →
  refactor. QA step treats a deleted test, `.skip` or `.only` in the diff as FAIL. [#18]
- `writing-plans/template.md` with a fixed `Validation` item format
  (`- V01 — <statement> — proof: <test | command>`); `database-schema` rewritten for Drizzle
  (`schema.ts` single source, generated migrations, `schema.sql` deleted); `api-design` skill
  (REST shape, pagination, singular-route rationale, OpenAPI workflow). [#22]
- Decide `org`: either declare multi-tenancy in `architecture.md` and keep `org` as a
  consequence, or strip it from the six places. Delete `geo`, `lat`/`lng` regardless. [#17]
- Conventional Commits in `git-workflow.md`; dependency policy and a11y/logging/error-file
  baselines in `definition-of-done.md` and the `error-handling` skill. [#24, #25]

### Phase 4 — Make it clonable (1–2 days, M, plus L for the split)
- `scripts/bootstrap.mjs` (deterministic: project name, stack preset, README rewrite, backlog
  reset, `.gitignore`, `git init`, first branch) plus `/bootstrap-project` skill (judgment: walk
  `.doc/` markers, run the pinned frontend scaffold recipe, hook self-test, first backlog line).
  Frontend scaffold generated once from a pinned recipe rather than committed. [#4, #20]
- `.doc/` as fill-in forms with `<!-- FILL: … -->` markers and a "ready to plan" checklist;
  product-definition gains NFRs, auth model, tenancy, WCAG target, browsers; architecture gains
  data model, API style, deployment target. Orchestrator refuses to plan while a `FILL` marker
  remains in a section it depends on. [#20]
- `CHANGELOG.md`, harness `version`, LICENSE, PR template mirroring the definition of done.
  [#11, #23]
- Later: split into a versioned Claude Code plugin (agents, skills, hooks, output-styles,
  optional `.mcp.json`) plus a one-shot template repo (AGENTS.md, rules, `.doc/`, `.plan/`,
  settings, root scaffolding). Two artifacts to release; rules and docs stay project-owned.
  [#23]

Estimated time-to-first-feature: ~1.5–2.5 working days today; ~2–3 hours after Phases 0–4
(`04-clonability.md`).

## Proposed target layout

```
AGENTS.md                      canonical, plain-text index of rules (no @ imports if Claude-first)
CLAUDE.md                      @AGENTS.md
package.json                   type: module, engines, packageManager, scripts (check, hooks:test)
.gitignore  .editorconfig  .env.example  .mcp.json.example  CHANGELOG.md  LICENSE
.github/workflows/ci.yml  .github/PULL_REQUEST_TEMPLATE.md
scripts/bootstrap.mjs
.claude/
  settings.json                permissions (allow + deny incl. PowerShell twins), hooks (exec form, onFailure: block)
  rules/                       stack.md (swappable) · architecture · code-quality · naming · git-workflow · definition-of-done
  skills/                      dev-loop · writing-plans (+template.md) · writing-tests · error-handling · database-schema
                               · api-design · code-review · bootstrap-project · cutting-a-release
  agents/                      orchestrator (opus) · frontend (sonnet) · backend (sonnet) · reviewer (opus) · qa (sonnet)
  hooks/                       *.mjs, fail-closed, cwd-independent; __tests__/ with the payload matrix
.doc/                          product-definition · architecture · glossary — fill-in forms with FILL markers
.plan/                         000-backlog.md (grammar + tracker: header) · NNN-date-topic.md
.orchestrate/                  README.md · schema/report.schema.json · report/*.json · trace.jsonl · audit/
templates/frontend/            tsconfig · eslint.config.mjs · .prettierrc · vitest/playwright configs · lefthook.yml · src/env.ts
frontend/                      generated once by the bootstrap recipe
backend/                       only on stack:full
```

## Clone checklist v1 (target state)

1. Copy the template (GitHub template or `degit`); note the harness version from `package.json`.
2. `bun run bootstrap` → project name, stack preset, README, backlog reset, `.gitignore`,
   `git init`, branch `chore/bootstrap`.
3. Accept the workspace trust dialog, then `bun run hooks:test` and confirm one blocked write.
4. Copy `.env.example` → shell profile or keychain, never into the working directory; copy
   `.mcp.json.example` only if Figma or Linear are wanted and approve the servers once.
5. `/bootstrap-project`: fill `.doc/` markers, run the pinned frontend scaffold recipe,
   `bun run check` green, first backlog line with `tracker:`/`figma:`/`stack:` markers.
6. `/dev-loop` on the first task; approve the plan by editing `Status: active`; review
   `review.json` and `qa.json` before the commit gate.

## Decisions needed from Eitan

Deduplicated from the five reports. Each changes what Phase 3 or 4 builds.

1. **Multi-tool parity (Cursor, Copilot):** required, or Claude Code only? Decides whether rules
   stay in `.claude/rules/` with the `@` lines dropped, or get inlined into `AGENTS.md`.
2. **API default:** same-app Next.js route handlers and server actions, with a separate Hono
   service only on `stack:full` (recommended), or a separate service from day one?
3. **`org` multi-tenancy:** a deliberate harness default, or residue to strip?
4. **Bun's role:** package manager and script runner with Node 24 as the Next runtime
   (recommended), or `bun --bun` as the runtime too (faster, unsupported by Vercel, native-addon
   risk)?
5. **Reviewer stage:** one agent with security first (recommended), or a separate security stage?
6. **Role-agent permission mode:** `acceptEdits` with an allow list (recommended), or
   `bypassPermissions` inside a container? Decides whether the hooks must be airtight or
   defence-in-depth.
7. **Ticketing and secrets:** local markdown tickets by default with Linear opt-in
   (recommended)? Is a shell-profile or keychain source for `LINEAR_API_KEY` acceptable?
8. **Frontend scaffold:** generated once by a pinned recipe (recommended), or committed in the
   template?
9. **Plugin + template split:** now, or a single template repo with manual re-sync until the
   loop has run a few projects?
10. **Smaller calls:** `exactOptionalPropertyTypes` on by default; singular routes kept as a
    documented rule vs plural collections; `--force-with-lease` and `git branch -D` policy for
    agents; approval gate by hand-editing `Status:` (recommended) vs an in-session prompt.

## What to keep (consensus across all five reports)

- Hooks as the enforcement layer, wired only through `.claude/settings.json`, with "hooks win".
  Confirmed by the docs to hold in every permission mode; the implementation is what needs work.
- `CLAUDE.md → @AGENTS.md` and the three-tier split: tiny always-on rules, on-demand skills,
  role-scoped agents. Always-on context is ~75 lines; keep it under ~3k tokens after Phase 3.
- Durable (`.doc/`, `.plan/`, `.claude/`) vs generated (`.orchestrate/`) split; never `docs/`.
- One plan per task with a `Validation` section QA uses as its checklist; "PASS only if a test
  proves it"; the adversarial QA pass; "fix the code, not the test".
- Backlog markers (`figma:`, `stack:full`) as the opt-in mechanism; extend with `tracker:`.
- `error-handling`'s single error envelope and status table; `writing-tests` principles.
- Secret hook's `.env.example` carve-out and the decision not to scan Write `content`; the
  boundary hook's path normalisation; comments that record why a rule is shaped as it is.

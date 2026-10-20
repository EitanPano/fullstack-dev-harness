# Clonability audit — fullstack-dev-harness
Date: 2026-10-20 · Reviewer: clonability fork · Model: Fable 5.1

## Method
- Read all 29 files in the repo (inherited from the parent session), then re-verified every
  path and leftover with `grep -rn` across `*.md`, `*.js`, `*.json`, `*.mdc` to get
  `file:line` evidence. Checked existence of root scaffolding files with `ls`.
- Environment: Node v24.15.0, Bun 1.4.0, git 2.45.2 on Windows 11, PowerShell 5.1 as
  Eitan's shell, Git Bash as Claude's Bash tool. Not a git repository.
- Docs consulted (code.claude.com): [Plugins overview](https://code.claude.com/docs/en/plugins),
  [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference),
  [How Claude remembers your project](https://code.claude.com/docs/en/memory)
  (`@` imports, `.claude/rules/` auto-discovery, native `AGENTS.md` support).
- No repo mutation. Simulated the "clone and start project X" walkthrough by dry reasoning
  against what each file tells a fresh user and a fresh orchestrator run.

## Score: 3/10
The skeleton is well thought out: a single source of truth (`AGENTS.md`), hooks as hard
boundaries rather than prose, a clear split of durable vs generated directories, and a
backlog syntax that already carries feature flags. But a fresh clone cannot execute the
documented process today. The loop driver does not exist, the app the agents are told to
"work inside" does not exist and they are forbidden from creating it, there is no git
hygiene, and the demo residue (social app, `profile page`, `Hooha`) would steer the very
first planning run toward the wrong product. The first hour is spent discovering that the
README's step 3 ("Execute the dev loop") has nothing to execute.

## Scorecard
| Sub-dimension | 0-10 | Why (one line) |
|---|---|---|
| Runs as documented after clone | 1 | No `dev-loop.js`, no `frontend/`, no `.mcp.json`; README step 3 has no executable |
| Dangling references | 2 | 9 refs to `dev-loop.js`, 7 to `frontend/` config files, 2 to a root `package.json`, 3 to `schema.sql`, all nonexistent |
| Product neutrality (residue) | 3 | README/backlog/output-style/naming/skills still carry the previous demo product |
| Root scaffolding | 2 | No `.gitignore`, `package.json`, `.editorconfig`, version pin, CI, LICENSE, PR template |
| Bootstrap path | 1 | No init script, skill, or checklist; `.doc/` templates have no fill-in markers |
| External coupling optional | 2 | Figma + Linear assumed by settings, orchestrator, frontend; no degraded mode |
| Multi-tool portability | 4 | Cursor/Copilot pointers reach `AGENTS.md` but never the `@`-imported rules |
| Shell portability (Windows) | 3 | 14 `cd x && npm …` commands; PowerShell 5.1 cannot run `&&`; npm vs Bun pref |
| Update / lifecycle story | 1 | No way for an existing clone to receive harness improvements |
| Layout and intent clarity | 8 | Directory contract, hooks-win rule, generated-vs-durable split are clear and good |

## Findings (most severe first)

### [P0] CLONE-01 — The loop driver does not exist, so the documented process cannot run
- Where: `README.md:40` ("Execute the dev loop in your local environment"), `AGENTS.md:18`,
  `.claude/agents/orchestrator.md:20`, `orchestrator.md:70`,
  `.claude/hooks/enforce-agent-boundaries.js:6-7`, `block-secret-file-access.js:9,12`,
  `.claude/settings.json:3`, `README.md:33`
- Evidence: `grep -rn "dev-loop"` returns 9 references; `ls dev-loop.js` → "No such file".
  `enforce-agent-boundaries.js:30` reads `process.env.AGENT_ROLE`, which only the missing
  driver sets, so the boundary hook is inert in every session a clone can actually start.
- Impact: a new user follows the README, reaches step 3, and has nothing to run. The
  orchestrator/frontend/qa contract (`TICKETS_JSON`, `STATUS: DONE`, branch creation,
  approval gate) is all specified against a program that is not there. The strongest
  guardrail (per-role write paths) never fires.
- Recommendation: decide the driver model before anything else (process fork's domain).
  Either (a) ship `dev-loop.js` in the template with a documented contract, or (b) rewire
  the loop onto native Claude Code subagents and give the boundary hook a role signal that
  does not depend on an external process. Until then, remove the claims from README,
  AGENTS.md, hook comments, and settings.json so a clone is not misled.
- Effort: L (build) / M (rewire + doc cleanup)

### [P0] CLONE-02 — The app the agents must "work inside" does not exist, and scaffolding it is forbidden
- Where: `AGENTS.md:31` ("`frontend/` — the Next.js app"), `.claude/agents/frontend.md:12-13`
  ("implement the feature in the existing Next.js app"), `frontend.md:26` ("Never run
  `npm create vite`, `create-next-app`, or `npm init` — you would destroy the app"),
  `frontend.md:59-61` (`frontend/vitest.config.mts`, `vitest.setup.ts`,
  `playwright.config.ts`), `frontend.md:23` (`frontend/src/mock/seed.ts`),
  `.claude/skills/writing-tests/SKILL.md:48-50`, `frontend.md:99` ("Never scaffold over
  the existing app")
- Evidence: `ls frontend` → "No such file or directory". Every referenced config file is
  described in detail (jsdom, `globals: false`, chromium, port 3000) but none exists.
- Impact: deadlock on the first ticket. The frontend agent is told the app exists, told the
  exact test config to rely on, and told never to create one. A clone either hand-builds a
  Next.js app that matches six prose descriptions, or edits the agent file to allow
  scaffolding. Both cost hours and both are undocumented.
- Recommendation: pick one and make it explicit: (a) commit a minimal, pinned
  `frontend/` scaffold in the template (fastest clone, but the template now carries
  dependencies to keep current), or (b) add a `bootstrap-frontend` skill with an exact
  recipe (`bun create next-app@<pinned> frontend --ts --tailwind --app --src-dir`, then
  the vitest/playwright/tailwind-v4 setup) that the bootstrap step runs once and the
  frontend agent is forbidden from re-running. Option (b) fits "opinionated default,
  swappable" better because the recipe is the one place the stack is named.
- Effort: M

### [P0] CLONE-03 — No `.gitignore`, no git repo, while the docs assume both
- Where: `.orchestrate/README.md:4-5` ("All of it is gitignored (`.orchestrate/*`, with
  this README negated)"), `.claude/rules/git-workflow.md:12-14` (work on branches, never
  `main`), `orchestrator.md:20` (driver "creates the git branch")
- Evidence: `ls .gitignore` → missing; parent session confirmed "Is a git repository: false".
- Impact: the first `git init && git add .` on a clone commits `.orchestrate/*` run output,
  and the first `.env` a user creates for `LINEAR_API_KEY` (the file the secret hook is
  built to protect, `block-secret-file-access.js:9`) is one `git add .` away from a push.
  `node_modules/`, `.next/`, `playwright-report/`, `test-results/` follow once `frontend/`
  exists.
- Recommendation: ship a root `.gitignore` covering `.env`, `.env.*`, `!.env.example`,
  `.orchestrate/*`, `!.orchestrate/README.md`, `node_modules/`, `.next/`, `dist/`,
  `coverage/`, `playwright-report/`, `test-results/`, `.claude/settings.local.md`,
  `CLAUDE.local.md`. Make `git init` + first branch part of the bootstrap step (CLONE-07).
- Effort: S

### [P0] CLONE-04 — Demo product identity leaks into the first planning run
- Where: `README.md:1` ("# AI4Dev Agent Files"), `README.md:5` ("frontend-first social app
  MVP"), `README.md:15` ("Product: TBD"), `.plan/000-backlog.md:10` (`- [ ] profile page`),
  `.plan/000-backlog.md:15` (`- [x] Setup`), `.claude/output-styles/hooha.md:1-7`
- Evidence: quoted lines above. `.doc/product-definition.md` is empty except `AC01`.
- Impact: the orchestrator's Job A reads the backlog and the product definition
  (`orchestrator.md:41-42`). On a fresh clone that means "plan a profile page for an
  undefined product", and `orchestrator.md:74` ("Never invent scope the plan and product
  definition do not support") makes the only honest output an empty plan. `hooha.md` is
  selectable from `/output-style` in every clone.
- Recommendation: strip to a neutral template: README becomes "<project-name> — built on
  fullstack-dev-harness vX", backlog has an example line in a comment and an empty queue,
  delete `hooha.md`. Put the product name in exactly one place (`.doc/product-definition.md`
  title) and have README reference it.
- Effort: S

### [P1] CLONE-05 — `.doc/` templates are bare headings with no fill-in markers or minimum questions
- Where: `.doc/product-definition.md:3-22` (empty `Purpose`, `Product Vision`, …; one AC),
  `.doc/architecture.md:9-22` ("Recommended Sections" listing instead of sections),
  `.doc/glossary.md:7` (empty `Core Terms`)
- Evidence: quoted structure. `orchestrator.md:41-42` and `writing-plans/SKILL.md:14`
  make `product-definition.md` the planning input; `qa.md:33` makes every AC a checklist.
- Impact: nothing tells a new user how much they must write before the loop can produce a
  legitimate plan. Under-filled docs produce vague plans; the QA agent then has nothing to
  mark PASS/FAIL beyond `AC01`.
- Recommendation: add an explicit marker convention, e.g. `<!-- FILL: one sentence, who the
  product is for -->` under every heading, plus a `## Ready to plan?` checklist at the top
  of `product-definition.md`: product name, primary user, 3 core journeys, 3+ testable ACs
  in `ACnn —` form, in-scope/out-of-scope, stack choice (link to CLONE-12's stack doc),
  auth/org model yes/no. Have the orchestrator refuse to plan while any `FILL` marker
  remains in a section it depends on (cheap `grep` the bootstrap step can also run).
- Effort: S

### [P1] CLONE-06 — Figma and Linear are hard dependencies with no degraded mode
- Where: `.claude/settings.json:4` (`"enabledMcpjsonServers": ["figma", "linear"]`),
  `settings.json:3` (explains why), `orchestrator.md:12,22,61-70` (Linear team id,
  tickets, `TICKETS_JSON`), `orchestrator.md:48`, `frontend.md:43` (Figma tool),
  `block-secret-file-access.js:9` (`LINEAR_API_KEY`)
- Evidence: `.mcp.json` does not exist, so the two enabled server names resolve to nothing.
  The backlog already models optionality for design (`000-backlog.md:5`, `figma:<url>`),
  but ticketing has no local fallback.
- Impact: a clone that does not use Linear cannot complete Job B; one that does must first
  author `.mcp.json` from scratch with no template. Figma degrades gracefully only by
  accident (the URL is optional).
- Recommendation: ship `.mcp.json.example` with both servers and placeholders, keep
  `enabledMcpjsonServers` as-is (it is harmless without the file), and make ticketing
  pluggable: default to local tickets in `.orchestrate/tickets/<id>.md` with the same
  fields, and opt into Linear via a harness setting (e.g. `.doc/stack.md` → `tickets:
  linear|local`). Keep `figma:<url>` as the design opt-in; document both flags in the
  backlog header.
- Effort: M

### [P1] CLONE-07 — No bootstrap step; every clone repeats the same ten manual edits
- Where: `README.md:36-47` ("How work moves through this repo" starts at "Add tasks", never
  at "set up this clone")
- Evidence: absence; the manual steps are CLONE-02, 03, 04, 05, 06, 09, 12 combined.
- Impact: 1–3 hours of undifferentiated setup per project, done slightly differently each
  time, which is the opposite of what a harness is for.
- Recommendation: two-layer bootstrap.
  1. `scripts/bootstrap.mjs` (Node, no deps) for the mechanical, deterministic part: ask
     for project name and stack preset, rewrite README title, clear the backlog, drop
     `hooha.md`, write `.gitignore`, copy `.mcp.json.example` if wanted, `git init`,
     create `chore/bootstrap` branch, then delete itself or mark `bootstrapped: true`.
  2. A `/bootstrap-project` skill for the judgment part: walk `.doc/` `FILL` markers with
     the user, run the frontend scaffold recipe (CLONE-02b), verify hooks with the
     payload tests, write the first backlog item.
  Tradeoffs: a script alone cannot fill product docs; a skill alone makes git/rename steps
  nondeterministic and slow. `bun create` / `degit` templates only solve the copy, not the
  setup, so they complement rather than replace this.
- Effort: M

### [P1] CLONE-08 — Every documented command assumes bash and npm; Eitan's shell is PowerShell 5.1 and his runtime is Bun
- Where: `frontend.md:73-76`, `qa.md:39-58`, `backend.md:54,69`,
  `writing-tests/SKILL.md:48-50` (14 occurrences of `cd <dir> && npm|npx …`)
- Evidence: `grep -rn "cd .* &&"` → 14 lines. PowerShell 5.1 has no `&&`
  (user CLAUDE.md states this). Claude's Bash tool is Git Bash, so agents are fine; the
  human typing the same command from the docs is not.
- Impact: every command block is wrong for the person who will debug the loop. `npm` also
  contradicts the stated preference for Bun and means two lockfile ecosystems if a clone
  switches.
- Recommendation: add a root `package.json` with workspaces (`frontend`, `backend`) and
  shell-agnostic scripts: `bun run test`, `bun run test:e2e`, `bun run typecheck`,
  `bun run lint`, `bun run check` (all four). Agent docs then say `bun run <script>` from
  the repo root, no `cd`, no `&&`. Keep `npm run` equivalents working via the same
  `scripts` block so the choice is a preset, not a rewrite.
- Effort: S

### [P1] CLONE-09 — Missing root scaffolding a template is expected to carry
- Where: repo root
- Evidence: `ls` → missing: `package.json`, `.editorconfig`, `.nvmrc`/`.node-version`/
  `engines`, `LICENSE`, `.github/workflows/`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `CHANGELOG.md`. `enforce-agent-boundaries.js:17` claims "the root package.json sets
  "type": "module"" and `backend.md:19` says "matching the repo root" — neither is true.
- Impact: hooks happen to run on Node 24 through module-syntax detection; on the Node 20
  that `backend.md:19` mandates, the ESM `import` throws and the hook fails open. No CI
  means the "quality gates" in `product-definition.md:22` are enforced only by agent
  honesty. No harness version means a clone cannot say which harness it came from.
- Recommendation: add `package.json` (`"type": "module"`, `"private": true`,
  `"version"` = harness version, `"engines": { "node": ">=22.7", "bun": ">=1.3" }`,
  workspaces, scripts from CLONE-08), `.editorconfig` (2-space, LF, final newline),
  `.github/workflows/ci.yml` running `bun run check`, a PR template whose checklist mirrors
  the frontend agent's step 5, `CHANGELOG.md` for the harness itself, and a LICENSE choice.
- Effort: S

### [P1] CLONE-10 — No lifecycle: existing clones can never receive harness improvements
- Where: `README.md` (no mention), repo root (no version)
- Evidence: absence. Docs confirm the plugin route exists: a plugin is "a directory of
  skills, agents, hooks, MCP servers" installed "as one unit" with "updates from its
  marketplace" ([Plugins overview](https://code.claude.com/docs/en/plugins)); standard
  layout `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `output-styles/`,
  manifest `.claude-plugin/plugin.json` with `version`; hook scripts referenced via
  `"${CLAUDE_PLUGIN_ROOT}"/scripts/…`; project-scope enablement through the committed
  `.claude/settings.json` ([manifest reference](https://code.claude.com/docs/en/plugins-reference)).
  Also: "A `CLAUDE.md` at the plugin root isn't loaded as context", so rules cannot ship in
  a plugin.
- Impact: every bug fixed in the harness (this audit's P0s included) has to be hand-ported
  into every project that was cloned before the fix.
- Recommendation: split the harness into two artifacts.
  - **Plugin** `fullstack-harness` (versioned): `agents/`, `skills/`, `hooks/hooks.json`
    + `scripts/`, `output-styles/`, optional `.mcp.json`. Installed per project via
    `enabledPlugins` in `.claude/settings.json`; `claude plugin validate` in CI.
  - **Template repo** (one-shot copy via GitHub template or `degit`): `AGENTS.md`,
    `CLAUDE.md`, `.claude/rules/`, `.claude/settings.json` (permissions + `enabledPlugins`),
    `.doc/`, `.plan/`, `.orchestrate/README.md`, root scaffolding, `scripts/bootstrap.mjs`.
  Tradeoffs: two things to version and release; hook commands change from
  `node .claude/hooks/x.js` to `"${CLAUDE_PLUGIN_ROOT}"/scripts/x.js`; rules and docs
  still need manual re-sync (they are project-owned anyway, so that is acceptable).
  Alternatives rejected: git subtree/submodule of `.claude/` (merge friction, mixes
  histories, submodules are a known onboarding trap); template-only (status quo, no
  updates).
- Effort: L

### [P1] CLONE-11 — Cursor and Copilot pointers never see the rules; Claude Code sees them twice
- Where: `.cursor/rules/index.mdc:7`, `.github/copilot-instructions.md:3` (both: "The
  canonical agent instructions live in AGENTS.md"), `AGENTS.md:36-39` (`@.claude/rules/…`)
- Evidence: neither Cursor nor Copilot expands Claude's `@path` import syntax; to them
  `AGENTS.md:36-39` are four literal lines. Claude Code, per the memory docs, auto-loads
  every `.claude/rules/*.md` each session *and* follows the `@` imports, so the same four
  files enter context twice (mechanics fork to confirm the exact behavior).
- Impact: a teammate on Cursor gets `AGENTS.md` without code-style, naming, UI, or git
  rules; the Claude session pays double context for them.
- Recommendation: choose one. If Claude Code only: delete `.cursor/` and
  `.github/copilot-instructions.md`, drop the `@` lines (rules auto-load). If multi-tool
  matters: inline the four short rules into `AGENTS.md` (≈80 lines) and delete
  `.claude/rules/`, so one file is literally complete for every tool. A generated,
  flattened `AGENTS.md` build step is the third option; it adds tooling for little gain at
  this size.
- Effort: S

### [P1] CLONE-12 — The stack is named in seven places, with contradictions, instead of one
- Where: `frontend.md:19-27` (Next.js 16, React 19, Tailwind v4, Vitest, Playwright),
  `backend.md:18-21` (Node 20, Express 5, Supertest), `writing-tests/SKILL.md:46-50`,
  `.claude/rules/ui-and-styling.md:9-13`, `AGENTS.md:31`, `qa.md:38-58`,
  `database-schema/SKILL.md:13` (Postgres-shaped `schema.sql`)
- Evidence: `backend.md:19` Node 20 vs installed Node 24 vs hooks needing ≥22.7
  (CLONE-09); `frontend.md:68` e2e under `frontend/tests/e2e/` vs `qa.md:20` and
  `enforce-agent-boundaries.js:24` allowing `frontend/e2e/`; npm everywhere vs Bun pref.
- Impact: swapping any one stack element means editing seven files and missing one; the
  existing contradictions show it has already happened.
- Recommendation: one `.doc/stack.md` (or `.claude/rules/stack.md`, path-scoped) declaring
  runtime, package manager, frontend, backend, test runners, test directories, and the
  bootstrap recipe. Agents and skills reference it ("see stack doc") instead of restating
  versions. Bootstrap presets (`next-bun`, `next-express-bun`) write this one file.
  Resolve the e2e path and Node floor while doing it.
- Effort: M

### [P2] CLONE-13 — Previous-project residue in rules, skills, and hook comments
- Where: `.claude/rules/naming.md:7-9` (`org`, `geo`, `lat`/`lng`),
  `git-workflow.md:19` (`add org validation rule`), `error-handling/SKILL.md:20,55`
  (`org`), `writing-tests/SKILL.md:19` ("Auth and org boundary"), `database-schema/SKILL.md:19-33`
  (`org` table), `AGENTS.md:57` ("auth/org boundaries"), `ui-and-styling.md:19-22`
  (cites `.plan/002-2026-08-03-pixel-perfect-the-visual-design.md`, which does not exist),
  `block-destructive-bash.js:3` ("Demo purpose"), `block-secret-file-access.js:9-15`
  (`LINEAR_API_KEY`, "this demo"), `orchestrator.md:76` ("this runs in a live demo")
- Evidence: quoted lines; `ls .plan` shows only `000-backlog.md`.
- Impact: a geo/org-free project inherits domain vocabulary it must now consciously
  ignore; the dangling plan reference and "demo" comments erode trust in the rest.
- Recommendation: move domain terms to `.doc/glossary.md` as an *example block* the
  bootstrap clears; keep `naming.md` to the generic rule (singular, canonical short form,
  glossary is the registry). Delete the plan-002 note and the demo comments.
- Effort: S

### [P2] CLONE-14 — Backlog format is under-specified for what the orchestrator needs
- Where: `.plan/000-backlog.md:3-7` (three format lines), `orchestrator.md:41` ("the task
  title and slug"), `qa.md:25` (`stack:full`)
- Evidence: the backlog never defines a slug, an id, or how `figma:` and `stack:full`
  combine; `- [x] Setup` is a leftover done item.
- Impact: the driver (CLONE-01) or its replacement has to invent slug derivation; humans
  cannot tell what a valid line is.
- Recommendation: document the grammar in the header (`- [ ] <title> | key:value …`),
  state slug derivation (kebab-case of title), list all keys (`figma`, `stack`, future
  `tickets`), and start the queue empty.
- Effort: S

### [P2] CLONE-15 — Unused and unreferenced components ship with every clone
- Where: `.claude/agents/security-reviewer.md` (no stage invokes it; see
  `orchestrator.md:19-25`), `.claude/output-styles/hooha.md`
- Evidence: `grep -rn "security-reviewer"` outside its own file → only `README.md:31`.
- Impact: context cost on every turn (agent descriptions load each session) for things
  the loop never uses; a joke output style in a professional template.
- Recommendation: either wire `security-reviewer` into the loop as a stage (process
  fork's call) or remove it until it is; delete `hooha.md`.
- Effort: S

## Top 5 changes (ranked)
1. **CLONE-01** — Decide and ship the driver model (build `dev-loop.js` or rewire onto native
   subagents). Nothing else in the harness is executable until this exists.
2. **CLONE-02** — Resolve the "existing app that does not exist" deadlock with a pinned
   scaffold recipe owned by the bootstrap step.
3. **CLONE-07 + CLONE-03 + CLONE-04** — One bootstrap step (`scripts/bootstrap.mjs` +
   `/bootstrap-project` skill) that writes `.gitignore`, inits git, strips demo residue,
   and renames the product. Converts three P0s into a 15-minute script.
4. **CLONE-12 + CLONE-08 + CLONE-09** — Single `stack.md`, root `package.json` with
   shell-agnostic `bun run` scripts, `engines` pin, CI. Makes "swappable default" real and
   fixes the Node/npm/PowerShell contradictions in one pass.
5. **CLONE-10** — Split into plugin (behavior, versioned) + template (project shape) so
   fixes propagate to existing clones.

## Keep
- `AGENTS.md` as single source imported by `CLAUDE.md` is exactly the documented
  "share one file with other coding tools" pattern; keep it.
- Hooks as hard boundaries, wired only through `.claude/settings.json`, with the explicit
  "hooks win" rule (`AGENTS.md:17`). This is the right enforcement layer.
- The durable-vs-generated split (`.doc/`, `.plan/`, `.claude/` vs `.orchestrate/`) and
  the "never create `docs/`" rule.
- Backlog flags (`figma:<url>`, `stack:full`) as the opt-in mechanism; extend, don't replace.
- `.env.example` is explicitly allowed by the secret hook (`block-secret-file-access.js:19-20`);
  the pattern is right, the file just needs to exist.
- Agent report formats with a terminal `STATUS: DONE` line are a sound handoff contract
  (whether string parsing is the right transport is the process fork's question).

## Open questions for Eitan
1. Is Cursor/Copilot support a real requirement, or is this harness Claude Code only? It
   decides CLONE-11 (delete pointers vs inline rules).
2. Plugin + template split (CLONE-10) means two artifacts to release. Acceptable, or do you
   prefer a single template repo and manual re-sync for now?
3. Ticketing default: local markdown tickets with Linear as opt-in, or keep Linear
   mandatory?
4. Frontend scaffold: committed in the template (fast, but dependencies to maintain) or
   generated once by a pinned bootstrap recipe (CLONE-02b)?
5. Node floor: keep the `backend.md` Node 20 claim or move to ≥22.7 so the ESM hooks are
   safe without a `package.json` `type` field?

## Clone checklist v0
Ordered as a new project would run it today, with what exists and what is missing.

1. [exists] Copy the repo (GitHub template / `degit`). No versioned source to copy from
   yet → [missing] harness `version` + `CHANGELOG.md`.
2. [missing] `scripts/bootstrap.mjs`: project name, stack preset, rename README, clear
   backlog, delete `hooha.md`, write `.gitignore`, `git init`, branch `chore/bootstrap`.
3. [missing] Root `package.json` (`type: module`, `engines`, workspaces, `bun run check`),
   `.editorconfig`, `.github/workflows/ci.yml`, PR template, LICENSE.
4. [missing] `.mcp.json.example` → copy to `.mcp.json` only if Figma/Linear are wanted;
   `.env.example` with `LINEAR_API_KEY=` placeholder.
5. [missing] Frontend scaffold via pinned recipe (`bootstrap-frontend` skill) producing the
   `vitest`/`playwright`/Tailwind v4 layout the agents already describe.
6. [missing] `.doc/stack.md` written by the preset; agents reference it.
7. [exists, empty] `.doc/product-definition.md`, `architecture.md`, `glossary.md` →
   [missing] `FILL` markers and a "ready to plan" checklist; `/bootstrap-project` skill
   walks them with the user.
8. [missing] Hook self-test: run the three hooks against the scratchpad payload set and
   expect the documented exit codes (the parent session already has the payload approach).
9. [exists] Add the first backlog line (`- [ ] <title> | stack:full`); [missing] the
   backlog grammar in the header.
10. [missing] Run the loop: driver or native-subagent flow (CLONE-01). Today this step has
    no executable.
11. [exists] Review `.orchestrate/` outputs and `.doc/product-definition.md` ACs.

Time-to-first-feature estimate: **today ≈ 1.5–2.5 working days** (discover the missing
driver 0.5h; build or rewire it 4–8h; hand-build the frontend to match six prose
descriptions 2–3h; git/ignore/residue cleanup 1.5h; MCP setup 1–2h; fill docs 1–2h; first
feature through the agents 2–4h). **After the Top 5 ≈ 2–3 hours** (bootstrap 15 min, fill
`.doc/` 1h, first backlog item through the loop 1–2h).

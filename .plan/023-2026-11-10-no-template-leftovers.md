# No template leftovers: a brief-driven shell, no example screen

Status: active
Owner: Eitan
Last updated: 2026-11-10
Input: ADR 0010 at the catalog's `docs/adr/0010-no-chrome-no-example-screen.md` on `feat/no-chrome`
(accepted by Eitan on 2026-11-10: "accept the ADR"): D1 the skeleton, D2 the components the product places, D3 no example
screen, D4 sign out, D5 tests, D6 documents, D7 release, D8 the harness, spike S0.
Program: first of three plans Eitan approved on 2026-11-10 after the comparison run
(`C:/Dev/Playground/AI/compare-harness/report.html`, harness A): 023 no template leftovers,
024 scaffold by need (ADR 0011), 025 Next on the SPA tree with co-located SCSS (ADR 0012).
Scope ruling: only this repository and the catalog (`C:/Dev/Playground/AI/fullstack-templates`),
on feature branches, with no commit, push, merge or tag without Eitan's word. The proof P1 runs
in a disposable clone of the harness.
Branches:
- catalog `feat/no-chrome`, cut from `dev` at ecf7466 on 2026-11-10; PR into `dev`;
- harness `feat/no-template-leftovers`, cut from `dev` at d3e453f on 2026-11-10, after the
  bootstrap skill trim merged there (#53). It carries this plan and H1; the lock bump follows
  the release as its own pull request (H3).
Base: catalog ecf7466 · harness d3e453f
Stages: catalog work and harness docs. No role agent runs. The session drives Sonnet
implementers (`model: sonnet`), one Sonnet review per task, one Opus final review per branch.
Ledger: `.superpowers/sdd/023-2026-11-10-no-template-leftovers/` (git-ignored): the spike record,
the 2.x screenshot baselines, review notes, proof timings, the release-notes draft.

## Goal

A generated frontend shows nothing the product's brief did not ask for. After this plan:

- the catalog ships `frontend/next` 3.0.0, `frontend/react` 5.0.0, `frontend/vue` 3.0.0 and
  `frontend/angular` 3.0.0 as `v1.10.0`: a skip link and one `main`, an index route of one `h1`,
  no header, navigation, footer or health screen;
- the first frontend task of a project decides the chrome from the Design section's Reference
  apps, writes it as the plan's `shell` line, and QA judges the screens against that line;
- a board, canvas or editor has a page pattern (`workspace`) and needs no layout workaround;
- the Trello brief, re-run in a disposable clone, yields no Status page, no footer and a
  Trello-like top bar.

## Scope

**In** (catalog): ADR 0010 D1 to D7 in the four frontend templates (`base/`, `template.yaml`,
`README.md`, `CHANGELOG.md`), `docs/conventions.md`, `CONTRIBUTING.md`, `index.yaml`, the README
matrix, one amendment line each in ADR 0004, 0006 and 0009. Release `v1.10.0`; the tag is Eitan's.

**In** (harness): this plan; H1 (ADR D8); the proof P1; the lock bump H3 after the release.

**Out:**

- A frontend without a server, the add-a-part script, the unused `backend/` (plan 024).
- Next's tree and styling (plan 025). The server templates. A migration tool: a project
  generated before v1.10.0 keeps its shell as product code and changes it by plan.
- Proposed backlog line, from the same run (its plan had no `UX` section and QA recorded
  "UX: not judged"): `- [ ] verify: fail a plan with a frontend stage and no UX section`.

## Assumptions

- ADR 0010 is the design once accepted. An implementer who finds a decision impossible reports
  it; the session records the change here and in the ADR before anyone works around it. A failed
  spike returns to Eitan.
- No tool change, no new dependency, no new case: every existing case passes with `--e2e`. A
  tool change found necessary is recorded in "Changes during the task" first and ships with a
  tools test.
- Build order: Next first (it sets the shape of `shell.spec`, `smoke.spec` and the agents file's
  "The shell" paragraph), then React, Vue and Angular in parallel on their disjoint paths.
  Deletions are their own step so the diff reads cleanly; rewrites follow.
- Word budgets (`scripts/docs.test.mjs`): `AGENTS.md` is at 1199 of 1200 and is not touched; the
  frontend, QA and orchestrator startups have headroom. Every H1 edit replaces text; none only
  appends. The `ui-design` description line stays as it is (a description change is measured in
  real sessions first).
- A run starts from the on-disk path spelling (`C:\Dev`, never `C:\dev`).
- Sonnet implementers and per-task reviews, one Opus final review; Conventional Commits; every
  pull request targets `dev`; `main` moves only by a `dev` → `main` merge.

## Open Questions

1. ADR D1: `main` loses its width and padding, and the page pattern owns the container, so a
   `workspace` screen is full-bleed with no layout prop. Recommended: yes.
   > Accepted with ADR 0010 (Eitan, 2026-11-10: "accept the ADR").
2. ADR D2: React's `app-account-slot` and Vue's `slots.ts` are deleted; a plan that adds auth
   later names the menu swap. Recommended: yes; the alternative keeps a generator-resolved
   switch whose only caller is product code.
   > Accepted with ADR 0010 (Eitan, 2026-11-10: "accept the ADR").
3. ADR D3: three of ADR 0009 C3's examples leave with the chrome (Vue's `<Transition>`,
   Angular's `model()`, the callers of two React hooks). Recommended: accept; an example needs a
   screen.
   > Accepted with ADR 0010 (Eitan, 2026-11-10: "accept the ADR").
4. Commits, pushes and pull requests into `dev`: ask each time, or delegate as in plan 022
   (`dev` → `main` and the tag stay yours)? Recommended: delegate.
   > Delegated (Eitan, 2026-11-10: "delegate commits, pushes and PRs into dev; dev → main and
   > the tag stay mine").

## Steps

### Gates

- **G0 (session), done 2026-11-10:** the trim merged into `dev` (#53, d3e453f) on Eitan's word;
  both branches cut; ADR 0010 written and accepted; this plan written. Both files are
  uncommitted until G3.
- **G1 (Eitan), done 2026-11-10:** `Status: active` on this plan, in a new session; question 4
  answered (delegated).
- **G2 (session):** spike S0 recorded; a failure stops here.
- **G3:** the catalog commits and the PR into `dev` after the Opus review and the local proofs;
  the harness commits and the H1 PR into `dev`.
- **G4 (Eitan):** the catalog `dev` → `main` merge and the tag `v1.10.0`.
- **G5:** the lock bump PR into `dev`, then the `dev` → `main` pull request.

### Spike (throwaway, in the session's scratch folder)

| Spike | Passes when | On failure |
| --- | --- | --- |
| S0 extraction and the container | In generated `vue/default` and `angular/default` projects, the theme toggle (and Angular's language toggle, install button and account menu) leaves the header as its own component: `vue-tsc -b` and `ng build` green, each renders and behaves as in the 2.0.0 header. In all four templates the container moves from `main` to the page pattern: the 404, profile and forbidden screens match their 2.x screenshots at `phone` and `desktop`. | Stop (G2). |

### Tasks

- **C0** S0, plus the 2.x screenshot baselines (404, profile, forbidden; both themes; `phone`
  and `desktop`) from one generated project per template.
- **C1 Next 3.0.0** (ADR D1 to D5): delete the health slices and their unit tests, then
  `shared/ui/pattern/{app-shell,mobile-nav,nav-links}.tsx` and `app-shell.test.tsx`; add
  `pattern/skip-link.tsx`; `(site)/layout.tsx` to skip link and `main`; `(site)/page.tsx` to the
  index route; the container into `Page`; Sign out on the profile page; `shell.spec`,
  `smoke.spec`, `auth-support.ts`, `auth.spec` and `use-cache.test.ts` per D5; `template.yaml`
  (`onlyWhen` paths still present), `AGENTS.md`, `README.md`, `CHANGELOG.md`, `index.yaml`.
- **C2 React 5.0.0**, **C3 Vue 3.0.0**, **C4 Angular 3.0.0**: the same decisions in each
  template's spelling (ADR tables D1 to D3), copying C1's reviewed spec shapes. Vue and Angular
  also drop the cache entries and keys D3 names and extract the D2 components.
- **C5 docs** (ADR D6): `docs/conventions.md`, `CONTRIBUTING.md`, the amendment lines, the README
  matrix from `bun tools/validate.ts --readme`; a grep over `docs/` and `frontend/*/README.md`
  for `health`, `app-shell`, `footer`, "worked example".
- **C6 final:** the Opus review of the catalog branch (every dropped assertion has its successor;
  no test skipped or focused; no file renders a D2 component), one fix wave, the local proofs,
  G3, the PR into `dev`, CI green, the release notes to the ledger.
- **H1 harness wording** (table below); `node --test "scripts/**/*.test.mjs"` after each edit;
  a straggler grep over `README.md`, `AGENTS.md`, `.doc/` and `.claude/` for `health screen`,
  `AppShell`, `refresh-health`, `<footer>` and "worked example"; a Sonnet review; the PR (G3).
- **H2** this plan's "As built".
- **H3 lock bump** after G4: `catalog.lock` to v1.10.0, the bootstrap smoke, its own PR.
- **P1 proof** after H3, in `../fullstack-dev-harness-proof-023` (Eitan opens Claude Code there
  once for the trust dialog): `/bootstrap-project` with the comparison run's Trello brief, then
  one loop task. Findings become backlog lines here, never fixes in the clone.

Waves: C0 → C1 → (C2 ∥ C3 ∥ C4) → C5 → C6. H1 runs from G1 in parallel; H3 and P1 follow G4.

### H1: the wording

| File | Today | Becomes |
| --- | --- | --- |
| `.claude/rules/ui-and-styling.md:30-33` | "The shell is the package's shell component … never a second landmark set." | "The template's shell is a skip link and the one `<main id="main">`. Header, navigation, footer and the places of the theme toggle and account menu are product code, built only as the plan's `shell` line says (`ui-design › Shell`). A page renders inside `main` and adds a nav entry, never a landmark set." |
| `ui-design/SKILL.md` Inputs | "Tone, Reference apps, Primary viewport, Density." | "Tone, Reference apps (they decide the shell), Primary viewport, Density." |
| `ui-design/SKILL.md` new `## Shell` (4 lines) | none | "The first task with a frontend stage writes the plan's `shell` line; later tasks keep to it. Take the regions a Reference app shows for the same job (top bar, side nav, footer, each with its contents, and where the theme toggle and account menu sit); with "none", the least the scope needs. Build nothing the line does not name; a new screen adds a nav entry, not a region." |
| `ui-design/SKILL.md` patterns | seven patterns, none full-bleed | adds "**workspace** (a board, canvas or editor): a toolbar row with the `h1` (the open thing's name) and the primary action; the surface fills the rest at full width and scrolls inside itself, never the page. Loading: a skeleton of its columns or panes. Empty: `EmptyState` inside the surface with the first create action." Page decisions name it beside `auth` (own `h1`) and `dashboard` (full width). |
| `ui-design/SKILL.md` rubric 7 | "A phone header that neither wraps nor cramps. …" | "The shell matches the plan's `shell` line: its regions and no others, laid out as the Reference app does for the same job; a phone header that neither wraps nor cramps. Machine-checked: no horizontal overflow. Judged: the rest." Still ten checks. |
| `ui-design/SKILL.md:33-36` | four lines introducing the pattern components | merged into three, to offset |
| `writing-plans/SKILL.md › UX`, `template.md` | one line per route; seven patterns | adds `workspace`, and: "The first task with a frontend stage starts `UX` with `- shell — <regions, each with its contents> — theme toggle: <place> — account: <place \| none> — from: <Reference app \| brief>`." Offset: the draft-path paragraph loses the two sentences `orchestrator.md` step 6 already states. |
| `agents/orchestrator.md` step 5 | "choose a pattern and a tone per the `ui-design` skill" | "choose a pattern and a tone, and write the `shell` line when it is due, per the `ui-design` skill" |
| `agents/frontend.md:37` | "the plan's `UX` section as the brief for each route" | adds "; its `shell` line is all the chrome you build" |
| `agents/qa.md:43-44` | "against the plan's `UX` line and … Design" | "against the plan's `UX` lines, the `shell` line included, and … Design" |
| `bootstrap-project/SKILL.md:227-230` | the dev check opens the health screen | "Start each package's `dev` command (an SPA's server first, as the frontend's `AGENTS.md` says) and open the frontend's `http.port`: the home page renders. With a server, `/api/health` answers on that port for an SPA (its dev proxy) and on the server's port for Next." |
| `bootstrap-project/SKILL.md:178` | "… stay in the form and have no flag." | "… have no flag; the first frontend task's `shell` line reads them." |
| `.doc/product-definition.md:53-54` | "products whose look is the target"; "shown in the header and the page title" | "products whose layout and look are the target (the shell follows them)"; "shown in the page title and where the design puts it" |
| `.doc/glossary.md:21-23` | "… in the same table (for example `refresh` … in Next)." | "… in the same table." |
| `.claude/README.md` | How work moves 2; Frontend choice | 2 names the `shell` line; Frontend choice adds "v1.10.0 removed the template header, navigation, footer and example screen" |

### Local proofs (the session; Windows; from `C:\Dev`)

- `cd tools && bun run check`; `bun tools/validate.ts --readme`; `bun tools/validate.ts`;
  `bun tools/validate.ts --lockfiles`.
- Every case of the four frontends with `--e2e`; the `withApp` cases with `--with-app`, and the
  postgres cases with `--with-services`, alone on the machine. Without Docker, those legs are
  the PR's CI run.
- In a kept `default` project per template: both packages' `check`; no marker or placeholder
  left; a grep for `health` outside the server proxy request, `banner`, `contentinfo` and
  `<footer` finds nothing in `src/` and `tests/`.

## Validation

- V01 — The catalog validates and every case of the four frontends is green locally and in CI;
  the servers' and the tools' diffs are empty. Proof: the local proofs; the PR's checks;
  `git diff --stat ecf7466 -- server tools`.
- V02 — No chrome: a generated `default` project of each template renders no `<header>`,
  `<nav>` or `<footer>` and no brand text outside the index route's `h1` and the page title.
  Proof: the layout unit tests; `shell.spec`; the grep in "As built".
- V03 — No example screen: no health file, key or cache entry remains in a frontend; the index
  route is one `h1` and one line; `/api/health` still answers. Proof: the grep; `smoke.spec`;
  the `withApp` cases.
- V04 — The D2 components exist with their unit tests and no template file renders them;
  Angular's and Vue's extracted ones behave as in the 2.0.0 header. Proof: S0's record; the
  Opus review.
- V05 — With auth, a user signs out from the profile page in all four templates. Proof:
  `auth.spec`; the profile unit tests.
- V06 — The styling contract holds: 44 px on a coarse pointer, 36 px and 32 px compact on a
  fine one, axe in both themes, no horizontal overflow; the 404, profile and forbidden screens
  match the C0 baselines. Proof: `shell.spec`, `screens.spec`, `density`; the screenshot pairs.
- V07 — No test was deleted, skipped or focused without a successor named in the changelog.
  Proof: `git diff --stat ecf7466 -- 'frontend/*/base/tests' 'frontend/*/base/src/**/*.test.*'
  'frontend/*/base/src/**/*.spec.*'`; the Opus review.
- V08 — The documents agree: ADR 0010, the four agents files (five headings, the recipe's code
  blocks, "The shell"), the READMEs, the changelogs, `docs/conventions.md`, `CONTRIBUTING.md`
  and `index.yaml`. Proof: the Opus review; `bun tools/validate.ts`.
- V09 — The harness wording is as the H1 table says, no harness text names the health screen or
  a mandatory header or footer, and the suites are green with the budgets unchanged. Proof: the
  straggler grep; `node --test "scripts/**/*.test.mjs"`; `node --test ".claude/hooks/test/*.test.mjs"`.
- V10 — P1: the Trello brief at the bumped lock yields no Status page, no footer and no
  `Boards / Status` navigation; the first plan's `UX` opens with a `shell` line that names a
  Trello-like top bar, and its board route is a `workspace`; the screens show that chrome and
  no other; QA's `UX:` reports check 7. The unused `backend/` is still expected (plan 024).
  Proof: the ledger.

## Risks

- **An app with no chrome at all**: the agent skips the shell because no template file shows
  one. Mitigation: the rule, `ui-design › Shell`, the plan template's first `UX` line and rubric
  check 7 all name it; P1 reads the first plan.
- **The agent rebuilds the old header from habit.** Mitigation: the `shell` line names regions
  and contents from the Reference app; QA judges against it.
- **The container move shifts a screen.** Mitigation: C0's baselines; V06 compares the pairs.
- **A gated file falls out of `onlyWhen`** when Angular's header blocks become components.
  Mitigation: the `auth-off`, `i18n-off`, `pwa-off` and `flags-off` cases; a ledger grep pairing
  every marker's owner with its manifest line.
- **Angular loses its only sizing proof with the header.** Mitigation: `shell.spec` sizes the
  404's control on both projects and both densities.
- **Harness word budgets.** Mitigation: every edit replaces text; the docs test after each.
- **Docker down on the build machine.** The `--with-app` legs run in CI; recorded if so.

## Changes during the task

- 2026-11-10 — G1: Eitan set the plan active and delegated commits, pushes and pull requests
  into `dev` (question 4).
- 2026-11-10 — Driver's rulings R1 to R5 (pre-flight, ledger). R1: briefs and review packages are
  hand-written ledger files (the tasks here are table rows). R2: catalog implementers commit
  their own work on the feature branch as plan 022 did, the session commits the ADR, this plan
  and H1; nothing is pushed before G3. R3: C0 ran as four parallel agents behind a machine-wide
  mutex for every run that starts a server (all stacks share port 4000). R4: React's spike and
  baseline project is the stack `react-bun-express`, not `default` (`react-python-fastapi`).
  R5: V06's "match the C0 baselines" is a pixel match in the spike (chrome kept) and, for the
  build, a comparison of the captures' metrics (the `h1` and controls keep x, width and height;
  y moves by one constant per viewport), because a full-page image cannot match once the header
  and footer are gone.
- 2026-11-10 — G2 passed: S0 green on all four templates (container pairs identical 12 of 12
  each; Vue's and Angular's extraction pairs identical 12 of 12; `check`, build and e2e green).
- 2026-11-10 — Driver's rulings R6 to R8 (ledger; in ADR 0010's "Decisions made while building").
  R6: Vue and Angular had no page pattern; each gains one that owns the container
  (`shared/components/page-container.vue`, `shared/components/page/` as `app-page`). R7:
  Angular's install control ships as `app-install-button/` and `app-install-hint/`, not one
  component with a mode input. R8: a `shell.spec` check that compact density tightens the page's
  spacing stays and reads the page pattern's container.
- 2026-11-10 — H1 built, reviewed and committed (d1fbdd7); C1 (`frontend/next` 3.0.0) built and
  reviewed with one fix round (ed6391c..ec098da). Driver's rulings R9 to R11 (ledger). R9: the
  C2 ∥ C3 ∥ C4 wave runs in three catalog worktrees (`.superpowers/wt/<T>`, branches
  `feat/no-chrome-<T>`) merged back by the session, as plan 022's R2 did. R10: the dropped theme
  e2e gets no new e2e; each changelog says which unit test proves the write, that `screens.spec`
  proves the read, and that the reload round trip is no longer asserted end to end (ADR D5 names
  those successors). R11: C5 is split; its ADR-only part ran beside the wave, the matrix and the
  stale-name search follow the merge.
- 2026-11-11 — Driver's rulings R12 to R14 (ledger; for ADR 0010's "Decisions made while
  building"), from C4's report. R12 (amends R5): on Angular's desktop project the content also
  moves in x by one constant per capture (−128 px on the 404 and forbidden, −192 px on profile),
  because 2.x had a 16 rem side-nav column there and D1 deletes it; widths, heights and the y
  shift are unchanged. R13: D5's `@desktop` heights "36 px, 32 px compact" are Next's, React's
  and Vue's; Angular's 2.0.0 spec asserted 40 px in both densities, and each template asserts
  what its own 2.x spec did. R14: Vue's and Angular's auth layouts rendered the app footer; it
  leaves with the footer component, the auth layout is otherwise unchanged and keeps its brand
  link, so V02's "no brand text" is read for the main layout.
- 2026-11-11 — The wave is built: C2 (`frontend/react` 5.0.0), C3 (`frontend/vue` 3.0.0) and C4
  (`frontend/angular` 3.0.0), each reviewed with one fix round and merged into `feat/no-chrome`
  by the session; C5 (the catalog's documents, the README matrix, ADR 0010's decisions) reviewed
  in two parts. Driver's rulings R15 to R17 (ledger; R15 and R16 are in the ADR). R15: a 2.x
  `shell.spec` test that is neither in D5's row nor in its "Gone" list stays in `shell.spec`
  (the theme-script and CSP check; Vue's console and CSP-without-eval checks, which a new
  `bundle.spec.ts` had moved off the desktop project). R16: Vue's language e2e keeps an e2e
  successor (a stored Hebrew choice: direction, overflow, axe). R17: React's two tests of moved
  behaviour (compact padding, the 404's control list) were shown red by mutation.
- 2026-11-11 — The Opus review of this branch: "ready to merge with fixes". The fifteen H1 rows
  were applied as written; its five Important findings are against the wording the table
  mandates. Driver's rulings R18 to R23 (ledger) change that wording and **await Eitan's
  ratification before `dev` → `main`**; the H1 table above stays as approved on 2026-11-10, and
  the nine files are the record of what shipped. R18: every plan whose `UX` names a route
  carries the `shell` line, copied forward and changed only when the task changes the chrome
  (the table's "first task with a frontend stage" picks the data-layer task in a project that
  starts without a database, leaves rubric check 7 nothing to judge in a later task, forbids a
  later task from placing the account menu, and never gives a pre-v1.10.0 project a line).
  R19: a `workspace` screen is full-bleed with no `Page`. R20: the first route-bearing plan
  gives `/` its screen, and the catalog's `smoke.spec` files stop asserting the placeholder's
  words. R21: the line's "theme toggle" and "account" fields become "controls", one place per
  ready-to-place control. Also taken: QA judges the route's line and the plan's `shell` line;
  "a top-level screen adds a nav-table entry"; rubric 7's "as its `from:` source does". Net
  word change of the fix: zero. R22: the reviewer's set-aside list stands. R23: two line wraps
  by the session, whitespace only. Left as approved: "with 'none', the least the scope needs"
  (the reviewer wants a default top bar); no `phone:` field on the `shell` line.
- 2026-11-11 — The Opus review of the catalog branch: "ready to merge with fixes", nothing
  critical. Driver's rulings R24 to R28 (ledger; for the ADR). R24: the full-height frame (a
  layout root at least the viewport high, `main` taking the rest) is part of D1; Vue and Angular
  had lost it; all four gain a `shell.spec` test for it. R25: Next's `ThemeToggle` and React's
  `AppThemeMenu` are menu items and cannot be placed alone; the documents now say the control to
  place is the user menu, and no standalone theme trigger is added (Vue and Angular have one).
  R26: Angular's service-worker guard tests return. R27: with auth off a generated Next app
  makes no API call, so no e2e reaches the API until the product's first read (ADR D5 gives
  only the SPAs a health request); stated in the changelog and the ADR, not patched with a probe
  endpoint. R28: the reviewer's "leave" list stands (the `header` z-index layer, the `menu` and
  `wifi-off` icons, the per-template index layouts, changelog dates set at the tag).
- 2026-11-11 — Proposed backlog lines, none taken into this plan:
  `- [ ] verify: fail a plan with a frontend stage and no UX section, or a UX route and no shell line`;
  `- [ ] tests: make the temp-repository fixtures immune to the system git config`;
  `- [ ] catalog: an e2e that counts /api/auth/refresh on a reload without the access cookie (Vue, Angular)`;
  `- [ ] catalog: a Workbox runtimeCaching guard for Vue like Angular's ngsw invariants`;
  `- [ ] catalog: a standalone theme control for Next and React`. The harness reviewer also
  recommends that P1 run one later route-bearing task, to prove rubric check 7 against a copied
  `shell` line; the plan's P1 is one loop task.
- 2026-11-10 — Environment: the machine's system git config sets `core.fsmonitor=true`; under
  load two git calls of the harness suite hung at zero CPU. The suites ran green with the
  monitor off for the test process (scripts 275 of 275, hooks 1702 of 1702). Proposed backlog
  line: `- [ ] tests: make the temp-repository fixtures immune to the system git config`.

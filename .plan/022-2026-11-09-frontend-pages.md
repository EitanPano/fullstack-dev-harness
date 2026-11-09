# Pages, app-wide components and co-located styles in the SPA templates

Status: active
Owner: Eitan
Last updated: 2026-11-09
Approval: G1 granted 2026-11-09 by Eitan ("active the plan"). Eitan asked on 2026-11-09 for the
four changes (rename `features/` to `pages/`; prefix the layout components with `app`, move them
into a `components/` folder and delete `layout/`; each page's and component's `.scss` beside its
`.ts`, global styles staying in `styles/`; each frontend using its primary features, React having
no hooks), approved the session's recap ("yes do that") and ADR 0009 after its builder check
("approved"). This plan is sized from the ADR.
Approval: delegated (2026-11-09, "start. the only thing i want is a PR from dev to main which i
will merge manually on both repos."): read by the session as: commits, pushes, PRs into `dev` and
their merges; the dev → main merges and the tag are Eitan's.
Input: ADR 0009 at the catalog's `docs/adr/0009-pages-components-colocated-styles.md` on
`feat/frontend-pages` (accepted 2026-11-09; the ledger keeps a copy): C1 the tree, C1.1 the import
table, C1.2 names, C2 styles with C2.1 Angular encapsulation and C2.2 the scans, C3 primary
features, C4 tests, C5 manifests and release, C6 the harness, spikes S1–S3 with the stop rule. Its
reconciliations are decided; implementers do not reopen them.
Scope ruling: only this repository and the catalog (`C:/Dev/Playground/AI/fullstack-templates`).
Nothing else is read, written or run; the proof P1 runs in a disposable clone of the harness.
Branches:
- catalog `feat/frontend-pages`, cut from `main` at a62bf90 on 2026-11-09 (`main` equals
  `origin/dev`); PR into `dev`;
- harness `feat/frontend-pages`, cut from `main` 5282620 (which equals `origin/dev`). It carries
  this plan and the C6 wording changes; the `catalog.lock` bump to v1.9.0 follows the release as
  its own pull request through `dev` (H3), as every lock bump before it.
Base: catalog a62bf90 · harness 5282620
Stages: catalog work and harness docs. No role agent runs. The interactive session drives Sonnet
implementers (`model: sonnet`), one Sonnet review per task, one Opus final review per branch.
Ledger: `.superpowers/sdd/022-2026-11-09-frontend-pages/` (git-ignored): a copy of the ADR, spike
results, the 1.x screenshot baseline of the Angular shell, review notes, proof timings, the
release-notes draft.

## Goal

A project generated on React, Vue or Angular has one tree shape in its framework's spelling:
`pages/<module>/` for the routed screens, `components/` for the app-wide `app-*` components the
shells compose, `shared/` for the product-agnostic parts, and every page's or component's styles
in a sibling `.scss` while `styles/` keeps the tokens, base and layout. Each template uses its
framework's primary features where the template already did that work by hand. After this plan:

- the catalog ships `frontend/react` 4.0.0, `frontend/vue` 2.0.0 and `frontend/angular` 2.0.0,
  released as catalog v1.9.0; `frontend/next` is byte-identical;
- each agents file describes the new tree under its five headings, and the dev loop's recipe for a
  new module ends with "a sibling `.scss` with the page's stem" instead of a view partial;
- this repository's three lines that named the old tree say the new one (C6);
- one bootstrap and one loop task on `react-bun-express` are proven in a disposable clone, the
  frontend agent landing its page in `pages/<noun>/` with a sibling stylesheet unaided.

## Scope

**In** (catalog):

- `frontend/react/base`, `frontend/vue/base`, `frontend/angular/base`: the moves (ADR C1), the
  styles flip and its scans (C2), the features (C3), the tests (C4), each `AGENTS.md`, `README.md`,
  `eslint.config.mjs`, `tests/unit/*`; each template's `template.yaml` (`onlyWhen`), `README.md`
  and `CHANGELOG.md` with its `### Breaking` move table (C5).
- `index.yaml` (versions and the three summaries), the README matrix, `CONTRIBUTING.md` (the five
  "global SCSS tree" and `_index.scss` phrases, the release paragraph), `docs/adr/0009-…`
  ("Decisions made while building"), one "amended by ADR 0009" line each in ADR 0006 (A2, A2.4),
  ADR 0007 (R1,
  styling, the `src/hooks/` ruling) and ADR 0008 (T1, T5, the `App` prefix).
- No tool change expected: `onlyWhen` is manifest data validated against `base/`, markers are in
  the files that move with them, the e2e suites import `app/nav.ts` and `core/config/constants`,
  which stay. A tool change found necessary is recorded in "Changes during the task" first and
  ships with a tools test.
- The release: catalog `v1.9.0`, a minor (three template majors), with notes drafted in the
  ledger; the tag is Eitan's.

**In** (harness): this plan; the C6 wording changes (H1); the proof P1; the lock bump (H3) after
the release, as its own pull request through `dev`.

**Out:**

- `frontend/next` (ADR 0009 Context: no `features/`, `layout/` or SCSS; metadata on every page).
  Migration tooling for projects generated before v1.9.0 (the changelog's move table is the
  migration). Signal Forms, `httpResource`, Pinia Colada, Vue 3.6, a component catalog, the
  harness's "feature" vocabulary. Proposed backlog lines:
  `- [ ] next: co-located SCSS (its own ADR; was "the global SCSS tree")`,
  `- [ ] frontend: a move script for 3.x/1.x projects from each changelog's table`.

## Assumptions

- ADR 0009 is the design (accepted 2026-11-09). C1's tree, C1.1's table, C1.2's names, C2's
  reference forms, C2.1's fix rules and C3's feature list are final; an implementer who finds one
  impossible reports it, and the session records the change here and in the ADR before anyone
  works around it. A spike that fails is a stop that returns to Eitan (ADR Spikes), never a
  fallback taken alone.
- No new dependency. The pinned frameworks carry every API used: React 19.3.0, Vue 3.5.44,
  Angular 22.2.4 (`model` stable since 19.0, `linkedSignal` since 20.0, `@defer`, zoneless the
  default since 21), `eslint-plugin-vue` 10.12.0. A dependency found necessary is checked for peers
  and age (≥ 14 days) first and recorded in the changelog.
- Catalog facts at a62bf90: `validate` checks that every `onlyWhen` path exists in `base/` and
  the five frontend headings; markers work in `.ts`, `.tsx`, `.scss`, `.html` and `.vue`; a
  whole-line `// @word` SCSS comment is read as a marker (never write one); Vite's `loadPaths` and
  Angular's `includePaths` already point at `src/styles`; CI runs every case from `--list` on pull
  requests and on pushes to `main` and `dev`.
- Build order: React first (it sets the scan's shape, the agents-file wording and the hooks), then
  Vue and Angular in parallel on their disjoint paths, each copying React's patterns in its
  spelling. Every move is a `git mv` in its own step so the diff shows renames; content edits
  follow.
- A run starts from the on-disk path spelling (`C:\Dev`, never `C:\dev`), the Bun path-case trap.
- Eitan's rules: Sonnet implementers and per-task reviews, one Opus final review; Conventional
  Commits; two repositories only; every pull request targets `dev` and `main` moves only by a
  `dev` → `main` merge; no commit, push, PR, merge or tag without a yes at the time (superseded
  for `dev` by the delegation in Approval).

## Open Questions

None open. Two choices were settled in the ADR after the builder check (the "theirs" pile was
empty): a failed spike stops the plan rather than forking it, and the `app-` prefix scan exempts
non-component files (Vue's `slots.ts`, specs, `.scss` siblings). Three corrections to the recap
are in the ADR and were approved with it: Next untouched (its pages already carry metadata),
three React hooks instead of five, no `useTransition`.

## Steps

### Gates

- **G0 (session), done 2026-11-09:** both branches cut (`feat/frontend-pages` on a62bf90 and on
  5282620); ADR 0009 written, builder-checked and accepted, placed at the catalog's
  `docs/adr/0009-pages-components-colocated-styles.md` (uncommitted until G3); this plan written.
- **G1 (Eitan), done 2026-11-09:** `Status: active` on this plan.
- **G2 (session), done (S1 failed; R6 below):** spikes S1–S3 recorded in the ledger with the
  versions tried; a failed spike stops here and returns to Eitan with its evidence (ADR Spikes).
- **G3 (taken by the session under the delegation):** yes to the catalog commits and the PR
  into `dev`, after the Opus review and the local proofs; yes to the harness commits and the H1
  PR into `dev`.
- **G4 (Eitan):** yes to the release: catalog `dev` → `main`, the tag `v1.9.0` and its notes.
- **G5 (Eitan):** yes to the lock bump PR (H3, into `dev`, then the `dev` → `main` pull request)
  and the proof run P1.

### Spikes (throwaway, in the session's scratch folder, never in a repository)

| Spike | Passes when | On failure |
| --- | --- | --- |
| S1 Vite CSS order and chunking | In a copy of `frontend/react/base`, one view partial and one shared partial moved beside their owners and imported: `vite build` puts setup, themes and basics in the entry CSS and the page's CSS in the lazy route's chunk; the rendered order has `styles.scss` first; Vitest under jsdom runs a spec that imports the component. The same in a copy of `frontend/vue/base` with `<style lang="scss" src>`. | Stop (G2). |
| S2 Angular encapsulation | `_header.scss` and `_button.scss` moved beside their components under `styleUrl` with the C2.1 fixes (`:host`, the parent styling the child's host, an input where the host box is not enough): `ng build` green, the header renders as the 1.0.0 baseline in both themes at `phone` and `desktop`; the record says which of the seven selectors needed which rule. | Stop (G2); `ViewEncapsulation.None` is not a fallback. |
| S3 Vue tooling on `<style src>` | `vue-tsc -b`, `eslint-plugin-vue` 10.12 (`block-lang` with `style: { lang: 'scss' }`, or the scan alone if the rule ignores an empty `src` block), `@vitejs/plugin-vue` and Vitest accept a sibling `.scss` through an empty `<style lang="scss" src="./x.scss"></style>`; Prettier keeps the block; the record says what each accepted. | Stop (G2); `scoped` and an inline block body are not fallbacks. |

### Tasks

Catalog tasks are C, harness tasks H, the proof P. One Sonnet implementer per task with the ADR
section it builds, a Sonnet review per task, fixes by the same implementer.

- **C0 spikes** (S1–S3): one implementer; results and versions to the ledger; the Angular shell's
  1.0.0 screenshot baseline (both themes, `phone` and `desktop`) captured from a generated
  `angular/default` project before any move.
- **C1 React 4.0.0** (ADR C1, C1.1, C1.2, C2, C2.2, C3 React, C4, C5 React):
  `git mv` of `layout/**` to `components/app-*.tsx` (the shells, their loading and error files,
  header, nav-links, mobile-nav, footer, theme-menu, user-menu, account-slot, account-menu) and of
  `features/<m>/**` to `pages/<m>/` flat (pages beside `*.routes.tsx`, `*.form.ts`, `*.copy.ts`;
  `components/` kept), every import and export renamed (`AppHeader`, …);
  `styles/components/_<name>.scss` and `styles/views/_<view>.scss` moved beside their owners
  with the owner's stem, the `_index.scss` files and their markers deleted, `styles.scss` trimmed
  to setup, themes and basics, each sibling given its `@use 'setup/…'` lines and imported last by
  its owner, `controls.scss` shared by `input.tsx` and `textarea.tsx`, `page.scss`,
  `app/root-error.scss`, `components/app-main-loading.scss`;
  `shared/hooks/{use-media-query,use-online-status,use-debounced-value}.ts` with tests (happy path
  and the unsubscribe or empty case) and callers (`app-mobile-nav` closes at `md`; `app-header`
  shows the offline badge with its styles in `app-header.scss`);
  `eslint.config.mjs` (elements `components` and `page` on `src/pages/*`, every policy and message
  renamed, the `STYLE` message, the `no-unreachable` path, the `.scss` import ban removed);
  `tests/unit/styles-tree.test.ts` rewritten to C2.2, `density.test.ts` compiling `styles.scss`
  plus every `.scss` outside `styles/`, `eslint-boundaries.test.ts` re-pathed with one violation and
  one allowed case per row; `template.yaml` `onlyWhen` re-pathed (the `app-account-menu` files
  and sheet, the `app-auth-*` files, `src/pages/{auth,forbidden,user}`); `AGENTS.md` (layer list,
  `Where does X go`, the import table, `Adding a feature` with the styles step and the hooks
  listed, `Styling`, `Tests`), `README.md` tree, `CHANGELOG.md` 4.0.0 with the move table,
  `index.yaml` version and summary. Split into C1a (moves, styles, scans, lint) and C1b (hooks,
  callers, documents) if the review package passes one sitting.
- **C2 Vue 2.0.0** (the same sections in Vue's spelling, plus C1.2's `Base` rename and C3 Vue):
  `layout/**` to `components/app-*.vue` (`app-main-layout`, `app-auth-layout`, `app-header`,
  `app-footer`, `app-side-nav`, `app-nav-links`, `app-toast-host`, `app-account-menu`,
  `app-install-button`, `app-language-toggle`; `slots.ts` and `rtl.spec.ts` moved unrenamed);
  `features/<m>/**` to `pages/<m>/` flat; `shared/components/app-*.vue` to `base-*.vue` with every
  tag, import and spec and the `vue/no-restricted-html-elements` message; the partials beside their
  owners through `<style lang="scss" src="./<stem>.scss"></style>`, `styles.scss` trimmed;
  `<TransitionGroup>` on the toast host's list with its classes in `app-toast-host.scss`, honouring
  `prefers-reduced-motion`, `<Transition>` on the header's offline badge, specs for both;
  `eslint.config.mjs` (elements and policies renamed, `vue/no-restricted-block` for `style` dropped,
  `vue/block-lang` extended, the `no-unreachable` path);
  `tests/unit/{styles-tree,rtl-styles,density}.spec.ts` to C2.2, `eslint-boundaries.spec.ts`
  re-pathed; `template.yaml` `onlyWhen`; `AGENTS.md`,
  `README.md` (the `slots.ts` path), `CHANGELOG.md` 2.0.0, `index.yaml`.
- **C3 Angular 2.0.0** (the same sections in Angular's spelling, C2.1 and C3 Angular):
  `layout/**` to `components/app-<name>/app-<name>.component.*` with classes `App<Name>Component`
  and explicit `app-<name>` selectors; `features/<m>/pages/<p>/` to `pages/<m>/<p>/`,
  `features/<m>/components/` to `pages/<m>/components/`, routes and forms beside them; the partials
  beside their components as `<stem>.component.scss` under `styleUrl` (the shared `controls.scss`
  through `styleUrls`), the seven C2.1 selectors fixed by rule, `styles.scss` trimmed;
  `model()` on `app-side-nav`'s `open` with `[(open)]` in `app-main-layout`, `@defer (on idle)`
  around the toast outlet with `@placeholder`, `linkedSignal` where local state resets on an input
  (the select's highlighted option is the candidate; its absence recorded), specs for each (the
  defer spec with `DeferBlockBehavior`); `eslint.config.mjs` (`layout` → `components`, the
  `feature-*` categories to `page`, `page-components`, `page-routes`, `page-form`, the components
  sub-folder listed first); `tests/unit/component-styles.spec.ts` (renamed from
  `no-component-styles`) to C2.2 including `ViewEncapsulation.None` and `::ng-deep`,
  `density.spec.ts`'s compile set, `eslint-boundaries.spec.ts` re-pathed; `template.yaml`
  `onlyWhen`; `AGENTS.md` (plus the zoneless line), `README.md`, `CHANGELOG.md` 2.0.0, `index.yaml`.
- **C4 docs** (C5's catalog side): ADR 0009 "Decisions made while building" and its versions
  paragraph confirmed; the amendment lines in ADR 0006, 0007 and 0008; `CONTRIBUTING.md` (lines
  that say "global SCSS tree", "a partial in `src/styles/components/` forwarded by its
  `_index.scss`", the release paragraph); the README matrix from `bun tools/validate.ts --readme`;
  a grep over `docs/` and `frontend/*/README.md` for `features/`, `layout/`, `styles/views`,
  `styles/components` and "global SCSS" (ADRs 0003–0008 keep their history unedited).
- **C5 final:** the Opus review of the catalog branch (every import-table row still refused by a
  seeded case; the three scans against the real trees; the C2.1 fixes against the baseline; no test
  deleted, skipped or focused; `frontend/next` unchanged), one fix wave, re-review; the local
  proofs; G3; the PR into `dev`; CI green; the release notes to the ledger.
- **H1 harness wording** (ADR C6: `.doc/glossary.md › Actions`,
  `.claude/skills/writing-plans/template.md › Frontend`, `.claude/README.md › Frontend choice`),
  plus a grep for stragglers over `README.md`,
  `AGENTS.md`, `.doc/`, `.claude/` for `features/`, `layout/`, "view partial" and "global SCSS";
  `node --test scripts/*.test.mjs` green (the docs tests cap file sizes); a Sonnet review; the PR
  into `dev` (G3).
- **H2** this plan's "As built".
- **H3 lock bump** after G4: `catalog.lock` to v1.9.0, the bootstrap smoke, a one-line pull request
  into `dev`, then the `dev` → `main` pull request (G5).
- **P1 proof** after H3: a disposable clone of the harness (`../fullstack-dev-harness-proof-022`)
  at the bumped lock (or pointed at the catalog branch with `--templates` if run before G4); Eitan
  opens Claude Code once in the clone to accept the trust dialog; a session inside it runs
  `/bootstrap-project` with `react-bun-express` (auth on), both packages' `check` green,
  `node scripts/verify.mjs` exit 0; then one small product task through the dev loop (an entity
  with a list page and a create form): the frontend agent must land the page in `pages/<noun>/`
  with a sibling `.scss`, its pieces in `pages/<noun>/components/`, nothing under `styles/` but the
  four entries, and pass lint and the scans unaided; `verify.json` exit 0, QA and review reports
  read; wall time and tokens against the 60-minute target; findings as backlog lines here, never
  fixed in the clone.

Waves: C0 → C1 → (C2 ∥ C3, disjoint paths; `index.yaml` and the README matrix merged by the
driver) → C4 → C5. H1 runs from the start in parallel with the catalog work; H2 after P1; H3 and
P1 follow G4.

### Local proofs (the session; Windows; from `C:\Dev`; port 5432 checked first, other projects untouched)

- `cd tools && bun run check`; `bun tools/validate.ts --readme`; `bun tools/validate.ts`;
  `bun tools/validate.ts --lockfiles`.
- `bun tools/test-generated.ts --case frontend/react/default --e2e --with-app`, then `split` and
  `bun` the same way; `alone`; `auth-off` and `brand` with `--e2e`; `auth-off-postgres` with
  `--with-services`, alone on the machine. Vue and Angular: `default`, `split`, `python` with
  `--e2e --with-app`; `alone`; `auth-off`, `i18n-off`, `pwa-off`, `brand` with `--e2e`;
  `flags-off`; `postgres` with `--with-services --e2e`. Without Docker on the machine, the
  `--with-app` legs are the PR's CI run.
- In a kept `default` project per template (`--keep`): `bun run check` in both packages; `grep`
  for every marker and placeholder (none left); `find src -name features -o -name layout` empty;
  `ls src/styles` is `styles.scss setup themes basics`; `dist/assets` carries a CSS file per lazy
  route (React, Vue); the Angular shell screenshots against the C0 baseline.

## Validation

- V01 — The catalog validates: manifests, the five headings, every `onlyWhen` path present in
  `base/`, markers dry-run over `server:auth` × `server:database` × `single` (and `i18n` × `pwa`
  for Vue and Angular), lockfiles frozen. Proof: `bun tools/validate.ts`, `--readme` (no diff
  after), `--lockfiles`.
- V02 — Every React, Vue and Angular case is green locally and in CI; `frontend/next`'s diff is
  empty. Proof: the local proofs above; the PR's checks; `git diff --stat a62bf90 -- frontend/next`.
- V03 — The trees: in each generated `default` project there is no `src/features`, `src/layout`,
  `src/styles/components` or `src/styles/views`; `src/styles` holds exactly `styles.scss`,
  `setup/`, `themes/`, `basics/`; every component file in `components/` is `app-*` (Angular: the
  folder and the `App*Component` class); Vue's `shared/components/` has no `app-*`. Proof: the
  three scans; the `find` and `ls` lines recorded in "As built".
- V04 — Co-location: every `.scss` outside `styles/` has a sibling owner with its stem that
  references it (a directory-shared partial has two or more); every stylesheet reference points at
  a sibling; no `style` attribute, no `:style`, no `scoped`, no `<style>` body, no `styles:`, no
  `ViewEncapsulation.None`, no `::ng-deep`. Proof: `styles-tree.test.ts`, `styles-tree.spec.ts`,
  `component-styles.spec.ts`.
- V05 — Lint enforces C1.1: each row of the import table has a seeded violation that fails with a
  message naming the new layer and an allowed case that passes; `src/hooks/` is still an unknown
  file. Proof: the three `eslint-boundaries` tests.
- V06 — The styling contract is unchanged: 36 px, 32 px compact, 44 px coarse over the new compile
  set; no physical `left`/`right` property; the BEM class names are the same strings, so the
  `ui-design` rubric names hold; `screens.spec` passes axe in both themes on `phone` and
  `desktop`. Proof: `density`, `rtl-styles`; the `--e2e` cases.
- V07 — Angular encapsulation: the seven C2.1 selectors are fixed by their rule; the header, the
  button in form actions, the form field with a checkbox and the auth layout render as the 1.0.0
  baseline in both themes at `phone` and `desktop`. Proof: S2's record; `screens.spec` and
  `shell.spec`; the ledger's screenshot pairs.
- V08 — Primary features: the three React hooks exist with tests and two have callers (the sheet
  closes at `md`; the offline badge shows when `navigator.onLine` is false); the Vue toast list
  enters and leaves through `<TransitionGroup>`; Angular's drawer binds `[(open)]` through
  `model()`, the toast outlet sits in a `@defer` block that renders after idle, and `linkedSignal`
  is used or
  its absence recorded. Proof: the specs; the ledger.
- V09 — No test was deleted, skipped or focused: every assertion of the three old scans has a
  successor named in the changelog; moved specs keep their names; no `.skip(` or `.only(` added.
  Proof: `git diff --stat a62bf90 -- 'frontend/*/base/tests' 'frontend/*/base/src/**/*.test.*'
  'frontend/*/base/src/**/*.spec.*'`; the Opus review.
- V10 — The documents agree: ADR 0009 (with "Decisions made while building"), the three agents
  files, the READMEs, the changelogs' move tables, `CONTRIBUTING.md`, `index.yaml` and the README
  matrix name the same layers, files and versions; each agents file keeps the five headings and
  the recipe. Proof: the Opus review; `bun tools/validate.ts`.
- V11 — The harness says `pages/<noun>` and "the page's stylesheet" where it said
  `features/<noun>` and "view partial", names v1.9.0 in `Frontend choice`, and no generic text
  names `features/`,
  `layout/` or "global SCSS"; `node --test scripts/*.test.mjs` is green. Proof: the grep over
  `README.md`, `AGENTS.md`, `.doc/` and `.claude/` and the test run, recorded in "As built".
- V12 — Reviews: each C and H task had a Sonnet review, each branch an Opus final review, with no
  open P0 or P1; CI green on both PRs. Proof: the ledger; the PR checks.
- V13 — The proof P1: a bootstrap of `react-bun-express` from the harness clone passes both
  `check`s and `verify.mjs`; one loop task ends with `verify.json` exit 0, the frontend agent's
  page under `pages/<noun>/` with its sibling stylesheet, passing the boundaries lint and the scan
  unaided; time and tokens are recorded. Proof: the ledger.

## Risks

- **Angular encapsulation changes a screen subtly** (a hover state styled from a parent, a focus
  ring on a projected control). Mitigation: C0 captures the 1.0.0 baseline before any move; S2
  proves the hardest pair; C2.1's fix rules; `screens.spec` in both themes; V07 compares the pairs.
- **A component sheet loads before `styles.scss`** or a lazy chunk's CSS arrives after its first
  paint. Mitigation: S1 inspects the build; `main-imports.test.ts` keeps the entry order; Vite
  injects a chunk's CSS before the module runs.
- **The Vue `Base` rename ripples** through every template, import and spec (20 files and their
  users). Mitigation: a scripted rename checked by `vue-tsc -b` and lint; the message says `Base`;
  the review greps for `<App[A-Z]` outside `components/`.
- **A gated file falls out of `onlyWhen`** when its path changes: `validate` catches a listed path
  that no longer exists, not an unlisted file that now ships in `auth-off`. Mitigation: the
  `auth-off` case's `check` (an import of a removed store fails typecheck); a grep in the ledger
  pairing every `@server:auth` marker's owner with its `onlyWhen` line.
- **The owner scan rejects a legitimate share** (`controls.scss`) or passes an orphan. Mitigation:
  the explicit two-or-more-owners rule; the scan run against the real tree during C0; one seeded
  orphan and one seeded share in its own tests.
- **Review packages of 75–89 moved files.** Mitigation: `git mv` first so the diff shows renames,
  content edits after; C1 split into C1a and C1b if a package passes one sitting; C2 and C3 copy
  C1's reviewed patterns.
- **Harness wording budgets.** `scripts/docs.test.mjs` caps the size-limited files. Mitigation:
  `node --test scripts/*.test.mjs` after every H1 edit; shorten rather than exempt.
- **The frontend agent writes a view partial from habit** in P1. Mitigation: the agents file's
  recipe names the sibling stylesheet and the four `styles/` entries; the scan fails the gate;
  findings become backlog lines, never silent fixes in the clone.
- **Docker down on the build machine.** The `--with-app` legs run in CI on the pull request;
  recorded in the ledger if so.

## Changes during the task

- 2026-11-09 — Driver's rulings R1–R3 (pre-flight scan, ledger): R1, a spec file follows its owner's
  stem when the owner is renamed, its describe/it titles unchanged (this amends V09's "moved specs
  keep their names"); R2, C2 and C3 ran in parallel in two catalog git worktrees on the branches
  `feat/frontend-pages-vue` and `feat/frontend-pages-angular`, merged back by the driver; R3, C1 was
  split into C1a (moves, styles, scans, lint, manifest) and C1b (hooks, callers, documents,
  changelog, `index.yaml`) from the start.
- 2026-11-09 — Driver's ruling R4 (ledger): Angular ships no `@defer` block; the toast is a CDK
  overlay portal, so `app-main-layout` has no toast outlet to wrap and every other shell element is
  a landmark or flag-gated. This amends V08's Angular `@defer` clause: the absence is the recorded
  outcome.
- 2026-11-09 — G2: S2 and S3 passed; S1 failed its "styles.scss first" criterion (Vite links a
  shared component chunk's CSS before the entry CSS; no behavioural break). Driver's ruling R6
  (ledger): the global tree is wrapped in cascade layers (`@layer setup, themes, basics;`), sibling
  sheets stay unlayered and win regardless of chunk order; spike S1b proves it before C1a. Recorded
  in the ADR's "Decisions made while building" by C4. R6 set aside the stop rule of this plan and
  the ADR, which Eitan approved (a failed spike stops the plan): the ledger's reasons are that
  layering is none of the rejected alternatives, is additive and reversible, and the failure is a
  bundler link-order technicality with no selector depending on it. Eitan can reverse it before the
  dev → main merge; it awaits his ratification.
- 2026-11-09 — Driver's ruling R7 (ledger): Vue's toast list gets no `<TransitionGroup>` (Reka
  teleports each toast root into its viewport, so the wrapper has no element to animate); the
  header's offline badge `<Transition>` is the Vue transition example. V08's Vue clause reads
  accordingly.
- 2026-11-09 — Driver's ruling R8 (ledger): the CDK overlay's pane and backdrop (`.modal__panel*`,
  `.modal__backdrop`) have no owning view, so their rules stay in the global tree
  (`styles/basics/_layout.scss`, layered), applied through the service's
  `panelClass`/`backdropClass`; no inline style from a service. Angular also records: no
  `linkedSignal` (no local state resets on an input), `no-unknown-files` turned on, the page lint
  element is `src/app/pages/*/*`.
- 2026-11-09 — Angular has no compile-based density test (C3 report; the e2e `shell.spec` asserts
  sizing), so step C3's `density.spec.ts` compile set does not exist and V06's Angular proof is
  `shell.spec` in CI.
- 2026-11-09 — The session took G3 (the catalog commits, PR #27 and its merge into `dev`) under
  Eitan's delegation; G4's merge and tag and G5 stay Eitan's. Driver's ruling R9 (ledger): the
  harness `dev` → `main` pull request is opened now, as Eitan asked, marked "merge after the lock
  bump H3 lands in `dev`".
- 2026-11-09 — Addition to C6, found by the Opus harness review: `.claude/rules/ui-and-styling.md`
  and `.claude/skills/code-review/SKILL.md` said "no stylesheet outside the styling tree", false
  once every SPA page and component owns a sibling sheet. Both now say a stylesheet lives only where
  the frontend's `AGENTS.md › Styling` places it. The plan template's React step order now follows
  the React recipe (the page's stylesheet, then the nav entry).

## As built

Built 2026-11-09 by subagent-driven development with Sonnet implementers and task reviewers, one
Opus whole-branch review per repository and the session as driver, under Eitan's delegated approval
("start. the only thing i want is a PR from dev to main which i will merge manually on both
repos"). The record is the ledger `.superpowers/sdd/022-2026-11-09-frontend-pages/progress.md`
(git-ignored) with every brief, report, review package, the spike record, the screenshot baselines
and the release-notes draft beside it.
Catalog branch `feat/frontend-pages` against `main` a62bf90 (33 commits, 408 files at 1cdab31;
`frontend/react` 4.0.0, `frontend/vue` 2.0.0, `frontend/angular` 2.0.0, ADR 0009 and the amendment
lines, CONTRIBUTING, the README matrix; `frontend/next`, the servers, tools, stacks and schemas
untouched), pull request #27 into `dev`: 52 of 52 checks pass (every case with `--e2e
--with-services --with-app`), merged into `dev` as 6dbd3f4 under the delegation; the release pull
request #28, `dev` → `main`, is open for Eitan. Harness branch `feat/frontend-pages` against
5282620: this plan, the C6 wording in three files, and the review's fix wave (two instruction
texts, one template line). Docker was down on the build machine, so every `--with-app`,
`--with-services` and e2e leg is the pull request's CI run.
Rulings R1–R4 and R6–R8 (the ledger skipped the number R5) are in the ledger; R1, R4, R6, R7 and R8
are in the ADR's "Decisions made while building"; R2 and R3 are process rulings (worktrees; the C1
split) recorded in the ledger only. R6 overrode the stop rule of this plan and the ADR that Eitan
approved: the decision Eitan most needs to ratify before merging the release PR (reasons in
"Changes during the task").

- V01 — `bun tools/validate.ts` ok after the matrix regeneration; `--readme` leaves no diff;
  `--lockfiles` ok; `cd tools && bun run check` ok.
- V02 — Local proofs, `check` only (no Docker, no e2e), from three sources:
  (a) the implementers' generated cases at their task heads (React 7eb07ff and cfe67f1, Vue
  f892fb1, Angular at C3's head before its R8 correction 2064f84): React `default`, `alone`,
  `auth-off`; Vue `default`, `auth-off`, `i18n-off`; Angular `default`, `auth-off`, `i18n-off`.
  One `vue/default` run failed once in its test step while proofs ran in parallel and passed on the
  rerun (816 tests); cause unproven.
  (b) 18 background cases, tools `check` and `--lockfiles`: 20 of 20 proof steps green
  (scratchpad proofs/summary.log, 14:46-15:34). They ran on the shared working tree while the C4
  docs and the fix wave were editing it, so their tree states varied. Cases: React `split`, `bun`,
  `auth-off-postgres`, `brand`; Vue and Angular `split`, `python`, `alone`, `pwa-off`, `brand`,
  `flags-off`, `postgres`.
  (c) No React generated case ran locally at the final tree 1cdab31. CI on #27 at 1cdab31 is the
  proof of the shipped tree: 52/52 checks, every case with `--e2e --with-services --with-app`.
  `git diff --stat a62bf90 -- frontend/next` is empty.
- V03 — In each base: no `src/features`, `src/layout`, `src/styles/components`, `src/styles/views`;
  `src/styles` is `basics setup styles.scss themes`; every component file in `components/` is
  `app-*` (Vue's `slots.ts`, the specs and the sheets are exempt by the scan; Angular: the folder
  and the `App*Component` class); Vue's `shared/components/` has no `app-*`; the three scans assert
  it on the real tree. The Opus harness review re-ran the checks at 1cdab31; the `find`/`ls`
  lines themselves are not recorded.
- V04 — The scans: React `tests/unit/styles-tree.test.ts` (six rules as pure functions, the
  last-import and layer-completeness checks, seeded temp-tree cases), Vue `styles-tree.spec.ts`
  (plus no `scoped`, no style body, the empty `src` block as the last block), Angular
  `component-styles.spec.ts` (plus no `ViewEncapsulation.None`, no `::ng-deep`, `styleUrls` for the
  shared `controls.scss`); the layered partials are globbed, not listed. The Opus catalog review
  at 165328c counted React 169, Vue 216, Angular 115 scan/density/boundaries tests; after the fix
  wave the scan suites are React 267 (`tests/unit` and `shared/components`), Vue unit 260, Angular
  `component-styles` 28 (task-C5-fix-report.md; different scopes, not a recount). That review
  compiled the old global tree against the new compile set: React and Vue differ only by the added
  rules (`.header__status`; the six badge-transition rules); Angular only by the expected
  encapsulation changes (`app-*` host rules → `:host`, the two interior reaches removed,
  `.button--block` added, `cdk.overlay()` dropped).
- V05 — The three boundaries tests keep one violation and one allowed case per row of the C1.1
  table with the new paths and messages; `src/hooks/` stays refused; the Vue page row covers every
  module file that is not a routes, form or `components/` file (the final review's fix).
- V06 — React and Vue density tests compile `styles.scss` plus every sibling sheet: 36 / 32 compact
  / 44 coarse hold; Angular has no density test, its sizing is CI's e2e `shell.spec`; no BEM class
  removed; the e2e `screens.spec` in both themes with axe is CI's.
- V07 — S2 (header and button) and the C3 selector table: own-host selectors → `:host`
  (app-checkbox's display rule became `:host { display: block }` in `checkbox.component.scss`),
  the two interior reaches removed (`block` input on the button; flex stretch in form-actions),
  the overlay pane and backdrop in the global tree (R8); the Angular shell's 8 views
  screenshot-identical to the 1.0.0 baseline outside the live uptime digits, the modal checked in
  a browser at R8 (pane rect identical, backdrop colours). Not screenshotted at the final build:
  the open account menu with the new `block` buttons, the checkbox field and the toast (S2 covered
  the menu at spike time); the e2e in CI (52/52 on #27) is their proof.
- V08 — React: `useMediaQuery` (sheet closes at `md`), `useOnlineStatus` (offline badge),
  `useDebouncedValue` (no caller, named in AGENTS.md), each with happy-path and unsubscribe/empty
  tests; Angular `model()` on the drawer with `[(open)]`; Vue `<Transition>` on the badge. Recorded
  absences: Angular `@defer` (R4) and `linkedSignal`; Vue `<TransitionGroup>` (R7).
- V09 — No test deleted, skipped or focused: the one deleted test file
  (`no-component-styles.spec.ts`) is replaced by `component-styles.spec.ts` with a successor per
  assertion; moved specs follow their owner's stem (R1), describe/it titles unchanged (ten Vue
  `base-*.spec.ts` keep `describe('App…')` titles; see the backlog lines below).
- V10 — ADR 0009 (with "Decisions made while building" and the versions re-verified against
  node_modules), the three agents files (five headings each), the READMEs, the changelogs' move
  tables, CONTRIBUTING, `index.yaml` and the README matrix name the same layers, files and
  versions; `validate` ok.
- V11 — The harness: `.doc/glossary.md` says `pages/<noun>`, the plan template says "the page's
  stylesheet", `.claude/README.md › Frontend choice` names v1.9.0; the one remaining "global SCSS
  tree" hit is the v1.7.0 history clause; the fix wave reworded the two "styling tree" texts;
  `node --test scripts/*.test.mjs` 240/240.
- V12 — Reviews: Sonnet task reviews for C1a, C1b (1 fix round), C2, C3, C4 (1 fix round) and H1;
  C0 (a record, no code) and H2 (this plan, reviewed by the Opus harness review) had no Sonnet task
  review. The Opus catalog review: ready with fixes, one fix wave, scoped re-review clean. The Opus
  harness review found three false As built claims and a missed C6 text, fixed in one wave (this
  commit) with a scoped re-review to follow (its result is not recorded here). The harness has no
  CI; its gate is `node --test scripts/*.test.mjs` (240/240). Catalog #27 CI: 52/52. Open P0/P1:
  none known on the catalog; the harness review's Critical and Important items are addressed in
  this wave, pending that re-review.
- V13 — P1 not run, and the proof clone `../fullstack-dev-harness-proof-022` does not exist yet.
  Its blockers: the trust dialog (Eitan opens Claude Code once in the clone), Docker down, and port
  4000 held by the spike's API (PID 35672; the session's stop was denied, and the Playwright
  configs set `reuseExistingServer: false`). The `v1.9.0` tag is not a hard blocker: P1 may run
  with `--templates` against the catalog branch. Housekeeping for Eitan: delete the catalog
  branches `feat/frontend-pages-vue` and `feat/frontend-pages-angular`. The harness `dev` → `main`
  merge must wait for the lock bump H3 (else `main`'s glossary says `pages/` while its lock pins
  v1.8.0); its pull request is opened with that note. H3 follows Eitan's catalog merge and tag as
  its own pull request.

### Backlog lines carried out of this plan

Proposed, not yet in `.plan/000-backlog.md`:

- [ ] next: co-located SCSS (its own ADR; was "the global SCSS tree")
- [ ] frontend: a move script for 3.x/1.x projects from each changelog's table
- [ ] frontend: close the scan escape forms (`ViewEncapsulation.ShadowDom`, Vue `<style module>`,
  the two-importer early return, the own-block check)
- [ ] angular: `OverlayConfig.maxHeight` for the modal's dead 90dvh cap
- [ ] react: the `role="status"` nested inside `aria-live` in the header
- [ ] vue: rename the ten `base-*.spec.ts` `describe('App…')` titles
- [ ] frontend: `@defer` / `<TransitionGroup>` / `linkedSignal` examples, if Eitan wants them
  regardless of R4 and R7
- [ ] catalog: raise `minCatalog` (still v1.5.0) with the lock bump so `harness-update` does not
  ship v1.9.0 wording to projects on older catalogs

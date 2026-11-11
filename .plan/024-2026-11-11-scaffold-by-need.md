# Scaffold by need: a frontend alone, parts added later by a three-way merge

Status: active
Owner: Eitan
Last updated: 2026-11-11
Input: ADR 0011 at the catalog's `docs/adr/0011-frontend-without-a-server.md` on
`feat/scaffold-by-need`: D1 the `server` selection, D2 what a frontend keys on it, D3 the
generator without a server, D4 generation as a function of the recorded selection, D5 tests,
D6 documents, D7 release, D8 the harness, spike S1.
Program: second of the three plans Eitan approved on 2026-11-10
(`C:/Users/eitan/.claude/plans/based-on-the-file-c-dev-playground-ai-co-expressive-hamster.md`,
milestone M2): 023 no template leftovers (shipped as v1.10.0), 024 scaffold by need,
025 Next on the SPA tree with co-located SCSS (ADR 0012).
Approval: delegated (2026-11-11, "start plan 024, and start 025 automatically after you complete
merges to dev from plan 024"): commits, pushes, pull requests and merges into `dev` in both
repositories. `dev` → `main` and the tag stay Eitan's.
Scope ruling: only this repository and the catalog (`C:/Dev/Playground/AI/fullstack-templates`),
on feature branches. Proofs run in the session's scratch folder or a disposable clone.
Branches:
- catalog `feat/scaffold-by-need`, cut from `dev` at 28d557c on 2026-11-11; PR into `dev`;
- harness `feat/scaffold-by-need`, cut from `dev` at 12fb764 on 2026-11-11; PR into `dev`. The
  lock bump follows the release as its own pull request (H5).
Base: catalog 28d557c · harness 12fb764
Stages: catalog work, harness scripts and docs. No role agent runs. The session drives Sonnet
implementers (`model: sonnet`), one Sonnet review per task, one Opus final review per branch.
Ledger: `.superpowers/sdd/024-2026-11-11-scaffold-by-need/` (git-ignored): spike records, briefs,
review packages, proof logs, the release-notes draft.

## Goal

A project starts with only the packages its brief needs and grows by parts that land as their
own commits. After this plan:

- the catalog ships `v1.11.0`: a frontend generated alone has no typed client, no `contract`
  command, no Compose file and an e2e suite that runs without a server;
- `scripts/scaffold.mjs` adds a part (a server with the frontend's typed client, a flag, a
  capability) to a generated project by merging two generations at the pinned catalog;
- the bootstrap scaffolds the frontend alone when the brief's `Server:` line says "later", and a
  plan that needs a part names it in a `Scaffold:` line the loop runs before implementation;
- `verify` passes on a lone frontend with Docker stopped.

## Scope

**In** (catalog): ADR 0011 D1 to D7: `schemas/template.schema.json`, the loader, the generator,
the case runner and their tests; the four frontend templates (`base/`, `template.yaml`, cases,
`AGENTS.md`, `README.md`, `CHANGELOG.md`); `index.yaml`; `docs/conventions.md`;
`CONTRIBUTING.md`; the README matrix; amendment lines in ADR 0003 and 0006. Release `v1.11.0`;
the tag is Eitan's.

**In** (harness): this plan; H1 to H4 below; the proofs S1 to S4; the lock bump H5 and P2 after
the release.

**Out:**

- Next's tree and styling (plan 025). The server templates.
- Removing a part, worker packages, per-component kit parts, a migration tool for projects
  generated before v1.11.0 (the script refuses a lock that differs from provenance).
- A `permissions.allow` entry for the script (the program left it out; it runs behind the
  normal prompt).
- Plan 023's open items (H2 As built, P1) stay on that plan.

## Assumptions

- ADR 0011 is the design. An implementer who finds a decision impossible reports it; the session
  records the change here and in the ADR's "Decisions made while building" first. A failed S1 is
  a stop that returns to Eitan.
- A stack's generated output is unchanged byte for byte: every existing non-`alone` case keeps
  its tree (D3). The tools' fixture snapshots prove it.
- The harness stays dependency-free. `scaffold.mjs` reads provenance through Bun's YAML parser
  (spike S3) in a child process, because Bun is already required and a line scan cannot carry
  the brand's free text safely.
- Build order: tools first (C1), then the four templates in parallel worktrees (R9 of plan 023),
  then documents. H1 and H3 run in parallel from G2; H2 needs H1's `scripts/catalog.mjs`.
- Word budgets (`scripts/docs.test.mjs`): `AGENTS.md` 1199/1200, `dev-loop` 2586/2600, startup
  7299/7300. Every `.md` edit replaces text; `node --test scripts/docs.test.mjs` runs after each.
  The loop's new procedure lives in `.claude/skills/dev-loop/scaffold-step.md`, read on demand.
- A run starts from the on-disk path spelling (`C:\Dev`); `scaffold.mjs` resolves the real
  spelling of the root and the catalog before it spawns Bun.
- Conventional Commits; every pull request targets `dev`; `main` moves only by a `dev` → `main`
  merge.

## Open Questions

1. ADR D3: a lone frontend gets no `docker-compose.yml` but keeps its Dockerfile.
   Recommended: yes; it deploys as its own image or to a static host.
   > Taken as recommended under the delegated start (session, 2026-11-11); for Eitan's review.
2. `scaffold.mjs` only adds: `--stack` (a lone frontend joins the stack that carries its
   template), `--flag <name>=true` on an existing package (any value on a package the call
   adds), `--capability <kind>=<provider>` for a kind with none. Anything else is refused as a
   removal. Recommended: yes.
   > Taken as recommended under the delegated start (session, 2026-11-11); for Eitan's review.
3. P2 needs the `v1.11.0` lock and a trusted clone, so its loop half runs after G4 and H5; before
   G3 the session runs its scripted half (S2: bootstrap alone, `verify` without Docker, the
   scaffold, `verify` again). Recommended: yes.
   > Taken as recommended under the delegated start (session, 2026-11-11); for Eitan's review.

## Steps

### Gates

- **G0 (session), done 2026-11-11:** both branches cut from `dev`; ADR 0011 and this plan written.
- **G1 (Eitan), done 2026-11-11:** "start plan 024" read as activation, with commits, pushes,
  PRs and merges into `dev` delegated.
- **G2 (session):** spikes S1 and S3 recorded. S1 failing is a stop.
- **G3 (session, delegated):** each branch committed, reviewed (Opus), proven locally, pushed;
  the PR into `dev` opened and merged once CI is green. Then plan 025 starts.
- **G4 (Eitan):** the catalog `dev` → `main` merge and the tag `v1.11.0`.
- **G5:** the lock bump PR into `dev` (H5), then P2's loop half.

### Spikes (throwaway, in the session's scratch folder)

| Spike | Passes when | On failure |
| --- | --- | --- |
| S1 round trip | Two projects bootstrapped at v1.10.0 (`vue-bun-express` default; `react-python-fastapi` with `database=postgres` and a non-default brand) regenerated from their provenance at the recorded commit, with post-generate: every generated file equal except `generatedAt` and lockfiles. | Stop (G2) |
| S3 YAML | `bun` (1.4) parses both provenance files to JSON from a child process of Node, with the arguments as an array (no shell). | Fall back to extending `scripts/provenance.mjs`'s line scan; record it |

### Tasks

- **C0** S1 and S3, recorded in the ledger.
- **C1 tools** (ADR D1, D3, D5's tools part): the schema's bare `server` key and object form; the
  loader's checks; the generator's dependency and script removal for an off selection, no
  `contract` command, no Compose file and no `SERVER_*` placeholder value without a server (a
  kept file that uses one fails the generation); the case runner runs a lone frontend's e2e;
  tools tests; every stack case's output unchanged.
- **C2 next 3.1.0**, **C3 react 5.1.0**, **C4 vue 3.1.0**, **C5 angular 3.1.0** (ADR D2, D5, D6):
  the `server` gating per the D2 table, the `alone` case with e2e, `alone-lean` for Vue and
  Angular, the agents file's "arrives with a server" list, `README.md`, `CHANGELOG.md`, the
  template's `index.yaml` line. Parallel, one catalog worktree each (`.superpowers/wt/<T>`).
- **C6 docs** (ADR D6): `docs/conventions.md` invariant 1, `CONTRIBUTING.md`'s manifest
  reference, amendment lines in ADR 0003 and 0006, the README matrix from
  `bun tools/validate.ts --readme`.
- **C7 final:** the Opus review of the catalog branch, one fix wave, the local proofs, G3, CI
  green, the release notes to the ledger.
- **H1 scripts** (harness): `scripts/catalog.mjs` (from `bootstrap.mjs`: `readLock`,
  `locateCachedCatalog`, `locateLocalCatalog`, `checkSchemaVersion`, and the on-disk path
  spelling), shared by `bootstrap.mjs` and `scaffold.mjs`; `bootstrap.mjs --template
  <kind>/<id>` as the alternative to `--stack` (no `--deploy` with it); `verify.mjs` needs
  Docker only with a `docker-compose.yml` or a `testDb` command; `history.mjs` `authFlagFrom`
  true only on an explicit `auth: true`; `readme.mjs --packages` rewrites the per-package
  command blocks of `README.md` from `.fullstack/catalog.yaml`; `.claude/harness.json` lists
  `scripts/catalog.mjs` and `scripts/scaffold.mjs` in the `harness` group. Tests for each.
- **H2 `scripts/scaffold.mjs`** (table below), its unit tests on temp git repositories with a
  fake generator, its manifest line.
- **H3 wording** (table below).
- **H4** this plan's "As built".
- **H5 lock bump** after G4: `catalog.lock` to v1.11.0, the bootstrap smoke, its own PR.
- **P2** after H5, in `../fullstack-dev-harness-proof-024` (Eitan opens Claude Code there once
  for the trust dialog): the Trello brief, then "sync boards across devices".

Waves: C0 → C1 → (C2 ∥ C3 ∥ C4 ∥ C5) → C6 → C7. H1 ∥ H3 from G2, then H2; S2 and S4 need C7's
tree and H2. H5 and P2 follow G4.

### H2: `scripts/scaffold.mjs`

```
node scripts/scaffold.mjs [--stack <id>] [--flag <name>=<bool>]… [--capability <kind>=<id>]…
  [--deploy single|split] [--slug <slug>] [--templates <path>] [--root <dir>] [--dry-run]
```

| Step | Behaviour |
| --- | --- |
| Refuse | a dirty tree (`git status --porcelain`); no `.fullstack/catalog.yaml`; a lock whose version or commit differs from provenance's `catalog` (with `--templates`: the checkout's `HEAD` must equal provenance's commit); a request that adds nothing or removes anything (open question 2) |
| Generate | BASE (provenance as recorded) and NEXT (plus the parts) into two temp folders at the same catalog, with post-generate, through `bun tools/generate.ts` and an answers file built from provenance; each folder is `git init`-ed so its own `.gitignore` decides the file list |
| Apply, per path in BASE ∪ NEXT | same in both: nothing · added: write, or a conflict if the project holds a different file · deleted: remove only if the project's file equals BASE · modified: write NEXT if the project equals BASE, else `git merge-file` (a conflict leaves markers) |
| Special files | lockfiles are never merged (an added one is written; `install` re-resolves the rest) · `.gitignore` gains NEXT's missing `# --- fullstack-templates: <name> ---` sections · `.fullstack/catalog.yaml` merges with `generatedAt` set to the project's in BASE and NEXT |
| Finish | no conflict: each NEXT package's `install`, then `contract` (producer first), then `format`; `node scripts/readme.mjs --packages --configuration`; print `chore(scaffold): add <parts>` and exit 0 · conflicts: write `.orchestrate/<slug>/scaffold/conflicts.md` (each path, its package dir, its owner role) and `state.json`, exit 1; once the owners resolve the markers, `--complete` refuses a leftover marker, then finishes as above · `--dry-run`: print the per-path actions, write nothing |

### H3: the wording

| File | Edit |
| --- | --- |
| `.doc/product-definition.md` | Non-functional Requirements gains `- Server: <!-- FILL: now \| later. "now" when v1 has accounts, data that must outlive this browser or reach another person, a secret, or a schedule -->` |
| `bootstrap-project/SKILL.md` | §1 infers `Server:` from the brief; §2 with "later" keeps the frontend template alone (`--template frontend/<id>`), skips server, capability and deploy questions, and passes `false` for the flags the scope does not use; §3 shows the `--template` form; §5's architecture items for a lone frontend are "n/a until a plan's `Scaffold:` adds the server", collapsed into a pointer to `scaffold-step.md`. Net negative words |
| `writing-plans/SKILL.md`, `template.md` | Metadata gains `Scaffold: <scaffold.mjs arguments> \| none`: a task that needs a part `.fullstack/catalog.yaml` lacks names it there |
| `agents/orchestrator.md` | One clause: fill `Scaffold:` from `.fullstack/catalog.yaml` and the plan's needs |
| `dev-loop/SKILL.md` + new `dev-loop/scaffold-step.md` | One pointer line after the branch is cut: a plan whose `Scaffold:` is not `none` runs `scaffold-step.md` (run, `verify`, ask for the commit, which becomes `Base:`; conflicts go to the owning role agent) before section 3 |
| `database/SKILL.md`, `database/data-layer-task.md` | The data layer arrives by `Scaffold: --capability database=<engine>`; the scaffold records `testDb`, `migrate` and `e2eDb` |
| `AGENTS.md` | Net −4 words: packages exist "each when the product needs it"; a part arrives only through `scripts/scaffold.mjs`; the `testDb`/`migrate` sentence shortened; cuts in Guardrails and DoD item 9 |
| `.claude/README.md` | "How work moves" names `Scaffold:`; one sentence on v1.11.0's lone frontend |
| `.plan/000-backlog.md` | The example line for a server added later, if the grammar block names the data layer |

### Local proofs (the session; Windows; from `C:\Dev`)

- Catalog: `cd tools && bun run check`; `bun tools/validate.ts` with `--readme` and
  `--lockfiles`; every case of the four frontends with `--e2e` through the ledger's e2e mutex,
  `withApp` cases `--with-app`, postgres cases `--with-services`.
- Harness: `node --test "scripts/**/*.test.mjs"`; `node --test ".claude/hooks/test/*.test.mjs"`.
- **S2 apply** (scripted P2 half, local catalog through `--templates`): bootstrap a lone Vue
  frontend (`--template frontend/vue`, i18n and pwa off); `verify` passes with `docker` off the
  `PATH`; edit a page and `package.json`; `scaffold.mjs --stack vue-bun-express --flag
  auth=false`: conflicts counted, then `verify` green; commit; then `--capability
  database=postgres`: conflicts counted, `verify` green with `testDb`.
- **S4** the same server add with `vue-python-fastapi` on Windows.

## Validation

- V01 — The catalog validates and every case of the four frontends is green locally and in CI;
  every stack case's generated tree is unchanged; the servers' diff is empty. Proof: the local
  proofs; the PR's checks; the fixture snapshots; `git diff --stat 28d557c -- server`.
- V02 — A lone frontend of each template has no generated client, no `openapi-ts` config, no
  `api:types` script, no `@hey-api/*` package, no API variable, no dev proxy, no `contract`
  command, no Compose file, no `SERVER_*` value; its `check` and e2e pass. Proof: the `alone`
  and `alone-lean` cases; the runner's assertion.
- V03 — S1: a regenerated project equals its bootstrapped files except `generatedAt` and
  lockfiles. Proof: the ledger's S1 record.
- V04 — `scaffold.mjs` refuses a dirty tree, a lock mismatch and a removal; applies added,
  deleted and modified files as the H2 table says; writes the conflict list and exits 1 on a
  conflict; `--dry-run` writes nothing. Proof: `node --test scripts/scaffold.test.mjs`.
- V05 — S2 and S4: a lone frontend gains a server and then a database, each as one commit,
  `verify` green after each; the conflict count is recorded. Proof: the ledger.
- V06 — `verify` on a lone frontend passes with `docker` absent; it still demands Docker with a
  Compose file or `testDb`. Proof: `verify.test.mjs`; S2.
- V07 — The wording is as the H3 table says; the suites are green and the budgets hold. Proof:
  `node --test "scripts/**/*.test.mjs"`; a grep for `Scaffold:` across the H3 files.
- V08 — P2 (after H5): the Trello brief yields no `backend/` and no `docker-compose.yml`;
  "sync boards across devices" carries a `Scaffold:` line and `chore(scaffold): add …` lands
  before the feature commit. Proof: the ledger.

## Risks

- **Regeneration is not byte-identical** (a timestamp, registry drift). Mitigation: S1 first;
  lockfiles never merged; a difference is fixed in the generator (ADR D4).
- **Conflicts swamp an add.** Mitigation: S2 counts them; the conflict list names the owner;
  the commit waits for a green `verify`.
- **A server-coupled file is missed in a template.** Mitigation: the `alone` case's `check`, its
  e2e and the `SERVER_*` assertion.
- **The stack output drifts while gating.** Mitigation: markers resolve to the old text with a
  server; fixture snapshots and every stack case.
- **Word budgets.** Mitigation: the loop's procedure in `scaffold-step.md`; replacements only.
- **Windows path case** makes Bun scripts no-ops. Mitigation: the real path spelling first.

## Changes during the task

None yet.

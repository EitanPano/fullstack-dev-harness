---
name: bootstrap-project
description: Turn a fresh clone of this harness into a running project. Use when .fullstack/catalog.yaml does not exist yet, when .doc/ still holds FILL markers, when the user pastes a product brief, or when the user asks to start, set up, create or bootstrap the project. Covers the product forms, the stack choice, the scaffold and the first backlog lines.
---

# Bootstrap a project

Run once per project, in the interactive session (no role agent). The harness owns no templates:
`catalog.lock` pins a release of the template catalog, and the bootstrap runs that catalog's
generator.

After a context compaction, Read this file again: a re-attached skill keeps only its first 5,000
tokens, and the last sections are the commit gate.

## 0. Preflight

1. Run `git rev-parse --show-toplevel`. On failure, offer `git init` and say the harness becomes
   the root commit (step 2). `scripts/bootstrap.mjs` refuses to run outside a git work tree
   (`--fetch` writes no project and skips the check).
2. Run `git rev-parse --verify HEAD`, in a pre-existing repository too. On failure, ask to commit
   the untouched harness as the root commit before the scaffold (`chore: import the harness`).
   Say why: `--finish` needs a HEAD to tell the harness's files from the project's changes, and
   refuses without one. Commit only on a yes.
3. Check Bun 1.4+, Node 24+ and git. Section 2 checks each chosen template's `tools`.

## 1. Decide the product with the user

### With a pasted brief (one-shot intake)

A brief may answer the forms: purpose, scope, authentication and roles, design, data store, data
model, glossary, stack, flags, deploy mode, tracker, backlog lines.

1. Fill every form from it, in the user's words: `.doc/product-definition.md` (Design included),
   `.doc/architecture.md` and `.doc/glossary.md`. Fill the markers the walk below asks about;
   leave the ones section 5 writes. Map the `Server:` line and each stack, flag, capability,
   deploy-mode and brand answer to its scaffold flag (sections 2 and 3).
2. Collect every gap: a marker the brief does not answer, a value the catalog cannot take, a
   clash with the glossary. Ask them all in one message, each with the skill's default or
   recommendation; do not walk the sections. Infer the Search and sharing answer (must public
   pages be found by search engines or show a rich preview when shared?) and the `Server:`
   answer from the brief; ask either in the gap message only when the brief is silent. Write
   both into the product definition; they decide the frontend and the server (section 2).
3. Compare the brief with the template gaps below.
4. Show one summary to confirm: the forms, the stack (or the lone frontend) and its flags, the
   database capability, the deploy mode, the brand (every flag with its value, display name
   included), the template gaps and the first backlog lines. Scaffold only after a yes.

**Template gaps.** Every server template ships the same auth defaults: entity `user`, roles
`user` and `admin`, a password of 8 to 128 characters. Each difference in the brief's entity
names, roles or password rule is a gap:

- Record it in the summary and in `.doc/architecture.md › Auth` as a decision for the first task
  that needs it (e.g. "roles `member` and `staff` replace `user` and `admin`; decided in the task
  that adds the first gate"). Change no template code.
- That task's plan carries `Retired:` with the template's old terms (`writing-plans`), role
  values in literal form (`'admin'`, `UserRole.admin`), never a bare word like `user`.
- After section 3, confirm the defaults in the generated package: entity and gates in its
  `AGENTS.md › Authentication`, password bounds in `models/user/constants`
  (`USER_LIMITS.password`). Add any gap they show.

### With no brief (section by section)

Open `.doc/product-definition.md`. For each `<!-- FILL: … -->` marker, in order, ask one question
at a time and replace the marker with the answer, in the user's words. Suggest a default only
when they ask.

- Ask the Search and sharing and `Server:` lines (Non-functional Requirements) with the form;
  they decide the frontend and the server (section 2).
- Walk the `Design` section too; its brand fields become scaffold flags (section 3). A product
  with no frontend answers it "n/a", and Search and sharing "n/a" too (which resolves that FILL
  marker).
- Do the same for `.doc/glossary.md` (one row per entity named in the scope) and
  `.doc/architecture.md`: other components, other data flows, Data store, Data Model, Data
  migrations, API versioning, Auth, External Dependencies, Deployment. Leave to section 5, which
  fills them once the stack is chosen: the Data store's `Local service` line, the `Deploy mode`
  and `TRUST_PROXY` lines, and the Auth section's Client model marker.

**Data store.** Skip with `Server: later`. Otherwise ask the `database` skill's question: engine,
client library, or decide later. Record the answer as given (the named engine or "decide later",
plus the client library). Whether the server template lists that engine as a provider is a separate
fact, settled in section 2; when it does, the generator wires it and section 5 fills the Data store
section from what was generated.

**Auth.** Scaffold a product with no accounts (Auth: none) with `--flag auth=false`; any other
answer keeps the server template's authentication (`auth` on, the default). The scaffold resolves
the `auth` markers in `.doc/architecture.md › Auth` (section 3): under `none` it keeps "Auth:
none", so answer no FILL marker inside an `<!-- auth-start -->` block. Never edit the glossary's marked auth rows (`session`, `caller`,
`OTP`, `target`): the scaffold removes them under `none` and keeps them otherwise.

Stop when the product definition's "Ready to plan" checklist is satisfied. Do not scaffold while
a marker remains in a section the checklist names.

## 2. Choose the stack

```bash
node scripts/bootstrap.mjs --fetch
```

It prints `catalog: <path>`, then `index.yaml`. Do not present the whole `stacks:` list. Read each
stack's `<catalog>/stacks/<id>/stack.yaml` (its `packages:` list: a `template` path and a `dir`
each) and each package's `<catalog>/<template path>/template.yaml`. Read nothing else under the
catalog path: never Glob, Grep, list or explore the catalog cache, and never dispatch an Explore
agent into it. It is outside the working tree on purpose.

Narrow by the Search and sharing answer, deciding by the `static` declaration, never by a stack
id:

- "yes": keep the stacks whose frontend does not declare `static` (server-rendered, Next today).
- "no": keep the stacks whose frontend declares `static` (a single-page app: React, Angular, Vue).
- A stack with no frontend skips this question.

With `Server: later`, keep the frontend template alone (`--template frontend/<id>` from a kept
stack, chosen by the same rule), skip the server, capability and deploy-mode questions, and pass
`--flag <name>=false` for each frontend flag the scope does not use. Auth is `none` and the Data
store "decide later".

Ask each remaining choice in turn: the frontend framework when the kept stacks differ in it (name
the options by template id: `frontend/react`, `frontend/angular`, `frontend/vue`), then the
server. Show the chosen stack with its reason (e.g. "single-page app: no public page needs search")
and accept an override. Ask every flag the templates declare (show its `summary` and
`default`) and every capability that lists providers. Map the answers to
`--flag <name>=<true|false>` and `--capability <kind>=<provider>`.

**Deploy mode.** Ask only when the stack has a server and its frontend's `template.yaml` declares
`static`. Put the tradeoff in two lines and map the answer to `--deploy <single|split>`:

- `single` (the default): one container and one port; the server serves the built frontend and
  the API, so no CORS and no frontend container. It needs the Compose floor in the `deployment`
  skill (section 1): name it and run `docker compose version` before accepting `single`. On an
  older client, offer `split` or an upgrade; do not scaffold `single`.
- `split`: a static-server image per frontend that proxies `/api` to the server, for separate
  scaling or hosting of the frontend.

A frontend without `static` (Next) is always `split`: do not ask, pass no `--deploy`. The
`deployment` skill moves the project between modes later.

**Database provider.** Ask it here when the template lists one
(`capabilities.database.providers`). When the template lists the engine the user named in
section 1, the provider fixes the client library (the package's `AGENTS.md › Adding the data
layer` names it): tell the user and confirm. On a yes, pass `--capability database=<id>` and write
no data-layer line. On a no, pass no capability and write that line.

**Tools.** Before scaffolding, check each chosen template's `tools` (name and minimum version, in
its `template.yaml`) against the machine, e.g. `uv --version` for a Python backend. Name any
missing or old tool, the version found and the minimum, then stop; do not scaffold.

## 3. Scaffold

```bash
node scripts/bootstrap.mjs --stack <id> --name <project-name> \
  [--flag k=v]… [--capability k=v]… [--deploy single|split] [brand flags]…
```

A lone frontend passes `--template frontend/<id>` in place of `--stack <id>`. Take the brand
flags from the `Design` form; pass only the fields that hold a value:

| Design field | Flag |
| --- | --- |
| `Display name` | `--display-name` |
| `Primary colour` (hex) | `--brand-primary` |
| `Neutral colour` (hex) | `--brand-neutral` |
| `Radius` | `--radius sm\|md\|lg` |
| `Type` | `--font system\|inter` |
| `Default theme` | `--theme system\|light\|dark` |
| `Density` | `--density comfortable\|compact` |

- Quote every hex value on the command line (`--brand-primary '#2f6f4e'`): an unquoted `#`
  starts a shell comment.
- An empty `Display name` omits the flag; the generator title-cases the project name. A given
  name is 1 to 60 characters of letters, digits, spaces and `. , : ! ? _ -`, starting with a
  letter or digit, with no two underscores in a row.
- Convert a named colour (e.g. "a cool neutral grey") to a hex and write it into the Design form.
  Map a free-text answer to an enumerated field to the nearest allowed value (Type "Roboto"
  becomes `system` or `inter`) and state the mapping to the user.
- Show every brand value with the stack and deploy mode (section 2) before scaffolding, so an
  unattended run does not stall.
- When the generator rejects a brand value (an invalid hex, enum or name, or a colour pair it
  cannot make pass contrast) it names the flag: report it, ask for another value, re-run.
- `Tone`, `Reference apps` and `Primary viewport` have no flag; the plans' `UX` lines read
  them.
- `node scripts/bootstrap.mjs --help` prints the usage and every flag.

The run:

- Creates the packages the stack lists, under the directories it names; a merged
  `docker-compose.yml` (none for a lone frontend) and `.gitignore`; `.editorconfig` when absent; and
  `.fullstack/catalog.yaml`, the provenance file (per package: template, version, flags,
  capabilities, commands and ports; plus the top-level `providers` map, empty when none was
  chosen).
- With a provider, adds its service to `docker-compose.yml`, `db/` with the database init
  script, and the connection variable in the server's `.env.example`.
- Installs each package and runs its `contract` (if it has one) and `format` commands.
- Writes the root `README.md` from a template (`bootstrap.mjs`, once the generator has run),
  leaving two placeholder lines for section 5: `<!-- readme:about -->` and
  `<!-- readme:features -->`.
- Refuses to run twice.

A failure before the move leaves nothing to clean: the generator stages the output and moves it
into place all or nothing (a failed move is rolled back). The clearing step runs after the move:
a failure there leaves the scaffold in place and the message names the recovery
(`node scripts/history.mjs <root> [--auth=false]`).

## 4. Verify

Open `.fullstack/catalog.yaml`. With a provider (a non-empty `providers` map, e.g.
`providers: { database: <id> }`; `providers: {}` means none), first run
`docker compose up -d --wait <service>` (the provider's service, named in
`docker-compose.yml`). Then, once:

```bash
cd <frontend dir>
bun x playwright install chromium   # add --with-deps on Linux
cd ..
node scripts/verify.mjs --out .orchestrate/bootstrap
```

- Run the browser install from the frontend package directory, so the package's pinned
  Playwright installs its own browser revision.
- `verify` can outlive the Bash tool's timeout: run it with `run_in_background: true` and wait
  for the completion notification.
- While `verify` runs, edit nothing in the working tree (no form edits, no file writes): it
  hashes the tree, and a concurrent edit fails or invalidates the run.
- `verify` runs the gates of every package in `.fullstack/catalog.yaml`, with no base because the
  scaffold is not committed yet, and must exit 0. On failure, fix the cause (not the gate),
  re-run, and tell the user what was wrong. A failing gate on a fresh scaffold is a catalog bug:
  say so explicitly, name the template and version from the provenance file, and record it in
  the final message.

**Dev check.** Start each package's `dev` command (an SPA's server first, as the frontend's
`AGENTS.md` says) and open the frontend's `http.port`: the home page renders. With a server,
`/api/health` answers on that port for an SPA (its dev proxy) and on the server's port for Next.

Stop the dev servers by port. On Windows a `--reload` server leaves its child holding the port
after the parent is stopped, and the port's owner is then the dead reloader, so stop the owner
and its children (replace 8000 with the package's port):

```powershell
$o = (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess | Select-Object -Unique; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in $o -or $_.ParentProcessId -in $o } | ForEach-Object { Stop-Process -Id $_.ProcessId }
```

On Linux and macOS: `lsof -ti :<port> | xargs -r kill`. Confirm the port is free before the app
check: `Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue`
(Windows) or `lsof -i :<port> -sTCP:LISTEN` (Linux, macOS) prints nothing.

**App check.** A lone frontend has no Compose file: skip it.

1. Export in the shell (never in a file) a throwaway value for every secret the server's
   `.env.example` lists, and with a provider its `DATABASE_URL`: the server refuses to start in
   production without them.
2. With a provider, run `docker compose stop database` (the dev project's service; the app
   project publishes the same loopback port).
3. At the root, run `docker compose --profile app up --build --wait` with a fresh `-p <name>`
   (a reused project name reuses its volumes). With a provider, the `<dir>-migrate` one-shot
   service runs the migrations first.
4. Check it. In `single`: one container on the server's port (no frontend container in
   `docker compose ps -a`), where `/` returns the page and `/api/health` answers. In `split`:
   one container per package, reached through the frontend's port.
5. Stop it with `docker compose --profile app down` (same `-p`).
6. With a provider, run `docker compose start database`, even when the app check failed.

A fresh server package has health, the commented reference module, and authentication when the
`auth` flag is on. Its store is in-memory (nothing survives a restart until the data-layer task)
or, with a provider, the wired engine with its migrations and test database (the package's
`AGENTS.md › Adding the data layer`). Production secrets are listed in its `.env.example`;
development runs with defaults and warns.

## 5. Finish the forms

Do each item; the dev loop refuses to start until the last one holds.

1. **Backlog.** Follow the grammar at the top of `.plan/000-backlog.md`. With no server, no
   data-layer line. With a server and no database provider passed at generation, the first line
   is `- [ ] add the <engine> data layer | stack:backend` for a named engine, or
   `- [ ] add the data layer | stack:backend` for "decide later" (the `database` skill says what
   that task delivers). The first in-scope capability is the first line with a provider, the next line without one. Set `tracker:` in the backlog header to
   `linear` or `none` as the user prefers.
2. **Architecture rows.** Fill `.doc/architecture.md` per the table in
   `.claude/skills/dev-loop/scaffold-step.md`: all rows; a lone frontend only `Stack`, and
   `n/a: no server yet` in the table's other places.
3. **README.** In `README.md`, replace `<!-- readme:about -->` with About, written from Purpose
   and Problem Statement, and `<!-- readme:features -->` with Features: the in-scope capabilities
   from Product Scope, one line each, written `- <capability> (planned)` (nothing is built yet);
   the dev loop removes the ` (planned)` suffix when a task delivers the capability.
4. **Change Log.** Replace its FILL line in `.doc/architecture.md` with
   `- <YYYY-MM-DD>: initial architecture accepted; <stack id>, deploy <mode>, <engine or
   in-memory store>.` (A lone frontend: its template id, no deploy, no store.)
   Later entries go above it (newest first).
5. **Ready to plan.** Three markers may stay open, each until its own decision: the production
   `TRUST_PROXY` (the user's to decide, the `deployment` skill), the production target, and Data
   migrations when no provider was chosen. Every other marker holds an answer. "Decide later" is
   an answer for the Data store engine alone: a marker the user cannot answer stays, is named in
   the summary, and blocks the first plan that depends on it. Then tick the three boxes of
   `## Ready to plan` in `.doc/product-definition.md`, once each holds.

## 6. Branch, commit gate and hand over

1. Create `chore/bootstrap`; never commit on `main`.
2. Summarise what exists, including what the scaffold removed, as the bootstrap printed it: the
   harness's own plans (`.plan/001–…`; a product's first plan is `001`) and the auth text (under
   Auth none).
3. As the last step before asking to commit, run `node scripts/bootstrap.mjs --finish`. It
   refuses while a `<!-- readme:` placeholder remains (fill it and run again); writes
   `.fullstack/harness.json`, the harness version record; removes the `.gitignore` dev block and
   the harness-development files (tests, setup scripts, this skill); and warns when the git
   history still holds the harness's commits. This skill's own files are then gone: that is
   expected, and the commit includes the removals.
4. Ask whether to commit the scaffold as `chore(bootstrap): scaffold <project-name>`, including
   `.fullstack/catalog.yaml`; the dev loop starts only from a clean tree, so the first task waits
   for this commit. Commit only on a yes, then point the user to `/dev-loop` for the first task.

## Never

- Run any scaffolder inside an existing package.
- Browse the catalog cache.
- Edit `scripts/`, `.claude/`, `catalog.lock` or other harness files by hand. The one change
  there is `--finish`, which removes this skill's files and the harness-development files through
  the script, as designed.
- Create a real env file; secrets stay in the shell environment.
- Install a database client or start a database service, except the Compose service of a provider
  chosen at generation (section 4).

# Mechanics audit — fullstack-dev-harness
Date: 2026-10-20 · Reviewer: mechanics fork · Model: Fable 5.1

Question answered: does Claude Code actually do what the harness files claim?

## Method

Read: all 29 files in the repo (settings, three hooks, five agents, five skills, four rules, output style, AGENTS.md, CLAUDE.md, README, .doc/*, .plan/*, .orchestrate/README.md, Cursor and Copilot pointers).

Environment: Claude Code 2.1.304, Node v24.15.0, Bun 1.4.0, Git Bash (MSYSTEM=MINGW64) is the shell behind the Bash tool. Not a git repo. No root `package.json`, `.mcp.json`, `.gitignore`, `.env`, `frontend/`, `dev-loop.js`.

Executed (payloads in `<scratchpad>/payloads/mechanics/`, run from the repo root):

```
# [1] Claude Code's own role signal is ignored
node .claude/hooks/enforce-agent-boundaries.js < frontend-writes-backend.json   # exit=0 (allowed)
AGENT_ROLE=frontend node .claude/hooks/enforce-agent-boundaries.js < frontend-writes-backend.json   # exit=2 (blocked)

# [2] malformed stdin -> every hook allows
<each hook> < malformed.json                                                    # exit=0, exit=0, exit=0
printf '' | <each hook>                                                         # exit=0

# [3] Node 20 emulation (module detection off) -> ESM import crashes
node --no-experimental-detect-module .claude/hooks/enforce-agent-boundaries.js < frontend-writes-backend.json
#   SyntaxError: Cannot use import statement outside a module ... exit=1

# [4] hook invoked while cwd is a subdirectory
cd .claude && node .claude/hooks/block-destructive-bash.js                     # MODULE_NOT_FOUND, exit=1
AGENT_ROLE=frontend node hooks/enforce-agent-boundaries.js < subdir-cwd-allowed-path.json
#   blocks the ALLOWED path as "../frontend/src/a.ts", exit=2

# [5] path handling that works
relative, absolute (C:/ and C:\), drive-letter case mismatch, repo-escaping paths -> correct verdicts
node --check on all three hooks -> OK; dynamic import() of the ESM hook on Node 24 -> OK

# [6] cost
secret hook + boundary hook on one Write: real 0.114s (two node processes)
```

The session's own hooks blocked my first two inline test commands because the command text contained `rm -rf` and `.env`. That is the hooks working, and it is also why hook tests must be driven from payload files.

Docs consulted (all code.claude.com, fetched 2026-10-20): `/docs/en/hooks`, `/docs/en/hooks-guide`, `/docs/en/sub-agents`, `/docs/en/skills`, `/docs/en/memory`, `/docs/en/settings`, `/docs/en/settings-reference`, `/docs/en/permissions`, `/docs/en/mcp`, `/docs/en/output-styles`; the settings JSON schema at `https://www.schemastore.org/claude-code-settings.json`; GitHub changelog on Copilot and AGENTS.md.

## Score: 4/10

The static configuration is valid: settings.json parses, the hook block is wired correctly, every agent, skill, rule and output-style file uses documented frontmatter, and the `@` import chain resolves. The dynamic half does not hold. The boundary hook, the one guardrail that gives the multi-agent loop its shape, is inert in this runtime because nothing sets `AGENT_ROLE`, while Claude Code already hands every hook the signal it needs (`agent_type`) on stdin. All three hooks fail open, and the repo contains three independent ways to trigger that: the Node 20 contract in `backend.md`, a relative script path that breaks the moment the hook runs outside the project root, and a deliberate `exit(0)` on unparseable input. Fixing all of this is small (under 40 lines), which is why the score is 4 and not 2.

## Scorecard

| Sub-dimension | 0-10 | Why (one line) |
|---|---|---|
| Settings validity | 7 | Valid JSON, `$comment` keys tolerated, hooks fire; approves MCP servers that do not exist; no `$schema` |
| Hook wiring correctness | 4 | Matchers and exit codes are right; relative `node .claude/hooks/x.js` depends on cwd; `*` matcher runs on every tool |
| Hook robustness | 2 | Fail-open on crash, on wrong Node, on bad JSON; role signal never arrives |
| Import chain | 6 | CLAUDE.md -> AGENTS.md -> rules resolves (2 of 4 hops); rules are also loaded natively, so probably in context twice |
| Agent / skill frontmatter | 8 | All fields valid, `model: opus` is a real alias; descriptions thin; no per-agent hooks or tool limits |
| Cross-tool compatibility | 4 | Cursor and Copilot read AGENTS.md natively but never expand `@` imports, so the rules never reach them |
| Windows compatibility | 5 | Works today because Git Bash is installed; hooks and docs silently assume it |

## Findings (most severe first)

### [P0] MECH-01 — The boundary hook is inert: it waits for `AGENT_ROLE`, which nothing sets, while Claude Code already sends `agent_type`
- Where: `.claude/hooks/enforce-agent-boundaries.js:30-34`, `AGENTS.md:18-19`, `.claude/settings.json:38-45`
- Evidence: payload `frontend-writes-backend.json` carries `"agent_type":"frontend"` and a write to `backend/x.ts`; the hook exits 0 (test [1]). With `AGENT_ROLE=frontend` the same payload exits 2. `dev-loop.js`, the only thing documented to set `AGENT_ROLE`, does not exist. Hooks reference: "When a subagent calls a tool, tool events such as `PreToolUse` and `PostToolUse` fire the same configured hooks as in the main conversation, and the input carries the `agent_id` and `agent_type` common input fields that identify the subagent" and "`agent_type` | Agent name (for example, `"Explore"` or `"security-reviewer"`)". Sub-agents reference: "`name` ... Hooks receive it as `agent_type`." The agent names `frontend`, `backend`, `qa` already match the hook's `ALLOWED_WRITE_PREFIXES` keys exactly.
- Impact: in every real session today, a `frontend` subagent can write into `backend/`, `.claude/`, `.doc/`, `.plan/`; a `qa` subagent can edit feature source. The whole "roles stay in their lane" promise is prose only. This is the single biggest gap between what the harness claims and what the runtime does.
- Recommendation: read the role from stdin, keep the env var as an override for a future driver:
  ```js
  const role = process.env.AGENT_ROLE ?? payload?.agent_type
  ```
  Move the parse step above the role check so a parse failure cannot short-circuit it. Alternative with the same effect and no central hook: put a `hooks:` block in each agent's frontmatter (documented shape below, from `/docs/en/sub-agents`), which also removes the "unknown role passes" branch:
  ```yaml
  hooks:
    PreToolUse:
      - matcher: "Edit|Write"
        hooks:
          - type: command
            command: node "${CLAUDE_PROJECT_DIR}/.claude/hooks/enforce-agent-boundaries.js"
  ```
  Frontmatter hooks in a project subagent run only after the workspace trust dialog is accepted, so the central settings.json hook is the more robust home.
- Effort: S

### [P0] MECH-02 — All three guardrails fail open: a crash, a wrong Node version, or unparseable input lets the tool call through
- Where: `.claude/hooks/block-destructive-bash.js:23-27`, `.claude/hooks/block-secret-file-access.js:34-38`, `.claude/hooks/enforce-agent-boundaries.js:17-18,37-41`, `.claude/agents/backend.md:19`
- Evidence: test [2], malformed and empty stdin, exit 0 on all three. Test [3], `node --no-experimental-detect-module` (the Node 20 behaviour; module syntax detection shipped unflagged in 22.7) gives `SyntaxError: Cannot use import statement outside a module`, exit 1. `backend.md:19` mandates "Node.js 20". The hook's own comment at line 17 says "the root package.json sets type: module"; there is no root `package.json`. Hooks reference on exit codes: "Non-blocking error: your hook exits with any other code, or fails in some other way, such as not starting or printing invalid JSON. The action goes ahead, except for hooks whose failure blocks the action, for example a hook with `onFailure` set to `"block"`" and "Exit code 1 without valid JSON output is a non-blocking error ... If your hook is meant to enforce a policy, use `exit 2`."
- Impact: on a clone run with the Node version the harness itself prescribes, the boundary hook crashes on every Edit/Write and Claude Code treats the crash as "proceed". The user sees a one-line `hook error` notice and the guardrail is gone. The same is true for any future bug in a hook. The hooks were written to be the layer that holds under `bypassPermissions`; a layer that fails open is not that layer.
- Recommendation:
  1. `exit(2)` on parse failure with a clear stderr line. A guardrail must refuse what it cannot inspect.
  2. Set `"onFailure": "block"` on each command hook in settings.json so a crash or missing script blocks the call.
  3. Remove the Node version ambiguity: rename the ESM hook to `.mjs`, or add a root `package.json` with `"type": "module"` and `"engines": { "node": ">=22.12" }`, and align `backend.md` with it.
  4. Add a 20-line self-test (`node .claude/hooks/test.mjs`) that pipes the payload fixtures and asserts exit codes; run it in CI and from the clone checklist.
- Effort: S

### [P1] MECH-03 — Project root is derived from the current directory, in two places that break the moment cwd is not the repo root
- Where: `.claude/settings.json:24,33,42` (`node .claude/hooks/...`), `.claude/hooks/enforce-agent-boundaries.js:51` (`payload?.cwd || process.cwd()`)
- Evidence: test [4]. Run from `.claude/`, the settings command form fails with `MODULE_NOT_FOUND` (exit 1, which per MECH-02 means "proceed"). With `cwd` set to a subdirectory, the hook relativizes an allowed write to `../frontend/src/a.ts` and blocks it (false positive). Hooks reference: "Handlers run in the current directory with Claude Code's environment", "`${CLAUDE_PROJECT_DIR}`: the project root where the session started", and the `cwd` input field "follows Claude's current directory". Hooks guide best practices: "Use absolute paths: specify full paths for scripts. In exec form, use `${CLAUDE_PROJECT_DIR}` and the path needs no quoting." `/cd`, `isolation: worktree` subagents, and `--add-dir` all move cwd.
- Impact: either the guardrails vanish (script not found, fail open) or they block legitimate in-lane writes, depending on where Claude happens to be. Both are silent from the user's point of view.
- Recommendation: use exec form so no shell and no cwd are involved:
  ```json
  { "type": "command", "command": "node",
    "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/enforce-agent-boundaries.mjs"],
    "onFailure": "block" }
  ```
  Inside the hook, resolve against `process.env.CLAUDE_PROJECT_DIR ?? payload.cwd`, and compare with `path.relative(projectRoot, filePath)` after normalising both sides. Exec form on Windows needs a real `.exe`; `node.exe` qualifies.
- Effort: S

### [P1] MECH-04 — `.claude/rules/*.md` are loaded natively and also imported by AGENTS.md, so the four rules are probably in context twice
- Where: `AGENTS.md:36-39` (`@.claude/rules/...`), `.claude/rules/*.md`
- Evidence: memory reference: "Rules without `paths` frontmatter are loaded at launch with the same priority as `.claude/CLAUDE.md`" and, on imports, "Imported files are expanded and loaded into context at launch alongside the CLAUDE.md that references them." The page documents de-duplication only for AGENTS.md ("Claude Code skips an `AGENTS.md` it has already loaded"), not for rules reached through an import. I could not confirm the duplication empirically from this session (`/context` is interactive-only; the debug log does not list memory files), so treat this as likely rather than proven.
- Impact: four extra copies of always-on text on every request, and two sources of truth for the same rule if someone edits one copy. Harmless to correctness, costly to context and adherence.
- Recommendation: delete the four `@` lines. Keep the "Rules" table in AGENTS.md as plain text (backticked paths are not imported: "writing `` `@README` `` keeps the text literal") so Cursor and Copilot readers still see where the rules live. Verify with `/context` after the change. Consider `paths:` frontmatter on `ui-and-styling.md` so it loads only when working under `frontend/`.
- Effort: S

### [P1] MECH-05 — settings.json approves two MCP servers that are not defined anywhere, and three agents are told to use tools those servers would provide
- Where: `.claude/settings.json:3-4`, `.claude/agents/orchestrator.md:12,48,61-70`, `.claude/agents/frontend.md:43`
- Evidence: no `.mcp.json` in the repo. MCP reference: `enabledMcpjsonServers` "control[s] approval of servers defined in a project's `.mcp.json`"; the docs do not describe listing a server that does not exist, and in this session no figma or linear tools are registered. Settings reference: "`enableAllProjectMcpServers` and `enabledMcpjsonServers` in a project's committed `.claude/settings.json` are ignored in an untrusted folder." MCP reference: "In `claude -p` runs, Agent SDK sessions, and cloud sessions, Claude Code can't show the prompt and loads project-scoped servers without asking."
- Impact: the orchestrator is instructed to create Linear tickets and inspect Figma frames with tools that do not exist; the `TICKETS_JSON` contract has no consumer. An agent either hallucinates the step or stops. For a clone this is a hard dependency on two SaaS accounts that a from-zero project may not have. The `$comment2` rationale about headless agents seeing servers as "pending approval" is correct in general but references a driver that is absent.
- Recommendation: ship a `.mcp.json` with the two servers as optional, or remove the two names from `enabledMcpjsonServers` and make the Figma and Linear steps conditional in the agent prompts ("if a Figma tool is available"). For a clonable harness, keep MCP integrations as an opt-in layer documented in the clone checklist. Note for the security fork: a committed `.mcp.json` plus `enabledMcpjsonServers` is trusted automatically in `-p`/SDK sessions.
- Effort: S

### [P1] MECH-06 — No declared runtime contract: no root `package.json`, no `engines`, no `.node-version`, and the files disagree
- Where: `.claude/agents/backend.md:19` (Node 20), `.claude/hooks/enforce-agent-boundaries.js:17` (claims root package.json), `.claude/agents/frontend.md:72-76` (npm), Eitan's global prefs (Bun)
- Evidence: `ls package.json ../package.json ../../package.json` -> none. Hook comment quoted above. The hooks run only because Node 24 detects module syntax; the comment says they run because of a package.json that is not there.
- Impact: a clone cannot tell what Node, package manager, or module system it is expected to run; the hooks' correctness depends on an undocumented Node floor.
- Recommendation: add a root `package.json` with `"type": "module"`, `"engines"`, `"packageManager"` (Bun per Eitan's prefs, or document npm as the deliberate default), and a `"scripts": { "hooks:test": "node .claude/hooks/test.mjs" }` entry. Align `backend.md` and `frontend.md` with it. Overlaps MECH-02 item 3; listed separately because it is a contract, not a bug.
- Effort: S

### [P1] MECH-07 — Windows works by accident: the Bash tool and the hooks both depend on Git Bash being installed, and nothing says so
- Where: `.claude/settings.json` hook commands (shell form), every `cd x && npm ...` in `frontend.md:73-76`, `qa.md:39-58`, `backend.md:54-55`, `writing-tests/SKILL.md:48-50`
- Evidence: `MSYSTEM=MINGW64`, `BASH_VERSION=5.2.26` inside the Bash tool, so `&&` chains work for Claude. Hooks reference: "Shell form runs when `args` is absent. The `command` string is passed to a shell: `sh -c` on macOS and Linux, Git Bash on Windows, or PowerShell when Git Bash isn't installed." and "On Windows without Git Bash, a failing PreToolUse command hook can block the tool call". Also: "Don't write the bare `$CLAUDE_PROJECT_DIR` spelling in a PowerShell hook. PowerShell parses it as an undefined local variable and resolves it to `$null`". Eitan's primary shell is PowerShell 5.1, which has no `&&` operator, so the documented commands fail when a human copies them.
- Impact: on a machine without Git Bash the hooks run under PowerShell and the shell-form command still works (it is just `node path`), but any future `VAR=value node ...` prefix or bare `$CLAUDE_PROJECT_DIR` breaks. The human-facing commands are wrong for the user's own shell.
- Recommendation: exec form for hooks (MECH-03) removes the shell dependency entirely. In docs, give commands as `bun run --cwd frontend test` style (no `cd &&`) or as package scripts invoked from the root, which are shell-neutral. State "Git Bash required for the Bash tool on Windows" in the README prerequisites.
- Effort: S

### [P2] MECH-08 — Cursor and Copilot read AGENTS.md natively but never see the rules, and the pointer files are now redundant
- Where: `.cursor/rules/index.mdc`, `.github/copilot-instructions.md`, `AGENTS.md:36-39`
- Evidence: GitHub changelog "Copilot coding agent now supports AGENTS.md custom instructions" (github.blog, 2025-08-28). Cursor forum and 2026 guides report root `AGENTS.md` is picked up automatically; no official Cursor page was reachable, so treat Cursor support as reported, not confirmed. Neither tool documents `@path` import expansion, which is a Claude Code memory feature ("CLAUDE.md files can import additional files using `@path/to/import` syntax").
- Impact: in Cursor or Copilot the four `@.claude/rules/...` lines are literal text; the code-style, naming, UI and git rules are not applied there. The two pointer files add nothing those tools do not already do.
- Recommendation: decide the audience. If the harness is Claude-Code-first (it is: hooks, agents, skills are all Claude-only), keep the pointers as one-line "see AGENTS.md" files or delete them, and list the rule paths in AGENTS.md as plain text (ties into MECH-04). If multi-tool parity matters, inline the four short rules into AGENTS.md and delete `.claude/rules/`.
- Effort: S

### [P2] MECH-09 — `permissions.deny` is valid but partly redundant with the hooks, and the Read rules are written in the narrowest form
- Where: `.claude/settings.json:6-15`
- Evidence: permissions reference: "A `*` can go anywhere in the rule: at the start, in the middle, or at the end", so `Bash(*DROP TABLE*)` is valid; `Bash(rm -rf *)` matches commands that begin with `rm -rf` only. "Bare filenames follow gitignore semantics and match at any depth, so `Read(.env)` and `Read(**/.env)` are equivalent", while `Read(./.env)` anchors to the current directory. "Claude makes a best-effort attempt to apply `Read` rules to all built-in tools that read files like Grep and Glob" and "A `Read` deny rule also blocks the Edit and Write tools on the same path". Also: a Bash deny rule "isn't a security boundary around the program". Settings schema top-level `additionalProperties: true`, so `$comment` keys are legal (the lead that they might break validation is refuted; this session's hooks fired from this file).
- Impact: three per-directory `Read(./...)` rules could be one `Read(.env)` plus `Read(.env.*)`; the Bash denies catch only the exact spellings and the hooks already cover them. No breakage, just two overlapping mechanisms to maintain.
- Recommendation: `"deny": ["Read(.env)", "Read(.env.*)", "Edit(.env)", "Edit(.env.*)"]` and keep the destructive-command policy in the hook only. Add `"$schema": "https://json.schemastore.org/claude-code-settings.json"` for editor validation. The security fork owns the bypass matrix; this item is about syntax and overlap.
- Effort: S

### [P2] MECH-10 — The secret hook runs on every tool call, including MCP, Agent, Grep and TodoWrite
- Where: `.claude/settings.json:20-27` (`"matcher": "*"`)
- Evidence: hooks reference: `"*"`, `""`, or omitted "activates on every occurrence of the event"; MCP tools are matched by `*`. Measured ~55 ms per node process on this machine; three hooks on an Edit cost about 0.11 s.
- Impact: negligible latency, but a crash in this hook (MECH-02) would then affect every tool, and the hook inspects fields only four tools populate.
- Recommendation: either keep `*` deliberately (it is the safest choice for a secret guard) and make the hook fail closed, or narrow to `Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob|Bash|PowerShell`. Document the choice in the hook header.
- Effort: S

### [P2] MECH-11 — Comments and docs describe a runtime that does not exist (claim-vs-reality inventory)
- Where and claim:
  - `AGENTS.md:18` and `.claude/settings.json:3`: `dev-loop.js` sets `AGENT_ROLE`, spawns agents headlessly. No such file.
  - `.claude/hooks/enforce-agent-boundaries.js:5-6,17`: "dev-loop.js (see runAgent -> spawnClaude)", "the root package.json sets type: module". Neither exists.
  - `.claude/hooks/block-secret-file-access.js:9-10,17`: "The repo root .env holds LINEAR_API_KEY". No `.env`.
  - `.claude/hooks/block-secret-file-access.js:12`: "Runs even when AGENT_PERMISSION_MODE=bypassPermissions". `AGENT_PERMISSION_MODE` is not a Claude Code variable; the real input field is `permission_mode`.
  - `.claude/agents/frontend.md:59-61`: `frontend/vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts`. No `frontend/`.
  - `.claude/agents/frontend.md:68` vs `.claude/agents/qa.md:20` and `enforce-agent-boundaries.js:24`: e2e under `frontend/tests/e2e/` vs `frontend/e2e/`.
  - `.orchestrate/README.md:4-5`: "All of it is gitignored". No `.gitignore`, no git repo.
  - `README.md:40-46`: dev loop produces `PLAN.md`, `api-contract.yaml`, `trace.json`. Nothing produces them.
  - `.claude/agents/orchestrator.md:20-25`: "dev-loop.js is the driver ... runs the human approval gate in the terminal". Absent.
- Evidence: `find . -type f` inventory (29 files) and the quoted lines.
- Impact: agents are briefed against fiction. A frontend agent told to read `frontend/vitest.config.mts` will search, fail, and improvise. This is the mechanism by which a harness lowers code quality rather than raising it. The clonability fork owns the fix list; recorded here because every item is a mechanics claim.
- Recommendation: delete each reference or make it true in the same change. Add a CI step (`rg -n "dev-loop|AGENT_ROLE|AGENT_PERMISSION_MODE"`) that fails on dangling references until the driver exists.
- Effort: M

### [P2] MECH-12 — The joke output style is valid but affects only the main session and forks
- Where: `.claude/output-styles/hooha.md`
- Evidence: output-styles reference: `keep-coding-instructions` is a documented field; "Output styles apply to the main conversation and to a fork ... Other subagents run their own system prompt, so styles don't change how they respond." Also: "On the full system prompt, custom output styles leave out Claude Code's section of built-in software engineering instructions ... unless `keep-coding-instructions` is set to `true`."
- Impact: none at runtime unless selected; it is template noise and would embarrass a clone.
- Recommendation: delete. If a style is wanted, the built-in `Concise` matches the new AGENTS.md tone.
- Effort: S

### [P2] MECH-13 — Agent frontmatter is valid but leaves documented controls unused
- Where: `.claude/agents/*.md`
- Evidence: sub-agents reference lists `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `skills`, `hooks`, `memory`, `isolation`, `effort`; "`model` | `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`"; "Unrecognized fields are ignored without an error"; "if the combined descriptions of non-built-in subagents exceed 15,000 tokens, Claude Code shows a startup warning". Current descriptions: `frontend` "Senior frontend engineer." and `backend` "Senior backend engineer" give Claude nothing to delegate on; `orchestrator` and `qa` are good. Only `security-reviewer` restricts tools; `frontend`/`backend`/`qa` inherit everything, including `Agent`, so an implementer can spawn sub-subagents.
- Impact: weaker auto-delegation, no per-agent cap on turns or tools, and the boundary logic lives only in a central hook that currently cannot identify the agent (MECH-01).
- Recommendation: per agent add `disallowedTools: Agent` for implementers, `maxTurns`, `skills: [writing-tests]` to preload the test rules, and a one-sentence "use when" description. Keep `model:` but reconsider `opus` on implementers against Eitan's "Sonnet for implementers" rule (process fork owns that call).
- Effort: S

### [P2] MECH-14 — Hooks from a cloned settings.json do not run until the folder is trusted, and nothing in the clone path says so
- Where: `.claude/settings.json`, README.md
- Evidence: hooks reference, Workspace trust: "Interactive session: Claude Code holds back hooks from every settings file ... until you accept the workspace trust dialog for the folder"; "`-p` or SDK session: Claude Code never shows the dialog and treats the folder as trusted, so hooks committed in a repository's `.claude/settings.json` run in a folder you've never trusted"; "Frontmatter hooks in a project subagent follow a stricter rule than settings-file hooks."
- Impact: first interactive run of a clone has no guardrails until the dialog is accepted; conversely a headless run executes whatever hooks the clone ships. Both are expected Claude Code behaviour, but a harness whose value is "the hooks win" must say it.
- Recommendation: add to the clone checklist: accept trust, then run the hook self-test (MECH-02 item 4) and confirm a blocked write before starting work.
- Effort: S

### Leads refuted or confirmed without a finding
- `$comment` keys: tolerated (schema `additionalProperties: true`; this session's hooks fired from the file).
- `*` matcher: matches every tool including MCP and Agent (confirmed by docs).
- Hooks under `bypassPermissions`: confirmed they run. Hooks guide: "`PreToolUse` hooks fire before any permission-mode check, in every permission mode, including `dontAsk`", and "a hook that returns `permissionDecision: "deny"` blocks the tool even in `bypassPermissions` mode or with `--dangerously-skip-permissions`." The harness's premise is correct; its implementation is what fails (MECH-01, MECH-02).
- Hooks inside subagents: confirmed, with `agent_id` and `agent_type` on stdin.
- `@` import chain: CLAUDE.md -> AGENTS.md -> rules is 2 hops of a 4-hop limit; "Relative paths resolve relative to the file containing the import", so `@.claude/rules/...` inside the root AGENTS.md is correct. AGENTS.md is read natively since v2.1.277, but a present CLAUDE.md wins and imports it; the docs recommend exactly this on Windows ("use the `@AGENTS.md` import instead" of a symlink).
- `Read(./.env)` deny: covers Read, best-effort Grep/Glob, `cat`/`head`/`sed` in Bash, redirect targets, and Edit/Write on the same path. Does not cover "a command that reads files without naming them, such as `grep -r pattern .`", nor scripts that open files themselves.
- Skills frontmatter: all five valid; longest description is well under the 1,536-character listing limit; `description` is the auto-load signal.
- Path handling in the boundary hook: correct for relative, absolute, mixed separators, drive-letter case, and repo-escaping paths when cwd is the root.

## Top 5 changes (ranked)
1. MECH-01 — read `agent_type` from stdin; the boundary hook goes from inert to working with one line.
2. MECH-02 — fail closed: `exit(2)` on bad input, `onFailure: "block"`, `.mjs` or root `package.json`, plus a hook self-test.
3. MECH-03 — exec form with `${CLAUDE_PROJECT_DIR}` and root resolution from the env var, so hooks are cwd-independent.
4. MECH-05 — ship `.mcp.json` or drop the approvals and make Figma/Linear optional in agent prompts.
5. MECH-04 — remove the `@.claude/rules` imports; rules load natively.

## Keep
- The architecture choice: hooks as the enforcement layer, docs as intent. Confirmed by the docs to hold in every permission mode.
- `.claude/settings.json` as the single wiring point, and the AGENTS.md sentence that an unlisted hook never runs. Correct and worth keeping verbatim.
- CLAUDE.md -> `@AGENTS.md` import pattern. Documented, Windows-safe, and dedup-aware.
- `.claude/rules/` as native always-on rules (path-scopable with `paths:`), and `.claude/skills/` with valid, specific descriptions.
- The secret hook's design decision to inspect only path fields and the command string, not `content`, with the rationale written in the header.
- The boundary hook's path normalisation (`toRepoRelative`), which handled every path shape I threw at it.

## Open questions for Eitan
1. Is a custom driver (`dev-loop.js`) still the goal, or should the harness commit to native subagents? MECH-01's fix supports both; the orchestrator prompt only makes sense with a driver.
2. Node floor: `>=22.12` (LTS with module detection) or keep 20 and rename hooks to `.mjs`? Either is fine; pick one and write it down.
3. Should the MCP integrations (Figma, Linear) be part of the clonable core or an opt-in layer? The answer decides whether `.mcp.json` ships with the template.
4. Is Cursor/Copilot parity a requirement? It decides whether rules live in `.claude/rules/` (Claude-native) or inline in AGENTS.md (portable).

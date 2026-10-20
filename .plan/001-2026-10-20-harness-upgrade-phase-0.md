# Harness upgrade — Phase 0: plug the enforcement layer in

Status: done
Owner: Eitan
Last updated: 2026-10-20 (executed, reviewed and fixed the same day; uncommitted, awaiting Eitan's review)
Approval: Eitan's instruction on 2026-10-20 to start the harness upgrade. The design is
`.orchestrate/audit/SUMMARY.md` (Phase 0 of the roadmap); this plan only sequences it.
Branch: `chore/harness-audit-fixes`

> **For agentic workers:** execute task-by-task with `superpowers:executing-plans`
> (native, this session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the three guardrail hooks real: they receive Claude Code's native role signal,
fail closed, run from any cwd, and are covered by the audit's payload matrix as a test suite.

**Architecture:** hooks become `.mjs` modules sharing one `lib/guardrail.mjs` that owns the
fail-closed contract (read stdin, parse, exit 2 on anything unreadable). `settings.json`
wires them in exec form (`node` + `args`, no shell) with `onFailure: "block"`. A `node --test`
suite in `.claude/hooks/__tests__/` spawns each hook exactly as Claude Code does and asserts
the exit code per payload. Behaviour the audit defers to Phase 1 (pattern coverage, Bash
write channel) is encoded in the matrix as skipped cases with the phase as the reason.

**Tech Stack:** Node 24 (`node:test`, `node:child_process`), Bun 1.4 as script runner, JSON.

**Spec:** `.orchestrate/audit/SUMMARY.md` (untracked local record) §Roadmap "Phase 0", with detail in
`01-mechanics.md` (MECH-01/02/03/12/14) and `02-security.md` (SEC-01/07/11/13/14).

## Goal

After this plan, in a fresh clone on Node 24 and Bun 1.4:

- a `frontend` subagent cannot Edit/Write outside `frontend/` and its two report files, with
  no driver and no env var involved;
- a hook that crashes, times out, or receives garbage blocks the tool call instead of
  letting it through;
- `bun run hooks:test` runs the audit's payload matrix and is green, with every known gap
  listed as a skipped case naming its phase;
- no file in the repo refers to `dev-loop.js`, a root `.env` holding a key, or the demo
  product.

## Scope

In: items #1, #2, #9, #10, #21 and the Phase 0 slices of #6, #11, #14, #17 from the
SUMMARY ranking. Concretely: three hooks, one shared lib, `settings.json` hook block, root
`package.json`, `.gitignore`, the test suite, `hooha.md`, README product line, backlog
residue, the plan-002 note, hook comments, AGENTS.md guardrail paragraph.

Out (later phases): new deny rules, tokenised destructive matcher, secret-name list and
env-dump detection, Bash write channel for roles, MCP approvals, agent model/tool changes,
`dev-loop` skill, reviewer agent, stack/architecture rules, bootstrap.

## Assumptions

- Claude Code ≥ 2.1.295 (for `onFailure`); the audit ran on 2.1.304.
- Hook payloads inside a subagent carry `agent_type` equal to the agent's frontmatter
  `name`; the main conversation carries no `agent_type` or an empty string. Both "absent"
  and "empty" mean "no role" (docs are ambiguous; the hook treats them the same).
- `${CLAUDE_PROJECT_DIR}` is substituted in `args` on Windows (documented for both forms);
  Task 4 verifies it live before the real hooks are wired.
- The main interactive session stays unrestricted by the boundary hook (audit "Keep").
- `.orchestrate/` is git-ignored except its README (Eitan, 2026-10-20); the audit reports and
  `DECISIONS.md` are a local design record, so this plan and its successors restate what they need.

## Open Questions

Each had a recommended answer and the plan proceeded on it. Eitan confirmed all three on
2026-10-20; the decision is recorded under each question.

1. **Unknown `agent_type` with Edit/Write (e.g. `general-purpose`, `code-simplifier`):
   block or allow?** The audit says block (fail closed). Consequence: superpowers-style
   generic implementer subagents cannot write in a project using this harness until a lane
   is registered for them. Recommended: block, with a one-line stderr message naming the
   file to register a lane in. Registering a lane is a one-entry change (`'*'` = unrestricted),
   covered by the test suite.
   **Decided 2026-10-20 (Eitan): keep blocking.** Register a lane per project where a generic
   implementer must write.
2. **Case-insensitive lane matching on Windows?** `FRONTEND/src/x.ts` is the same directory as
   `frontend/src/x.ts` on NTFS but not on Linux. Recommended: fold case only when
   `process.platform === 'win32'`; the matrix carries per-platform expectations for b06/b07.
   **Decided 2026-10-20 (Eitan): keep the Windows-only fold.**
3. **Keep `git push --force-with-lease` blocked for agents?** Today it is blocked by prefix
   accident (SEC-12). Recommended: keep blocking in Phase 0, carry the case as skipped with
   reason "decision 10" so the choice is visible, decide in Phase 1.
   **Decided 2026-10-20 (Eitan): keep blocked, with or without a lease.** Case d14 now pins
   `block` and is no longer skipped; the policy half of audit decision 10 is settled.

## Steps

### Global constraints

- No trailing semicolons; a required leading semicolon goes at the start of the line
  (`.claude/rules/code-style.md`).
- Hooks may import only `node:` builtins and `./lib/guardrail.mjs`. No dependencies.
- Hooks never print the full command to stderr; they print the matched rule name and the
  program (first token) only (SEC-14).
- Every string the hooks and tests need that would trigger the live hooks (`rm -rf`,
  env-file names) lives in files written with the Write tool, never in a Bash command line.
- Exit codes: `0` allow, `2` block. Nothing else is ever returned on purpose.

### Review focus

Inputs the spec implies that the tasks' own tests must pin:

1. `tool_input` is `{}` (parameter-less tool) on the `*` matcher: must allow, or every such
   tool call in every session is blocked. Pinned in Task 2 (`z01`).
2. `agent_type: ""` in the main conversation: must mean "no role", or the interactive session
   is locked out of all writes. Pinned in Task 3 (`m04`).
3. `CLAUDE_PROJECT_DIR` unset (older runtime, manual invocation): must fall back to
   `payload.cwd`, not `process.cwd()` of the hook. Pinned in Task 3 (`m06`).
4. Write to a path on another drive or outside the repo with a role set: must block, with no
   exception thrown by `path.relative`. Pinned in Task 3 (`b15`).
5. `settings.json` references a hook file that does not exist: must fail the test suite
   before it can lock a session. Pinned in Task 4 (`settings.test.mjs`).

---

### Task 1: Shared guardrail contract + test harness skeleton

**Files:**
- Create: `.claude/hooks/lib/guardrail.mjs`
- Create: `.claude/hooks/__tests__/run-hook.mjs` (test helper)
- Create: `.claude/hooks/__tests__/guardrail.test.mjs`
- Create: `package.json` (root)

**Interfaces:**
- Produces `guardrail.mjs` exports:
  - `readPayload(): Promise<object>` — reads all of stdin; exits 2 (with a `[guardrail] …`
    stderr line) on empty input, invalid JSON, non-object, or `tool_input` not an object;
    returns the parsed payload otherwise.
  - `block(message: string): never` — prints `[guardrail] ${message}` to stderr, exits 2.
  - `allow(): never` — exits 0.
  - `projectRoot(payload): string` — `path.resolve(process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd())`.
  - `toProjectRelative(rawPath: string, root: string): { rel: string, escapes: boolean }` —
    `path.resolve(root, rawPath)` then `path.relative(root, abs)` with separators folded to
    `/`; `escapes` is true when `rel` is `''`, `..`, starts with `../`, or is absolute.
  - Module side effect: `process.on('uncaughtException', …)` → stderr line, exit 2.
- Produces `run-hook.mjs` export:
  - `runHook(hookFile: string, payload: string | object, opts?: { env?: Record<string,string>, cwd?: string }): { status: number, stderr: string }` —
    `spawnSync(process.execPath, [abs hook path], { input, cwd, env })`. Default `cwd` is the
    `__tests__` directory (never the repo root, to prove cwd-independence). Default `env` is
    `process.env` minus `AGENT_ROLE`, plus `CLAUDE_PROJECT_DIR = <repo root>`.
  - `REPO_ROOT: string` — `path.resolve(import.meta.dirname, '../../..')`.
  - `HOOKS: { destructive, secret, boundary }` — absolute paths to the three `.mjs` hooks.
- `package.json`: `name` `fullstack-dev-harness`, `version` `0.1.0`, `private` true,
  `type` `module`, `engines` `{ node: ">=24", bun: ">=1.4" }`, `packageManager` `bun@1.4.0`,
  `scripts.hooks:test` = `node --test ".claude/hooks/__tests__/*.test.mjs"`.

- [x] **Step 1: Write the failing tests** in `guardrail.test.mjs`, using a tiny inline
  fixture hook `__tests__/fixtures/echo-hook.mjs` that calls `readPayload()` then `allow()`:
  - `empty stdin → 2`, `"{not json" → 2`, `"[]" → 2`, `{"tool_name":"Bash"} (no tool_input) → 2`,
    `{"tool_input":{}} → 0`, `{"tool_input":{"a":1},"cwd":"x"} → 0`.
  - `toProjectRelative` unit cases (import directly): `('frontend/../backend/x.ts', R)` →
    `{ rel: 'backend/x.ts', escapes: false }`; `('../x', R)` → escapes; `(R, R)` → escapes
    (`rel === ''`); `(path.join(R,'frontend','a.ts'), R)` → `{ rel: 'frontend/a.ts' }`.
  - stderr of a blocked run starts with `[guardrail]`.
- [x] **Step 2: Run** `bun run hooks:test` → expected: FAIL (module not found).
- [x] **Step 3: Implement** `guardrail.mjs` and `run-hook.mjs` per the Interfaces block.
- [x] **Step 4: Run** `bun run hooks:test` → expected: PASS, `fail 0`.

### Task 2: Destructive and secret hooks as fail-closed `.mjs`

**Files:**
- Create: `.claude/hooks/block-destructive-bash.mjs`
- Create: `.claude/hooks/block-secret-file-access.mjs`
- Create: `.claude/hooks/__tests__/cases.json`
- Create: `.claude/hooks/__tests__/matrix.test.mjs`
- (Old `.js` files stay in place and wired until Task 4.)

**Interfaces:**
- `cases.json` shape: `{ "cases": Case[] }` with
  `Case = { name, hook: 'destructive'|'secret'|'boundary', expect: 'block'|'allow'|{ win32?, default }, tool_name?, tool_input?, raw?, agent_type?, env?: Record<string,string>, cwd?, deferred?: string, source?: string }`.
  Placeholders `{{root}}` and `{{home}}` inside any string are replaced at run time with
  `REPO_ROOT` and `os.homedir()` (POSIX separators). `cwd` defaults to `{{root}}`.
- `matrix.test.mjs`: one `test(name)` per case; `deferred` cases call `t.skip(deferred)`;
  `expect` objects pick `process.platform` key or `default`. Asserts
  `runHook(HOOKS[hook], body, { env, cwd }).status === (expect === 'block' ? 2 : 0)`.
- Destructive hook stderr on block: `[guardrail] blocked destructive command: rule "<name>" matched (program: <first token>)`.
- Secret hook stderr on block: `[guardrail] blocked <tool_name> call touching an env/secret file: <path or 'in command'>. Use .env.example instead.`

- [x] **Step 1: Write `cases.json`** by porting the audit manifest (`manifest.json`,
  134 cases, in this session's scratchpad `audit-payloads/security/`) with: `role` → `agent_type`;
  machine paths → placeholders; `pass` → `allow`. Set `deferred` on every case whose
  Phase 0 result differs from its target, using exactly these reasons:
  - destructive bypasses d02–d05, d08–d13, d15–d20, d23, d26, d27, d29, d30, d32–d34,
    d36–d44 and false positives d45–d49 → `"phase-1 #5 tokenised matcher"`; d14 →
    `"decision 10 force-with-lease policy"` (un-deferred 2026-10-20 after the decision: d14 now pins `block`).
  - secret bypasses s04–s06, s08–s15, s23, s25, s30–s34, s36–s38, s49, s50, s53 and false
    positives s39–s41, s47 → `"phase-1 #5 secret name list and env-dump detection"`.
  - boundary b13, b14 → `"phase-1 #6 bash write channel"`.
  Add: `z01` secret hook, `tool_name: "ListAgents"`, `tool_input: {}` → allow;
  `z02` destructive hook, `tool_input: { command: "" }` → allow.
  Mark b06 and b07 `expect: { "win32": "allow", "default": "block" }`.
- [x] **Step 2: Write `matrix.test.mjs`** per the Interfaces block.
- [x] **Step 3: Run** `bun run hooks:test` → expected: FAIL for destructive/secret/boundary
  cases (hook files missing → status null).
- [x] **Step 4: Implement** `block-destructive-bash.mjs`: same six patterns as the `.js`
  version, each as `{ name, re }`; `await readPayload()`; `command` from
  `tool_input.command` if string else `''`; `block(...)` on first hit; `allow()`. Header
  comment: what it guards, that `Bash(...)` deny rules are a separate layer, no mention of
  demos or drivers.
- [x] **Step 5: Implement** `block-secret-file-access.mjs`: same two regexes and
  `PATH_FIELDS`; `await readPayload()`; keep the "path fields and command only, never
  `content`" rationale and the `.env.example` carve-out in the header; drop the
  `LINEAR_API_KEY`, `AGENT_PERMISSION_MODE` and driver claims; state that the `*` matcher is
  deliberate.
- [x] **Step 6: Run** `bun run hooks:test` → expected: destructive and secret cases PASS,
  boundary cases still FAIL (hook missing).

### Task 3: Boundary hook keyed on `agent_type`

**Files:**
- Create: `.claude/hooks/enforce-agent-boundaries.mjs`
- Modify: `.claude/hooks/__tests__/cases.json` (add `m01`–`m08`)

**Interfaces:**
- `WRITE_LANES: Record<string, string[] | '*'>` =
  `frontend: ['frontend/', '.orchestrate/api-contract.yaml', '.orchestrate/frontend-agent-report.md']`,
  `backend: ['backend/', '.orchestrate/backend-agent-report.md']`,
  `qa: ['.orchestrate/qa-report.md', 'frontend/tests/', 'frontend/e2e/', 'tests/']`,
  `orchestrator: ['.plan/']`. A lane ending in `/` is a directory prefix; otherwise an exact
  file. `'*'` means unrestricted (no entry uses it yet).
- `resolveRole(payload): string | null` — first non-empty string of `payload.agent_type`,
  then `process.env.AGENT_ROLE`; else `null`.
- Matching folds case only on `win32`.
- Stderr on block: `[guardrail] "<role>" may not write "<rel>". Allowed: <lanes joined ', '>`;
  unknown role: `[guardrail] agent type "<role>" has no write lane in .claude/hooks/enforce-agent-boundaries.mjs; add one before this agent may Edit/Write`;
  empty path: `[guardrail] write with an empty path blocked`.

- [x] **Step 1: Add cases** `m01`–`m08` to `cases.json` (hook `boundary`):
  - `m01` `agent_type: frontend`, no env, Write `backend/x.ts` → block (MECH-01).
  - `m02` `agent_type: frontend`, `cwd: {{root}}/.claude`, Write `{{root}}/frontend/src/a.ts` → allow (MECH-03).
  - `m03` no `agent_type`, `env: { AGENT_ROLE: frontend }`, Write `backend/x.ts` → block.
  - `m04` `agent_type: ""`, no env, Write `.claude/settings.json` → allow (interactive).
  - `m05` no `agent_type`, no env, Write `backend/x.ts` → allow (interactive).
  - `m06` `agent_type: frontend`, `env: { CLAUDE_PROJECT_DIR: "" }`, `cwd: {{root}}`, Write `frontend/src/a.ts` → allow (fallback to `payload.cwd`; the helper deletes an empty-string env var).
  - `m07` `agent_type: qa`, `env: { AGENT_ROLE: frontend }`, Edit `frontend/src/a.ts` → block (`agent_type` wins).
  - `m08` `agent_type: frontend`, Write with no `file_path` and no `notebook_path` → block.
- [x] **Step 2: Run** `bun run hooks:test` → expected: boundary cases FAIL (missing hook).
- [x] **Step 3: Implement** `enforce-agent-boundaries.mjs` per Interfaces, using
  `toProjectRelative` and `projectRoot` from the lib; inspect `file_path ?? notebook_path`.
  Header comment: how the role arrives (`agent_type` from Claude Code; `AGENT_ROLE` as an
  override for a headless driver), why unknown roles are blocked, why the main session is not.
- [x] **Step 4: Run** `bun run hooks:test` → expected: PASS, `fail 0`, skipped count equals
  the number of `deferred` cases (print it in the summary).

### Task 4: Wire the hooks in exec form, fail-closed, staged

**Files:**
- Create: `.claude/hooks/__tests__/settings.test.mjs`
- Modify: `.claude/settings.json` (hooks block, `$schema`, `$comment2` wording)
- Delete: `.claude/hooks/block-destructive-bash.js`, `block-secret-file-access.js`, `enforce-agent-boundaries.js`

**Interfaces:**
- Each hook entry: `{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/<file>.mjs"], "timeout": 10, "onFailure": "block" }`.
- Matchers: secret `*`; destructive `Bash|PowerShell`; boundary `Edit|Write|MultiEdit|NotebookEdit`.

- [x] **Step 1: Write `settings.test.mjs`**: parses `settings.json`; for every
  `hooks.PreToolUse[].hooks[]` entry asserts `type === 'command'`, `command === 'node'`,
  `args[0]` starts with `${CLAUDE_PROJECT_DIR}/.claude/hooks/` and the file exists,
  `onFailure === 'block'`, `timeout` is a number; asserts every `*.mjs` directly in
  `.claude/hooks/` is referenced by exactly one entry (the AGENTS.md invariant).
- [x] **Step 2: Run** → expected: FAIL (old shell-form entries).
- [x] **Step 3: Live probe of exec form.** Add a temporary entry on matcher `Glob` running
  `__tests__/fixtures/probe.mjs` (writes `argv`, `CLAUDE_PROJECT_DIR`, and the stdin payload
  to this session's scratchpad), call the Glob tool once, confirm the file shows the expanded
  path and payload fields (`cwd`, presence or absence of `agent_type`). Remove the entry and
  the fixture. If the placeholder is not expanded, stop and record it in Risks.
- [x] **Step 4: Switch the `Bash|PowerShell` and `Edit|Write|MultiEdit|NotebookEdit` entries**
  to the `.mjs` exec form in one Write; run one benign Bash command and one benign Edit to
  confirm the session still works.
- [x] **Step 5: Switch the `*` entry** to the secret `.mjs`; run one benign Bash command and
  one Glob to confirm; then confirm one block: Bash `cat .env` must return the
  `[guardrail]` message (nothing is created or deleted either way).
- [x] **Step 6: `git rm` the three `.js` hooks.** Run `bun run hooks:test` → PASS, `fail 0`.

### Task 5: Residue and references

**Files:**
- Delete: `.claude/output-styles/hooha.md`
- Modify: `AGENTS.md` (Guardrails paragraph), `README.md` (product line, focus block),
  `.plan/000-backlog.md`, `.claude/rules/ui-and-styling.md` (plan-002 note),
  `.gitignore`, `.orchestrate/README.md` (one sentence: only this README is tracked).

- [x] **Step 1: Write the check** as a shell one-liner recorded in Validation (V06): no file
  under the repo (excluding `.git`, `.orchestrate/audit`, this plan) contains
  `dev-loop`, `AGENT_PERMISSION_MODE`, `hooha`, `social app`, or `profile page`.
- [x] **Step 2: Run it** → expected: hits in AGENTS.md, settings.json, README.md, backlog,
  orchestrator.md.
- [x] **Step 3: Apply edits.** AGENTS.md: replace the `dev-loop.js` bullet with "Claude Code
  sends the sub-agent's `name` as `agent_type` in every hook payload; `enforce-agent-boundaries.mjs`
  keys its write lanes on it (`AGENT_ROLE` is an env override for a headless driver). Run
  `bun run hooks:test` after changing a hook." README: neutral one-liner for the product,
  focus block points at `.doc/product-definition.md`. Backlog: empty queue with one commented
  example line, empty DONE. `ui-and-styling.md`: drop the blockquote. `.gitignore`: add
  `.orchestrate/*`, `!.orchestrate/README.md` (the `audit/` exception was dropped the same day,
  see the correction under Validation). `orchestrator.md`:
  leave for Phase 2 (its whole "who drives the loop" section is rewritten there); note it in
  the plan's Risks as the one remaining `dev-loop.js` reference.
- [x] **Step 4: Re-run the check** → expected: only `orchestrator.md` remains (documented).
- [x] **Step 5:** `git status` shows no `.orchestrate/` path other than `README.md` as tracked
  or untracked-visible.

### Task 6: Verification and review

- [x] `bun run hooks:test` → `fail 0`; record pass/skip counts in Validation.
- [x] `node --check` on every `.mjs` under `.claude/hooks/` (excluding tests) → clean.
- [x] `git diff --stat` reviewed against Scope; nothing outside it.
- [x] Whole-branch review by a fresh reviewer (Opus) with Eitan's six priorities; fix
  blocking findings; record advisory ones in Risks.
- [x] Update this plan's `Status` to `done` only after the review; do not commit (approval
  gate is Eitan's).

## Validation

- V01 — Matrix green — proof: `bun run hooks:test` ends with `fail 0`.
- V02 — Boundary hook reads `agent_type` — proof: case `m01` passes (block with no env var).
- V03 — Fail closed — proof: cases `x01`–`x05` and the `guardrail.test.mjs` stdin cases pass.
- V04 — cwd-independent — proof: all hook runs in the suite use `cwd = __tests__`; case `m02`
  passes with `payload.cwd` in a subdirectory.
- V05 — Wiring invariant — proof: `settings.test.mjs` passes (exec form, `onFailure: block`,
  every hook file wired, every wired file exists).
- V06 — Residue gone — proof: the Task 5 search returns only `.claude/agents/orchestrator.md`.
- V07 — Live block — proof: Task 4 Step 5 transcript shows a `[guardrail]` message for
  `cat .env` from the live session.
- V08 — Node floor honest — proof: `package.json` has `engines.node >=24`; no `.js` hook remains.
- V09 — Role signal arrives in a real subagent — proof: a `frontend` subagent's Write to
  `backend/probe.md` is refused with the lane message; its in-lane write succeeds.

Evidence recorded 2026-10-20, after the whole-branch review and its fix pass:
`bun run hooks:test` → 186 tests, 118 pass, 0 fail, 68 skipped (deferred with reasons; re-run 2026-10-20 after the shebang convention test and the d14 decision);
V07 and V09 observed live in this session; review verdict "with fixes": 1 Critical
(path canonicalisation: trimmed, `~` and `/drive/` spellings and cwd-relative resolution)
and 4 Important findings fixed with tests, 7 Minor deferred. Rulings and deferred items are
in `.superpowers/sdd/001-2026-10-20-harness-upgrade-phase-0/progress.md` (git-ignored).
Correction 2026-10-20: the `!.orchestrate/audit/` exception named in Task 6 was missing from the
written `.gitignore` (the five reports stayed tracked only because they predate the rule). It was
added, then superseded the same day: Eitan decided that everything under `.orchestrate/` except
its README is ignored. The six tracked audit files were removed from the index (kept on disk),
so the audit reports and `DECISIONS.md` are a local, untracked design record.

## Risks

- **Session lock-out during the switch.** With `onFailure: "block"` on a `*` matcher, a broken
  secret hook blocks every tool including Edit, so it cannot be repaired from inside the
  session. Mitigation: hooks are fully tested before wiring; the probe verifies exec form and
  placeholder expansion; the `*` entry is switched last and verified immediately. Recovery if
  it happens: edit `.claude/settings.json` by hand in an editor.
- **Unknown-role blocking surprises generic subagents** (Open Question 1). Mitigation: stderr
  message names the file and the fix; one-line registration.
- **Deferred cases hide debt.** 70+ matrix cases are skipped with a phase reason.
  Mitigation: the skip count is printed by the runner; Phase 1 removes the `deferred` fields.
- **`orchestrator.md` still describes `dev-loop.js`.** Accepted until Phase 2 rewrites that
  file; listed here so it is not forgotten.
- **Exec form resolution of `node`.** If `node` is a `.cmd` shim on a machine (some version
  managers), exec form fails and `onFailure: block` blocks tool calls. Mitigation: README
  "Prerequisites and guardrails" section (added after review) names the requirement and the
  recovery; the probe confirmed resolution on this machine.
- **Path spellings the runtime rewrites.** Claude Code trims, expands `~`, converts `/c/`
  and resolves relative paths against the session cwd. The hook refuses non-canonical
  spellings and resolves against `payload.cwd` rather than copying that logic; if the runtime
  adds a new rewrite, the hook fails closed only for spellings it refuses, so new rewrites
  must be added to `isCanonicalPath`. Pinned by matrix cases c01–c07.
- **Deferred review minors (7).** Listed in the ledger; none affects the Phase 0 goal. M9
  (lane switching between `AGENT_ROLE` and `agent_type`) and M10 (`'*'` lanes must exclude
  `.claude/` and `.git/`) belong with Phase 1's deny rules.

## Rollout Order

Tasks 1 → 2 → 3 (tests and hooks, nothing live changes) → 4 (live switch, staged inside the
task) → 5 (docs) → 6 (verify, review). The branch is not merged or committed by this plan.

## Rollback

`git checkout -- .claude/settings.json` restores the old wiring instantly (settings reload
live); the `.js` hooks are restored by `git checkout -- .claude/hooks/`. Nothing in this plan
touches generated state, databases, or remote branches.

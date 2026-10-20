# Process audit — fullstack-dev-harness
Date: 2026-10-20 · Reviewer: process fork · Model: Fable 5.1

## Method

Read (inherited from the parent session, all 29 files): `AGENTS.md`, `README.md`,
`.claude/settings.json`, the three hooks, the five agent definitions, the five skills, the
four rules, `.doc/*`, `.plan/000-backlog.md`, `.orchestrate/README.md`.

Executed:
- `claude --version` → `2.1.304` (so `onFailure: "block"` on hooks, v2.1.295+, is available).
- Hook probes from the parent session: `enforce-agent-boundaries.js` exits 0 whenever
  `AGENT_ROLE` is unset (any payload); exits 2 correctly for out-of-lane writes when the
  env var is set.

Docs consulted (all fetched 2026-10-20):
- Subagents — frontmatter fields, `hooks` in frontmatter, `permissionMode` inheritance,
  `isolation: worktree`, `skills` preload, delegation by `description`:
  https://code.claude.com/docs/en/sub-agents
- Hooks — common input fields incl. `agent_id` / `agent_type`, `SubagentStart` /
  `SubagentStop` inputs and `decision: block`, exit-code semantics, `onFailure`:
  https://code.claude.com/docs/en/hooks
- Headless / `claude -p` — `--output-format json` with `total_cost_usd`, `--json-schema`,
  `--max-budget-usd`, `--bare`, trust behavior of `-p`:
  https://code.claude.com/docs/en/headless
- CLI flags — `--agent`, `--agents`, `--max-turns`, `--worktree`, `--disallowedTools`:
  https://code.claude.com/docs/en/cli-reference

## Score: 3/10

The role model is sound on paper: one plan, disjoint write lanes, mandatory tests, a
report per stage, a human gate before execution. But the process cannot run as written.
The driver that sequences the stages, sets the only signal the boundary hook understands,
runs the approval gate, and creates tickets does not exist, and nothing in the repo says
how to run the loop without it. Even if the driver existed, the loop has no failure path
(a QA FAIL terminates with a report and no owner), no review stage, a hard dependency on
Linear, magic-string handoffs no tool can validate, and three separate owners for the
same write-path constraints that already disagree with each other. The good news: Claude
Code now provides, natively, almost everything `dev-loop.js` was for — subagent identity
in hook payloads, per-agent hooks, `SubagentStop` validation, per-invocation models — so
the replacement is mostly deletion plus a short skill, not a rebuild.

## Scorecard

| Sub-dimension | 0-10 | Why (one line) |
|---|---|---|
| Runnable as documented | 1 | Every stage transition and the boundary signal live in a file that does not exist |
| Stage completeness | 4 | Plan → FE → BE → QA is right; no review stage, no docs owner, `security-reviewer` orphaned |
| Handoff artifacts | 4 | Plan + OpenAPI contract are good ideas; reports are prose with magic strings, not verifiable |
| Gates and failure handling | 2 | One human gate (plan); QA FAIL has no owner, no retry bound, no escalation |
| Constraint ownership | 3 | Prose, hook allowlist, and frontmatter all claim write paths; they already disagree |
| Model and cost fit | 3 | Everything on `opus` against Eitan's stated rule; no budget or trace capture |
| Portability of the loop | 2 | Linear is mandatory (Job B), Figma optional, driver missing, no CI story |
| Auto-delegation quality | 4 | `orchestrator`/`qa` descriptions are usable; `frontend`/`backend` are one line |

## Findings (most severe first)

### [P0] PROC-01 — The loop driver does not exist, and the process is defined only in terms of it
- Where: `AGENTS.md:18-19`, `.claude/agents/orchestrator.md:19-25`, `README.md:40-46`,
  `.claude/hooks/enforce-agent-boundaries.js:5-8`, `.claude/hooks/block-secret-file-access.js:12-15`,
  `.claude/settings.json:3`
- Evidence: `orchestrator.md:20-22` — "`dev-loop.js` is the driver. It picks the task,
  creates the git branch, calls you for the plan, runs the human approval gate in the
  terminal, calls you again for tickets, then launches the frontend / backend / qa agents
  and moves the Linear tickets itself." `README.md:40` — "Execute the dev loop in your
  local environment." No file in the repo tree matches `dev-loop*`; no `package.json`
  script, no skill, no command documents an alternative. The user confirmed it is missing,
  not external.
- Impact: on a fresh clone there is no way to run a task through the stages. Each agent
  file tells the agent what "the loop" will give it (ticket id, plan path, branch) and
  nothing provides those inputs. The orchestrator is told "do not launch sub-agents"
  (`orchestrator.md:24`), so even an interactive session that invokes it stops after the
  plan.
- Recommendation: do not rebuild the driver. Replace it with a `dev-loop` skill (one
  file, `.claude/skills/dev-loop/SKILL.md`) that the interactive session follows: pick
  task → branch → orchestrator subagent writes plan → human flips `Status: active` →
  implementers → reviewer → QA → human gate. Every reference to `dev-loop.js`,
  `AGENT_ROLE`, `TICKETS_JSON`, "the terminal owns the gate" gets rewritten against that
  skill. Full design in *Target loop v1*.
- Effort: M

### [P0] PROC-02 — The boundary hook has no role signal in any run that is not the missing driver
- Where: `.claude/hooks/enforce-agent-boundaries.js:30-34`
- Evidence: `const role = process.env.AGENT_ROLE … if (!allowedPrefixes) { process.exit(0) }`.
  Verified in the parent session: with `AGENT_ROLE` unset the hook exits 0 for a write to
  `backend/x.ts` from any role; with it set the same payload exits 2. The Agent tool has
  no parameter for environment variables, so a subagent spawned natively never has it.
  Claude Code supplies the signal another way: hook input includes `agent_type` — "Agent
  name (for example, "Explore" or "security-reviewer"). Present when the session uses
  `--agent` or the hook fires inside a subagent" (https://code.claude.com/docs/en/hooks#common-input-fields).
  Subagents can also carry their own `hooks:` block in frontmatter, which "Claude Code
  runs only while that subagent is running" (https://code.claude.com/docs/en/sub-agents, *Supported frontmatter fields*).
- Impact: the one hard guardrail that makes the role split real is silently off for
  every subagent the harness can actually spawn today. QA can edit `frontend/src/`,
  frontend can write `backend/`, and the agent files promise the opposite
  (`frontend.md:16-17`, `qa.md:15-16`).
- Recommendation: key the hook on `payload.agent_type`, with `process.env.AGENT_ROLE` as
  a fallback for a future `claude -p --agent <role>` wrapper (which also sets
  `agent_type`, per the same doc line). Keep the single table in the hook:
  ```js
  const role = payload?.agent_type ?? process.env.AGENT_ROLE
  ```
  Fail closed when the role is known but the path is missing. Keep the "no role → no
  restriction" branch only for the interactive main session and say so in the message.
- Effort: S

### [P1] PROC-03 — A QA failure has no owner, no retry bound, and no escalation
- Where: `.claude/agents/qa.md:92-98`, `.claude/agents/frontend.md:35-96`,
  `.claude/agents/orchestrator.md:24`
- Evidence: `qa.md:97-98` — "Report `STATUS: DONE` when your verification is complete,
  and state clearly in the report whether the feature passed or failed — a failing
  feature still needs a finished report." Nothing in `frontend.md` or `backend.md`
  describes receiving QA findings; their workflows start at "Read inputs" and end at
  "Report". `orchestrator.md:24` forbids polling for status. There is no "max rounds",
  no "who decides to stop", and no stage after QA.
- Impact: the most common real outcome of a task (first pass has defects) ends with a
  report in `.orchestrate/` and a feature branch that is red. The human has to notice,
  re-prompt the implementer by hand, and re-run QA by hand — on every task.
- Recommendation: define the loop-back explicitly in the `dev-loop` skill:
  QA verdict `FAIL` → re-invoke the owning implementer with the QA findings file as
  input and the instruction "fix the code, not the test" → re-run QA. Bound it:
  2 rounds, then stop and hand the two reports to the human. Make the verdict a field
  (`"verdict": "pass" | "fail"`) in a JSON report (PROC-04) so the loop branches on data,
  not on reading prose.
- Effort: M

### [P1] PROC-04 — Handoffs are prose and magic strings; nothing can validate them
- Where: `.claude/agents/frontend.md:80-96`, `backend.md:59-73`, `qa.md:70-90`,
  `orchestrator.md:66-70`
- Evidence: `orchestrator.md:69-70` — "output exactly the requested `TICKETS_JSON` block
  and nothing else around it. `dev-loop.js` parses that block; extra prose breaks it."
  `frontend.md:96` — "End your final response with the exact line `STATUS: DONE`."
  `qa.md:82-84` lists acceptance criteria as free text ("- <criterion> — PASS/FAIL —
  <evidence>") with no criterion ids, while `product-definition.md:22` already assigns
  ids (`AC01`). The FE report (`frontend.md:83-94`) never lists which ACs the
  implementation claims to satisfy, so QA cannot diff claims against results.
- Impact: a missing line, a reworded header, or a report written to the wrong path
  breaks the next stage silently. Claims are not checkable, so "it passed" is whatever
  the agent typed.
- Recommendation: one JSON report per stage with a schema committed to
  `.orchestrate/schema/report.schema.json` (fields: `stage`, `task`, `files_changed`,
  `tests: {unit:{passed,failed}, e2e:{…}}`, `ac_claimed: ["AC01"]`, `verdict`,
  `findings: [{file,line,expected,actual}]`, `handoff: []`). Validate it in a
  `SubagentStop` hook: the docs state "Returning `decision: "block"` with a `reason`
  keeps the subagent running and delivers `reason` to the subagent as its next
  instruction" (https://code.claude.com/docs/en/hooks#subagentstop), so an invalid or
  missing report sends the agent back to fix it instead of ending the stage. Keep a
  short markdown rendering only for humans. Drop `STATUS: DONE` and `TICKETS_JSON`.
- Effort: M

### [P1] PROC-05 — No review stage; `security-reviewer` is orphaned; `.doc/` upkeep has no owner
- Where: `.claude/agents/security-reviewer.md:1-13`, `AGENTS.md:57`,
  `frontend.md:102`, `qa.md:22`, `README.md:17`
- Evidence: `README.md:17` — "Delivery model: Orchestrator -> Frontend/Backend (when
  needed) -> QA". `security-reviewer.md` is 13 lines: no workflow, no report path, no
  allowed paths, and no file in the repo mentions invoking it. `AGENTS.md:57` — "Keep
  these docs updated when API routes, auth/org boundaries, or schema/migrations change",
  but `frontend.md:102` forbids touching `.doc/` and `qa.md:22` forbids `.doc/**`; the
  hook allowlists (`enforce-agent-boundaries.js:20-25`) contain no `.doc/` entry for any
  role.
- Impact: the only stage that looks at the diff with a critical eye is QA, whose brief
  is behavior, not design, security, or simplicity. Code that passes tests but is
  over-complex, insecure, or off-convention ships. Architecture and glossary docs rot
  from the first task.
- Recommendation: add one `reviewer` stage between implement and QA. Fold the current
  `security-reviewer` into it (Eitan's own review priority order: security, scalability,
  maintainability, error handling, complexity, ops) and give it a JSON report with
  `blocking: []` and `advisory: []`. Blocking → back to implementer (same bound as
  PROC-03). Cost: one extra Opus run per task, which is cheaper than the human doing the
  same pass. Assign `.doc/` updates to the implementer (add `.doc/` to its allowlist)
  and make QA verify them against the plan's `Validation` section.
- Effort: M

### [P1] PROC-06 — Every agent runs on `opus`, against the stated model policy, with no budget or trace
- Where: `orchestrator.md:4`, `frontend.md:4`, `backend.md:4`, `qa.md:4`,
  `security-reviewer.md:5`, `README.md:45` (`trace.json`)
- Evidence: all five frontmatter blocks say `model: opus`. Eitan's global rule: Sonnet
  for implementation grunt work, Opus for final review and architecture. `README.md:45`
  promises a `trace.json`; nothing produces one. The docs confirm `model` accepts
  `sonnet`, `opus`, `haiku`, `fable`, a full id, or `inherit`, and that the
  per-invocation parameter wins over frontmatter (https://code.claude.com/docs/en/sub-agents).
- Impact: four Opus runs per task where two would do; no way to see what a task cost.
- Recommendation and the risk each carries:

  | Stage | Model | Risk of the downgrade |
  |---|---|---|
  | orchestrator (plan) | opus | none — this is the architecture step |
  | frontend / backend | sonnet | more convention slips; caught by the reviewer stage |
  | reviewer | opus | none — this is the final review step |
  | qa | sonnet | weaker adversarial tests; acceptable because the reviewer already looked at design |

  Trace: a `SubagentStop` hook in `settings.json` appends `{ts, agent_type, agent_id,
  agent_transcript_path}` to `.orchestrate/trace.jsonl` (all fields are in the
  documented `SubagentStop` input). Cost: in-session `/cost`; for a future `-p`
  wrapper, `--output-format json` carries `total_cost_usd` and `--max-budget-usd` caps
  the run.
- Effort: S

### [P1] PROC-07 — Write-path constraints have three owners that already disagree
- Where: `.claude/hooks/enforce-agent-boundaries.js:20-25`, `frontend.md:29-33,66-68,102`,
  `backend.md:24-28`, `qa.md:18-22`, `orchestrator.md:14`, `security-reviewer.md:4`
- Evidence, every mismatch:
  1. `frontend.md:68` puts e2e tests at `frontend/tests/e2e/`; `qa.md:20` allows
     `frontend/e2e/**`; the hook (line 24) allows both `frontend/tests/` and
     `frontend/e2e/`. Two agents can put the same suite in two places.
  2. `frontend.md:102` — "Do not touch `backend/`, `.doc/`, `.claude/`, or `.plan/`" —
     while the hook (line 21) allows exactly `frontend/` plus two `.orchestrate/` files.
     The prose lists forbidden paths; the hook is an allowlist. They happen to agree
     today, but one is redundant and will drift.
  3. `orchestrator.md:14` — "You do NOT write application code" — has no enforcement:
     the hook comment (lines 14-15) exempts runs with no role on purpose, and the
     frontmatter declares no `tools`/`disallowedTools`. With `agent_type` available
     (PROC-02) this exemption no longer needs to exist for the orchestrator.
  4. `security-reviewer.md:4` — `tools: Read, Grep, Glob, Bash` — reads as read-only,
     but `Bash` can write anything. The intent needs `disallowedTools: Edit, Write` plus
     a hook row, or no Bash.
  5. `backend.md:27` lets backend read `frontend/src/types/**`; `backend.md:28` forbids
     `frontend/**` "except reading types". Reads cannot be enforced by an `Edit|Write`
     matcher (`settings.json:38`), so this is prose-only and nobody will notice a
     violation. See PROC-08 for why the direction is also wrong.
  6. `qa.md:20` allows a root `tests/**` that no stack in the repo uses; the hook
     mirrors it (line 24). Dead lane.
- Impact: when the lanes drift, the agent believes the prose and the hook blocks it (or
  the reverse), and the agent wastes turns "working around" a rule it was told is a
  rule. AGENTS.md promises a single source of truth and the repo does not have one.
- Recommendation: one owner per constraint type. Write paths → the hook table only;
  agent files say "your write lane is enforced by `enforce-agent-boundaries.js`, see the
  table there" and nothing more. Tool availability → frontmatter `tools` /
  `disallowedTools` only (orchestrator and reviewer: `disallowedTools: [Edit, Write,
  NotebookEdit]`; reviewer keeps `Bash` for running tests, which the hook already
  cannot stop from writing, so also add `Bash(git commit *)` etc. to `permissions.deny`
  — the security fork owns that list). Behavioral rules → prose. Delete items 1, 2, 6.
- Effort: S

### [P1] PROC-08 — Frontend-first contract serializes full-stack work and points type flow the wrong way
- Where: `frontend.md:50-56`, `backend.md:32-34`, `backend.md:27`, `orchestrator.md:55-58`
- Evidence: `frontend.md:51-52` — "Update `.orchestrate/api-contract.yaml` with the shape
  the future backend must implement for what you built." `backend.md:33-34` — "That is
  your spec — implement all of it and nothing beyond it." `backend.md:27` — backend reads
  `frontend/src/types/**`. The plan skill (`writing-plans/SKILL.md:42-44`) forbids
  planning server work unless `stack:full`, but says nothing about where the contract
  comes from when it is.
- Impact: for the default frontend-only task this is fine and pragmatic — the contract
  is a handoff note. For `stack:full` it forces FE → BE sequencing (two Opus runs in
  series), lets UI convenience shape the API, and makes the backend depend on
  hand-written FE types instead of the contract being the source of truth — the contract
  and the types drift on the second task.
- Recommendation: keep frontend-first for frontend-only tasks. For `stack:full`, the
  plan carries the contract (orchestrator writes `api-contract.yaml` as part of Job A;
  it is the architecture step anyway), FE and BE both implement from it, and FE types
  are generated from the contract (`openapi-typescript`) rather than read by BE. Their
  write lanes are disjoint and hook-enforced, so they can run as two background
  subagents in the same tree; defer `isolation: worktree` until a merge conflict
  actually shows up (explicit over magic).
- Effort: M

### [P1] PROC-09 — Linear is a hard dependency of every task; the template cannot run without it
- Where: `orchestrator.md:61-70`, `.claude/settings.json:3-4`, `.plan/000-backlog.md:3-7`
- Evidence: `orchestrator.md:61-62` — "## Job B — Create tickets. You are given the team
  id, the task, and the approved plan." No conditional; the loop description
  (`orchestrator.md:21-22`) moves tickets "itself". The backlog format
  (`000-backlog.md:4-7`) has a `figma:` marker and a `stack:` marker but no tracker
  marker. `settings.json:4` pre-trusts `linear` from an `.mcp.json` that does not exist.
- Impact: a clone without Linear (most new projects on day zero) has no defined path
  through the loop; the orchestrator either hallucinates a team id or stalls.
- Recommendation: tracker is opt-in per repo, declared once at the top of
  `000-backlog.md` (`tracker: none | linear`). With `none`, Job B is skipped and the
  plan file is the ticket. Figma already degrades correctly via the `figma:` marker;
  keep that pattern. Remove `linear`/`figma` from `enabledMcpjsonServers` until the
  clone adds an `.mcp.json` (the clonability fork owns the file list).
- Effort: S

### [P2] PROC-10 — Approval gate mechanics are undefined without the driver
- Where: `writing-plans/SKILL.md:30-31`, `orchestrator.md:54,73`
- Evidence: "Only the human approval gate flips a plan to `active`" and "Never skip or
  simulate the human approval gate — the terminal owns it". The terminal was
  `dev-loop.js`.
- Impact: in a native session nothing says who edits `Status:`; an agent may do it.
- Recommendation: the human edits `Status: active` by hand (explicit, auditable, no
  tool needed), and the `dev-loop` skill refuses to start implementers while the plan is
  `draft`. A `PreToolUse` hook on `Edit|Write` can deny any agent write that changes a
  `Status:` line in `.plan/` — small and cheap. The second gate (commit/merge) already
  exists in `.claude/rules/git-workflow.md:4-6`; the skill should cite it as stage 7.
- Effort: S

### [P2] PROC-11 — `frontend` and `backend` descriptions give auto-delegation nothing to match
- Where: `frontend.md:3`, `backend.md:3`
- Evidence: `description: Senior frontend engineer.` / `description: Senior backend engineer`.
  Docs: "Claude uses each subagent's description to decide when to delegate tasks…
  write a clear description so Claude knows when to use it" (https://code.claude.com/docs/en/sub-agents).
  `orchestrator.md:3` and `qa.md:3` are good examples already in the repo.
- Impact: in a native loop the main session picks subagents by description; these two
  will be picked late or not at all, or `general-purpose` will be picked instead and
  bypass the role model.
- Recommendation:
  - frontend: "Implements one approved plan in `frontend/` (Next.js app, mock data
    layer), writes unit + e2e tests, records the API contract, writes the frontend
    report. Use after a plan is `active`. Never for planning, review, or backend work."
  - backend: "Implements the API contract in `backend/` for a task marked `stack:full`,
    with route tests. Use after the plan is `active` and the contract exists. Never for
    frontend files."
- Effort: S

### [P2] PROC-12 — Tests are written after the implementation, so the loop cannot catch "tests shaped to pass"
- Where: `frontend.md:45-69` (Step 2 Implement, Step 4 Tests)
- Evidence: workflow order is Implement → Contract → Tests → Run. `writing-tests` does
  not require test-first either.
- Impact: tests written after the code tend to assert what the code does, not what the
  plan asked; QA's adversarial pass is the only correction and it runs on Sonnet (after
  PROC-06).
- Recommendation: reorder to Plan `Validation` → failing tests → implement → green;
  the clean-code fork owns the rule text.
- Effort: S

## Top 5 changes (ranked)

1. **PROC-02** — key the boundary hook on `agent_type`. Five lines; turns the role model
   from a promise into a guardrail in every native run.
2. **PROC-01** — replace `dev-loop.js` with a `dev-loop` skill and rewrite every reference.
   Without this the harness has no runnable process at all.
3. **PROC-04 + PROC-03** — JSON stage reports validated by a `SubagentStop` hook, with a
   `verdict` the loop branches on and a bounded fix loop. This is what makes "QA failed"
   an event instead of a sentence.
4. **PROC-05 + PROC-06** — add the reviewer stage (Opus) and drop implementers and QA to
   Sonnet. Net cost roughly flat, quality gate materially stronger.
5. **PROC-09 + PROC-07** — make the tracker optional and give each constraint one owner.
   Both are small and both bite on day zero of a clone.

## Keep

- The four-role split (plan / implement / verify) with disjoint write lanes and a
  hard-blocking hook rather than prose. Keep the hook as the single enforcement layer.
- One plan file per task with a required `Validation` section that QA treats as its
  checklist (`writing-plans/SKILL.md:45-46`, `qa.md:32`). This is the right contract.
- "Fix the code, not the test" stated in every implementer file.
- The report-per-stage idea and the `.orchestrate/` boundary between generated and
  hand-written files.
- The `figma:<url>` / `stack:full` backlog markers — the right shape for optional
  integrations; extend, do not replace.
- The orchestrator's rule that plan questions go in the plan file with a recommended
  answer, not in chat.

## Open questions for Eitan

1. Do you want the reviewer stage to be one agent (security + code quality in Eitan's
   priority order) or two (`security-reviewer` kept separate)? One is cheaper and keeps
   findings in one report; two makes the security pass harder to skip.
2. For `stack:full` tasks, are you comfortable with FE and BE running as parallel
   background subagents in the same working tree (lanes are disjoint and hook-enforced),
   or do you want them strictly sequential until the loop has run a few times?
3. Should the human approval gate be "edit `Status: active` by hand" (explicit, no
   chat) or an `AskUserQuestion` in-session prompt (faster, but the agent then edits the
   plan file)? The report assumes by hand.
4. Is a CI wrapper (`claude -p --agent <role>`) in scope for v1, or only the interactive
   loop? The design below keeps both working off the same hook and agent files, but the
   wrapper needs an API key or `claude setup-token` and a `--bare`/trust decision.

## Target loop v1

### Three ways to run the loop without `dev-loop.js`

| | (a) Native: interactive session orchestrates via the Agent tool | (b) Thin driver: `bun run loop` shelling to `claude -p --agent <role>` | (c) Workflow tool / plugin |
|---|---|---|---|
| Role signal for the hook | `agent_type` in every hook payload inside a subagent (docs) | `--agent <role>` also sets `agent_type` (docs); env var `AGENT_ROLE` as belt-and-braces | Plugin subagents **ignore frontmatter `hooks` and `permissionMode`** (docs) — the role model weakens |
| Gates | Human edits `Status: active`; git-workflow rule gates commit/merge | Script pauses for a keypress; same file edit | Workflow must be opted into per run; gate is script logic |
| Failure handling | Skill text: bounded fix loop on `verdict: fail` | Code: `for round in 1..2` — enforced, not followed | Code |
| Cost / trace | `/cost`; `SubagentStop` hook → `trace.jsonl` | `--output-format json` → `total_cost_usd` per stage; `--max-budget-usd` hard cap | Workflow result |
| Shared context | Parent holds plan + reports across stages | Each `-p` is a cold start; everything passes through files (which the harness already does) | Agents cold-start |
| Maintenance | One skill file | One script (this is what was lost once already) | New, moving surface |
| Trust / safety | Interactive trust dialog applies | `-p` runs project hooks and `.mcp.json` **without** the trust dialog (docs, headless page) | — |
| Fit with "explicit over magic" | High: every step visible in the transcript | Highest for sequencing; lowest for debugging a cold agent | Low |

**Recommendation: (a) now; (b) later as a CI wrapper over the same agent files and the
same hook, once the loop has stabilized.** Main tradeoff of (a): the stage sequence and
the retry bound are followed by the model from skill text, not enforced by code. The
mitigations are the `SubagentStop` report validator (enforced) and the human gates
(explicit). Option (c) is ruled out for v1 because plugin-packaged subagents drop the two
frontmatter features the role model depends on.

### Stages, artifacts, gates, models

```
 0  human    pick task in .plan/000-backlog.md            tracker: none|linear  figma:<url>?  stack:full?
 1  session  git switch -c feat/<topic>                    (git-workflow rule)
 2  orchestrator [opus, no Edit/Write outside .plan/]      → .plan/NNN-date-topic.md  Status: draft
                                                            → .orchestrate/api-contract.yaml (stack:full only)
 G1 human    edit Status: active  (skill refuses to continue on draft)
 3  frontend [sonnet] ‖ backend [sonnet, stack:full]        → .orchestrate/report/frontend.json | backend.json
             SubagentStop validator blocks until report matches schema
 4  reviewer [opus, no Edit/Write]                          → .orchestrate/report/review.json  {blocking, advisory}
             blocking ≠ []  → back to 3 (max 2 rounds) → else G3
 5  qa [sonnet, writes tests + report only]                 → .orchestrate/report/qa.json  {verdict, ac: [{id, result, evidence}]}
             verdict: fail → back to 3 with findings (max 2 rounds) → else G3
 6  implementer updates .doc/ sections named in the plan; qa verifies in step 5 (second pass only)
 G2 human    read review.json + qa.json + diff → approve commit (git-workflow rule)
 G3 human    escalation: two failed rounds → stop, both reports on the table
 ∗  SubagentStop hook appends {ts, agent_type, agent_id, agent_transcript_path} → .orchestrate/trace.jsonl
```

Permission note: the docs say a subagent inherits the main conversation's permission
mode and ignores its own `permissionMode` when the parent is in `bypassPermissions`,
`acceptEdits`, or auto mode. So the parent's mode is the loop's mode; the hook, not the
permission mode, is what keeps lanes disjoint. That is the right place for it.

### What to change first, what can wait

Now (one short branch, all S/M):
1. Hook reads `agent_type` (PROC-02).
2. `dev-loop` skill replaces every `dev-loop.js` reference (PROC-01, PROC-10).
3. JSON report schema + `SubagentStop` validator + bounded fix loop (PROC-04, PROC-03).
4. Reviewer agent (merge `security-reviewer` into it), models per stage (PROC-05, PROC-06).
5. `tracker:` marker; delete the dead and duplicate lanes (PROC-09, PROC-07).

Later (after three or four real tasks have run):
- Contract-in-plan and parallel FE/BE for `stack:full` (PROC-08).
- `trace.jsonl` → cost table; `-p` CI wrapper with `--max-budget-usd`.
- `isolation: worktree` for implementers only if same-tree parallelism causes a conflict.
- Test-first ordering in the implementer workflow (PROC-12, with the clean-code fork).

# Instruction-file guidance: a standard, a gate and a review

Status: active
Owner: Eitan
Last updated: 2026-11-17
Input: Eitan's request of 2026-11-17: a guidance file for LLM-facing Markdown, a hook that shows
it before the first edit of such a file, and a review of the harness's files against it.
Branch: feat/instruction-guidance (cut from `dev` ef5afc1; PR into `dev`)
Base: ef5afc1
Stages: harness hooks, scripts and docs. No role agent runs. Lean process (2026-11-11): Sonnet
implementers, cheap gates per task, one review of the branch at the end.

## Goal

Whoever creates or edits a Markdown file an agent loads has the rules for it in context first,
in every project and not only in this repository. Three deliverables:

1. `.claude/instruction-files.md`: the rules, 40 lines, each with a source or, for two, Eitan's
   ruling (Appendix B).
2. A PreToolUse hook that refuses the first Edit or Write of such a file in a session, with that
   text as the refusal, and lets the retry through (Appendix C).
3. The review of the 32 in-scope files against the draft: done now, recorded in Appendix D as
   scores and a ranked fix list. Nothing in it is applied yet (question 3).

## Scope

**In:**

- `.claude/instruction-files.md` (new, `harness` group); `CONTRIBUTING.md`'s "Changing the
  instruction files" section becomes a one-line pointer.
- `.claude/hooks/lib/instruction-scope.mjs` (new): the one set of include and exclude patterns.
  The hook, `scripts/docs.test.mjs` and the review take scope from it.
- `.claude/hooks/show-instruction-guidance.mjs` (new), its tests, its wiring in
  `.claude/settings.json`.
- `scripts/docs.test.mjs`: the new budget and pointers, scope from the shared module.
- Fixes F1 to F5, F7, F9, F10 and F13 of Appendix D (answer 3), as a second PR on this plan.

**Out:**

- Gating Bash or PowerShell writes (`>`, `sed -i`): a known limit, recorded in Appendix C.
- `.plan/**` and `.orchestrate/**`: not gated, not reviewed.
- Files written for people: `README.md`, `CONTRIBUTING.md`,
  `.claude/skills/bootstrap-project/readme-template.md`.
- The catalog repository. Findings that need a template change are named, not planned.
- Proposed for later, on Eitan's yes:
  - `- [ ] bootstrap --finish refuses a FILL marker the Ready-to-plan list does not allow`
  - `- [ ] the scaffold resolves a serverless marker in .doc/architecture.md as it does auth`
  - `- [ ] boundaries hook: drop MultiEdit from the matcher (no such tool in tools-reference)`

## Assumptions

- This setup resolves `sonnet` to Sonnet 5.5 and `opus` to Opus 5.5: Claude Code 2.1.326, no
  Bedrock, Vertex or Foundry variable, no `ANTHROPIC_DEFAULT_*_MODEL` (checked in the shell and
  in the user settings file). model-config › Model aliases: on the Anthropic API `opus` is
  Opus 5.5 from v2.1.280 and `sonnet` is Sonnet 5.5 from v2.1.284. On Bedrock or Foundry
  `sonnet` is Sonnet 4.5, so a project there runs older models than the guides read here.
- The hooks already need Claude Code 2.1.295 (`onFailure`, `.claude/README.md:42`);
  `scratchpad_dir` needs 2.1.257, so the gate adds no new floor.
- The gate is not a guardrail. It never refuses unless it has parsed an in-scope path, read the
  guidance and written its marker; any other state allows the call.
- Hook changes are built in a worktree (`CONTRIBUTING.md › Changing the hooks`); the
  `settings.json` wiring is the last change.
- `.md` text follows the no-bloat rule: an existing file does not grow (V12).
- Proven text stays (`CONTRIBUTING.md:23-25`). A fix in Appendix D has a defect, a duplicate or
  a measured cost behind it, or is marked `measure first`.

## Open Questions

Answered 2026-11-17 on Eitan's word ("set the answers based on your recommendations"): each
answer is the recommendation. `Status:` stays `draft` until Eitan sets it.

1. Is `.doc/**` gated? It is LLM-read context, so it is in scope and reviewed. Gated, every
   bootstrap session and every loop session takes one refusal (about 650 tokens and one round
   trip) when the driver first writes a form or the change log; `.doc/conventions.md`, a
   project's own agent rules, is where the text helps most. Recommended: in; drop it to
   `.doc/conventions.md` alone if the P1 loop shows the refusal confusing the bootstrap.
   > In: `.doc/**` is gated. P1 watches the bootstrap; narrowing to `.doc/conventions.md` is the
   > fallback.
2. Re-arm the gate after a compaction and `/clear`? The hooks page does not say whether
   `session_id` changes on either, and after a compaction the text may be summarised away. It
   costs a second settings entry (`SessionStart`, matcher `compact|clear`), the first hook the
   harness wires outside PreToolUse. Recommended: yes.
   > Yes: the `SessionStart` entry with matcher `compact|clear`, as in Appendix C.
3. Which review fixes does this plan apply? Recommended: F1 to F5, F7, F9, F10 and F13
   (defects, drifted duplicates and the `effort:` pin) as a second PR, after the gate has
   merged, so the gate's first real use is on these edits. F6, F8, F11, F12 and F14 to F18
   wait for a measurement or a later plan.
   > F1 to F5, F7, F9, F10 and F13, as a second PR after the gate has merged (step R1). The
   > rest wait.
4. Two rules I think are worth having have no source in the listed pages or in
   `CONTRIBUTING.md`, so the first draft left them out (Appendix B, "Taken without a listed source"): (a) an
   edit replaces or tightens, never only adds (your standing rule of 2026-11); (b) harness
   text states the framework-neutral rule and points at the package's `AGENTS.md` for names
   (your ruling of 2026-11-06, and the class behind F1). The draft is at 40 of 40 lines.
   Recommended: take both, paid for by cutting "Group rules under headings and bullets", which
   no file breaks today.
   > Both taken. Appendix B's text now holds them (lines 9 and 12) and drops the headings
   > clause; it is still 40 lines.
5. `effort:` on the five agents (F3): the value. Recommended: `medium` on all five, after S1
   logs what they run at today; a higher level only after an A/B loop measures a gain.
   > `effort: medium` on all five, in R1, once S1 item 8 is recorded. If S1 shows an agent
   > above `medium` today, one A/B loop comes before pinning it lower.

## Steps

| Task | What |
| --- | --- |
| S1 | Spike in a disposable clone, no tree change: a throwaway PreToolUse hook that logs its payload. Record the nine facts under "S1" below. A surprise reopens the decision it feeds. |
| G1 | `.claude/instruction-files.md` with the text of Appendix B. `CONTRIBUTING.md`: the section body becomes `The rules are in .claude/instruction-files.md; a hook shows them before the first edit of such a file in a session.` `.claude/harness.json`: the file joins `harness`; `references` gains `{ "file": ".claude/instruction-files.md", "names": ["scripts/docs.test.mjs"] }`. |
| H1 | `.claude/hooks/lib/instruction-scope.mjs`: `INCLUDE`, `EXCLUDE`, `isInstructionFile(rel)` (Appendix A). Globs in the manifest's dialect, matched with `toRegExp` from `scripts/verify/glob.mjs`. |
| H2 | In a worktree: `.claude/hooks/show-instruction-guidance.mjs` (Appendix C). |
| H3 | `.claude/hooks/test/instruction-guidance.test.mjs`, cases T1 to T14 (Appendix C); `harness.mjs` gains the hook's name and a payload helper with `session_id`, `agent_id` and `scratchpad_dir`. |
| T1 | `scripts/docs.test.mjs` (below), written first and watched red. |
| H4 | `.claude/settings.json`: the two entries of Appendix C, and its `$comment`. `scripts/harness-update.mjs:277`: the comment that PreToolUse is the only event wired. |
| D1 | `.claude/README.md › Rules and permissions`: two lines saying what the refusal is and that it is not a guardrail, paid for by F9's cut. No `AGENTS.md` change (1,197 of 1,200 words). |
| H5 | Both suites; one review of the branch; PR into `dev`. |
| P1 | The proof of V04 to V06 in a disposable clone, `claude -p` and one interactive session. |
| R1 | Fixes F1 to F5, F7, F9, F10 and F13 (answer 3), each as Appendix D words it, with `effort: medium` for F3 (answer 5), as a second PR. `scripts/docs.test.mjs` before and after; no `.md` above its Base word count. |

### S1: what the spike records

1. The PreToolUse payload of an Edit in an interactive session, a `-p` session and a
   `general-purpose` subagent: `session_id`, `agent_id`, `agent_type`, `scratchpad_dir` (present,
   existing, the same directory in a subagent or not).
2. `"if": "Edit(**/*.md)"`: the hook starts for an Edit and a Write of a root and a nested `.md`
   file, on Windows too, and for no other file.
3. Exit 2 with 2,700 characters on stderr: Claude receives all of it, and under which label.
4. Two hooks exiting 2 on one call: what Claude receives.
5. Five Edit calls in one turn: the time from the first hook start to the last (sets the window).
6. `session_id` and `scratchpad_dir` across `/clear`, `--resume` and a compaction; whether
   `SessionStart` fires with `compact` in a subagent that compacts.
7. A `frontend` role agent editing `frontend/AGENTS.md`: it retries, and does not report a blocker.
8. `effort.level` in the payload inside each of the five role agents (what they run at today).
9. Whether a handler's `if` is honoured or ignored on Claude Code 2.1.295.

### T1: `scripts/docs.test.mjs`

- `instructionFiles = files.filter(isInstructionFile)`, from the shared module. The `.plan`
  regular expression at line 36 goes.
- Classification: every tracked `.md` file is in scope, under `.plan/`, or one of four named
  files (`README.md`, `CONTRIBUTING.md`, `.orchestrate/README.md`, the README template). A new
  file that is none of these fails, so scope cannot change unseen.
- Budget: `.claude/instruction-files.md` has at most 40 lines and no line over 100 characters
  (a line budget alone is met by longer lines). Every `SKILL.md` body has at most 500 lines.
- Pointers: the guidance file exists and is in the `harness` group; every hook script
  `.claude/settings.json` names exists; `CONTRIBUTING.md` names the guidance file (the existing
  path check sees it).
- The pointer and staleness checks keep their reach: in-scope files plus the four named ones.

## Validation

- V01 — Both suites pass — proof: `node --test ".claude/hooks/test/*.test.mjs"`,
  `node --test "scripts/**/*.test.mjs"`
- V02 — `docs.test.mjs` holds the new budget and pointers and takes scope from the shared
  module — proof: its tests "keeps the guidance file within 40 lines", "classifies every tracked
  Markdown file", "wires only hook scripts that exist"; the red run on a tree with a 41-line
  guidance file and one unclassified `.md` file; `grep -c "instruction-scope" scripts/docs.test.mjs`
  is at least 1
- V03 — The hook's cases T1 to T14 hold — proof: `instruction-guidance.test.mjs`, by test name
- V04 — In a real session on a disposable clone the first in-scope edit is refused and then
  succeeds, with the guidance text in the transcript before the edit that succeeds; a second
  in-scope edit, an out-of-scope `.md` edit (`README.md`, `.plan/000-backlog.md`) and a Read of
  an in-scope file are never refused; the same holds inside a `general-purpose` subagent, which
  is refused once although the main session already passed — proof: `claude -p
  --output-format stream-json` transcripts, the order and count of the tool results
- V05 — Five in-scope edits in one turn are all refused, one with the full text, and all
  succeed on the retry — proof: the transcript of one such turn
- V06 — After `/compact` and after `/clear` the next in-scope edit is refused again; after
  `--resume` it is not — proof: one interactive session, its transcript
- V07 — With the guidance file deleted, or the marker directory unwritable, an in-scope edit
  passes, the edit that recreates the guidance file included — proof: tests T6 and T7; one
  live run
- V08 — `harness-update`'s post-install check passes with the new entries — proof:
  `harness-update.test.mjs` (`failingHook(real_settings, dir)` is null); an update from this
  checkout into a disposable project prints no hook failure
- V09 — Every sentence removed from `CONTRIBUTING.md` has a line in the guidance file — proof:
  the table in Appendix B against the built file; `git diff ef5afc1 -- CONTRIBUTING.md` removes
  only that section's body
- V10 — The guidance file ships and survives setup — proof: `manifest.test.mjs` (group
  `harness`, no dangling reference); `bootstrap.mjs --finish` in a disposable clone leaves the
  file, the hook and its library
- V11 — Every in-scope file has a score row and every finding cites its evidence — proof: a
  script that filters `git ls-files "*.md"` through `isInstructionFile` and compares the result
  with the paths of Appendix D's score table (32); no empty Evidence cell in the fix list
- V12 — No existing `.md` file grew — proof: the word count of each changed `.md` against Base
- V13 — R1 only: the five agents carry the `effort:` value of question 5 — proof:
  `grep -c "^effort:" .claude/agents/*.md` prints 1 for each; behaviour is the next product loop

## Risks

- An agent reads the refusal as a guardrail refusal and reports it instead of retrying
  (`AGENTS.md:29`: "Never route around a refusal; report it") — the message says it is not one
  and names the next step; S1 item 7 and V04 test a role agent.
- A broken gate script locks out edits — `if` starts it for `.md` files only, so its own repair
  (an `.mjs` edit) stays open; errors inside it allow the call; the update probe restores the
  old files; `.claude/README.md › Guardrails and recovery` is the last resort.
- The batch window is wrong for a slow machine — S1 item 5 sets it; a miss in either direction
  costs one extra refusal or one ungated edit, never a lock-out.
- `scratchpad_dir` is absent in `-p` runs or subagents — S1 item 1; the fallback is named in
  Appendix C, decision 5.
- The guidance ages against Anthropic's pages — Appendix B dates each source; re-read them when
  model-config's version history moves an alias.
- The refusal confuses a first-time user during the bootstrap — question 1; P1 watches it.
- A fix in R1 changes proven text for the worse — each is a named defect or duplicate; the
  wording candidates wait for a measurement.

## Changes during the task

2026-11-17, on Eitan's word "execute the new plan" (`Status: active`). Built in the worktree
`.claude/worktrees/028` on `feat/instruction-guidance`.

**S1 (Claude Code 2.1.326, Windows, `claude -p`, Sonnet driver):**

1. No `scratchpad_dir` in the payload of a `-p` main session, a `general-purpose` subagent or a
   role agent. A subagent adds `agent_id` and `agent_type`; the main session has neither. An
   interactive session was not measured.
2. `"if": "Edit(**/*.md)"` starts the hook for an Edit only, root and nested; a Write needs
   `"if": "Write(**/*.md)"`. Neither starts it for another file.
3. Exit 2 with 2,700 characters: all received, as `PreToolUse:Edit hook error: [node
   ${CLAUDE_PROJECT_DIR}/<script>]: <stderr>`.
4. Two hooks exiting 2 on one call: Claude receives one message; the other hook ran and its text
   is lost.
5. Five Edit calls in one turn reach the hooks one after another, 0.6 to 0.7 s apart (2.3 s with
   three hooks wired, over 3 s with the gate's two handlers). Retries arrived 1 to 5.6 s after a
   refusal.
6. `--resume` keeps `session_id` (`SessionStart` source `resume`). `/compact` and `/clear`
   cannot be driven from `-p`: not measured.
7. A `frontend` role agent refused on `frontend/AGENTS.md` retried the same call and reported
   the task done, not blocked.
8. `effort.level` today: orchestrator and reviewer `high`; backend, frontend and qa `medium`.
9. `if` is honoured on 2.1.326; 2.1.295 was not available.

**What changed against the appendices:**

- Marker: `<os tmpdir>/instruction-guidance/<session_id>.<agent_id or "main">`, pruned after
  seven days (decision 5's fallback, by item 1). Step 3 needs `session_id` only; T6 tests a
  temp directory that cannot be written.
- Wiring: two handlers in the one `Edit|Write` group, `if` `Edit(/**/*.md)` and
  `Write(/**/*.md)` (decision 4's fallback, by item 2). The leading slash roots the rule at the
  project: without it an Edit of the root `AGENTS.md` after a `cd` went ungated in a live run.
- Batch: the fixed 3 s window let the fifth of five edits through in the live run (item 5). A
  call is of the batch when it comes within 1 s of the last refused call, for at most 10 s from
  the first; the marker holds both times. At 1.5 s a quick retry was refused a second time.
- The hook imports its two libraries inside the `try`, so a missing library allows the call.
- From the review: the marker directory is per user (`instruction-guidance-<uid>`, mode 700,
  refused when another user owns it), because a Linux temp directory is shared; a marker that
  exists and cannot be read, a marker time ahead of the clock, and a `session_id` with no
  usable character all allow the call.
- A marker left empty by a crash is read by its modification time.
- F9's cut is in D1's change, not R1: it pays for D1's lines (V12).
- `docs.test.mjs` reach: `.plan/000-backlog.md` left the pointer checks (it is under `.plan/`).
- `.claude/harness.json` `references` also lists the scope module's mention of the README
  template.
- T14's known limit is confirmed by item 4: beside a lane refusal the text may be lost.

**Proof (disposable clone, `claude -p`, Sonnet):** V04: first Edit of `AGENTS.md` refused with
the text, retry passes; `.doc/glossary.md`, `README.md`, `.plan/000-backlog.md` and a Read
never refused; a `general-purpose` subagent refused once after the main session had passed.
V05: five edits in one turn all refused, one with the text, all pass on the retry. Also live: a
Write of a new `.doc` file is refused once; an Edit after `cd scripts/sub` is refused once.

**Gates (2026-11-17, second session):** hooks suite 2908/2908, scripts suite 427/427. V08: a
`react-bun-express` project finished at Base, `harness-update --from` the worktree exits 0, no hook
failure, the three new files written. V10: `--finish` on a project from this tree keeps the
guidance file, the hook and both libraries; the hook refuses `frontend/AGENTS.md` there and
allows `README.md`. V11: 32 in scope at ef5afc1, 32 score rows, none missing, no empty Evidence
cell. V12: `CONTRIBUTING.md` 582 → 330 words, `.claude/README.md` 1,344 → 1,331.

**Open:** V06 (`/compact`, `/clear`) needs one interactive session. Answer 5: the two Opus
agents run at `high` today, so R1 pins them `high` and the other three `medium`, or an A/B
loop comes first (Eitan's call). R1 waits for the gate's merge.

**Scope narrowed (2026-11-17, after #70; Eitan: "it should be triggered only when the llm decides
to either create or edit a harness related .md file"):** this replaces answer 1. The gate covers
the root `AGENTS.md` and `CLAUDE.md`, `.claude/**/*.md` and the Copilot pointer. `.doc/**` and
a package's `AGENTS.md` (catalog text the project owns) are out; `docs.test.mjs` fails if any
file of the manifest's `project` group is gated. Branch `fix/instruction-scope`.

## Appendix A: scope

One module, `.claude/hooks/lib/instruction-scope.mjs`. A path is in scope when an include
matches and no exclude does; everything else is out, so a file that does not exist yet is
classified by its path alone.

```
INCLUDE  **/AGENTS.md   **/CLAUDE.md   .claude/**/*.md   .doc/**/*.md
         .github/copilot-instructions.md
EXCLUDE  **/node_modules/**
         .claude/skills/bootstrap-project/readme-template.md
```

- `**/` also matches no directory, so the root `AGENTS.md` and `frontend/AGENTS.md` both match.
- A path under `.claude/worktrees/<name>/` is classified by the rest of the path: a worktree
  is another checkout of the same files.
- On Windows the path is folded to lower case first, as the lanes are.
- `.plan/**` and `.orchestrate/**` need no exclude: no include reaches them.

Applied to the 64 tracked `.md` files: 32 in, 32 out.

| File | | Reason |
| --- | --- | --- |
| `AGENTS.md` | in | Loaded by every session and agent |
| `CLAUDE.md` | in | The loader |
| `.claude/README.md` | in, borderline | The manual is written for people, but `AGENTS.md:30` sends agents to it for recovery and agents run its update steps |
| `.claude/agents/backend.md`, `frontend.md`, `orchestrator.md`, `qa.md`, `reviewer.md` (5) | in | System prompts |
| `.claude/rules/code-style.md`, `git-workflow.md`, `naming.md`, `ui-and-styling.md` (4) | in | Loaded by Claude Code |
| `.claude/skills/*/SKILL.md` (11) | in | Skills |
| `.claude/skills/database/data-layer-task.md`, `dev-loop/scaffold-step.md`, `ui-design/platform-guidance.md` (3) | in | Procedures a skill sends an agent to |
| `.claude/skills/writing-plans/template.md` | in | The orchestrator copies it; its placeholders are instructions |
| `.claude/skills/bootstrap-project/readme-template.md` | out | Becomes the product's README, written for people |
| `.doc/architecture.md`, `conventions.md`, `glossary.md`, `product-definition.md` (4) | in, borderline | Context every plan reads; forms whose markers instruct the bootstrap. Gating them is question 1 |
| `.github/copilot-instructions.md` | in | A pointer another agent loads |
| `.orchestrate/README.md` | out | A directory note for people; under `.orchestrate/`, which holds loop output |
| `.plan/000-backlog.md` | out | `.plan/**` |
| `.plan/001-…` to `.plan/027-…` (27) | out | `.plan/**` |
| `README.md` | out | Written for people |
| `CONTRIBUTING.md` | out | Written for people; setup removes it |

Not tracked yet: `.claude/instruction-files.md` is in (borderline: it is the guidance, and its
own edits are gated with its current text; when it does not exist the gate allows the edit that
creates it); this plan is out. In a generated project the patterns also put `frontend/AGENTS.md`,
`backend/AGENTS.md` and `serverless/<provider>/AGENTS.md` in, and package READMEs out.
`.cursor/rules/index.mdc` is LLM-facing but not `.md`: out, a twin of the Copilot pointer.

## Appendix B: the guidance file

### Proposed text of `.claude/instruction-files.md`

40 lines, 481 words, no line over 100 characters. Amended by answer 4.

```markdown
# Instruction files

Rules for any Markdown file an agent loads as instructions or context. A hook shows them once per
session, in place of the first edit of such a file: read them, then make the same call again.

## Changing harness text

- `AGENTS.md` and `.claude/` are prompts, re-read on every turn and mostly proved by loop runs.
  Change one only for a defect, a duplicate or a measured cost; replace or tighten, never only add.
- One home per fact. A fact a script computes lives in the script; the text says where to read the
  result. An agent's body does not repeat its preloaded skill.
- State the framework-neutral rule; point at the package's `AGENTS.md` for a framework's names.
- Name a current fact, not its history. Text for older catalogs goes when `minCatalog` passes them.
- In the harness repository `scripts/docs.test.mjs` holds the budgets and checks the pointers. A
  budget moves only with a reason in the plan that moves it.

## Wording

- Be explicit and concrete enough to verify: "run `check` before reporting", not "test your change".
- Give the reason behind a rule; an agent generalises from it. Leave out what a model already knows.
- Say what to do. Forbid only a specific thing, and name it.
- Use plain wording: no capitals for urgency, no "always use X", no "if in doubt, use X".
- One term per concept. Two rules never contradict: an agent picks one arbitrarily.
- Wrap an example in `<example>` tags, relevant and varied; wrap pasted input in tags of its own.

## Agents and skills

- A description is third person and says what the skill does, when to use it and its topics, never
  its steps: an agent follows narrated steps instead of the body, and a session with no topic words
  greps instead of invoking. Measure a change in real sessions (`claude -p` on both trees, count
  `Skill` calls); asking a model to pick from the list cannot show a loss.
- A procedure one task in a project needs goes in a supporting file beside `SKILL.md`, named from
  it with the condition that sends a reader there. A `SKILL.md` body stays under 500 lines.
- Name the one check that proves the work, with its command. Add no re-check or review round on
  top of it, and no "think carefully": `effort:` in the frontmatter sets how much an agent thinks.
- Say when a subagent is warranted (independent, sizeable work), not only that one may be used.
- `dev-loop` stays under 5,000 tokens with its commit gate at the end: after a compaction a
  re-attached skill keeps only its first 5,000 tokens.
- The skill listing shares a budget with every plugin's skills (1% of the context window, or
  8,000 characters as the fallback); past it, descriptions drop from the least-invoked skill first.
```

The moved rules, the confirmed rules and the two of answer 4 fill the 40 lines. One confirmed
rule was cut to pay for those two: "Group rules under headings and bullets" (MEM › Write
effective instructions, Structure), which no file breaks today. A later rule replaces one.

### Sources

All pages fetched 2026-11-17. Keys: **BP** platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices ·
**SK** platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices ·
**MEM** code.claude.com/docs/en/memory · **S55**, **O55**, **O5** the three model guides
(`…/prompt-engineering/prompting-claude-sonnet-5-5`, `-opus-5-5`, `-opus-5`) ·
**MC** code.claude.com/docs/en/model-config · **SA** `…/sub-agents` · **CS** `…/skills` ·
**EV** `…/env-vars` · **C** `CONTRIBUTING.md` at ef5afc1.

| Lines | Rule | Source |
| --- | --- | --- |
| 8–9 | Prompts, proven; change only for a defect, a duplicate or a measured cost | C:23–25 |
| 9 | Replace or tighten, never only add | No listed source: Eitan's standing rule, taken by answer 4 |
| 10–11 | One home per fact; script facts; no repeat of a preloaded skill | C:27–28 |
| 12 | The framework-neutral rule, names in the package's `AGENTS.md` | No listed source: Eitan's ruling of 2026-11-06, taken by answer 4 |
| 13 | Current fact, not history; older catalogs | C:37; SK › Avoid time-sensitive information |
| 14–15 | The test holds the budgets; a budget moves with a reason | C:43–44 |
| 19 | Explicit | BP › Be clear and direct |
| 19 | Concrete enough to verify | MEM › Write effective instructions |
| 20 | Give the reason | BP › Add context to improve performance ("Claude can generalize from the explanation") |
| 20 | Leave out what a model knows | SK › Concise is key |
| 21 | Say what to do; name what is forbidden | BP › Control the format of responses; O5 › User-facing progress updates; O55 › Frontend design defaults |
| 22 | No capitals for urgency | BP › Tool usage |
| 22 | No "always use X", "if in doubt" | BP › Overthinking and excessive thoroughness |
| 23 | One term per concept | SK › Use consistent terminology |
| 23 | No contradiction | MEM › Write effective instructions (Consistency) |
| 24 | Examples tagged, relevant, varied | BP › Use examples effectively |
| 24 | Tags around pasted input | BP › Structure prompts with XML tags |
| 28–30 | Description: when, topics, never steps, and why | C:29–31 |
| 28 | Third person, what it does | SK › Writing effective descriptions |
| 30–31 | Measure in real sessions | C:32–34 |
| 32–33 | Supporting file, named with its condition | C:35–36; SK › Avoid deeply nested references |
| 33 | `SKILL.md` under 500 lines | SK › Progressive disclosure patterns; CS › Add supporting files |
| 34 | One check that proves the work | S55 › Verification on coding tasks |
| 34–35 | No re-check or review round on top | O5 › Task scope and over-verification; O5 › Self-correction; BP › Leverage thinking and interleaved thinking capabilities |
| 35 | `effort:`, not "think carefully" | S55 › Calibrate effort; O55 › Thinking instructions in chat system prompts; SA › Frontmatter reference |
| 36 | Say when a subagent is warranted | O5 › Controlling subagent spawning; BP › Subagent orchestration |
| 37–38 | `dev-loop` under 5,000 tokens, gate last | C:38–39; confirmed by CS › Skill content lifecycle |
| 39–40 | The listing budget | C:40–41, corrected: EV `SLASH_COMMAND_TOOL_CHAR_BUDGET` ("1% of the context window, with a fallback of 8,000 characters") |

### The ten candidate rules

| Candidate | Verdict |
| --- | --- |
| Be explicit | Confirmed, BP › Be clear and direct |
| Give the reason | Confirmed, BP › Add context to improve performance |
| Say what to do, not what to avoid | Confirmed with a limit. BP states it for output format, O5 for communication style; O55 adds that naming a specific pattern to avoid works. Drafted as line 20 |
| Plain wording, no CAPS urgency | Confirmed, model-scoped: BP measured it on Opus 4.5 and 4.6 and says to re-check a model-named technique on another model. Kept: the tree has no CAPS urgency (grep), so the rule only stops a regression |
| Specific, verifiable | Confirmed on MEM ("concrete enough to verify"). BP has "specific" only; "verifiable" is not on it |
| One term per concept | Confirmed, SK › Use consistent terminology |
| No contradicting rules | Confirmed, MEM |
| Don't explain what Claude knows | Confirmed, SK › Concise is key ("Only add context Claude doesn't already have") |
| Examples relevant, diverse, tagged | Confirmed, BP › Use examples effectively |
| XML tags where instructions mix with input | Confirmed, BP › Structure prompts with XML tags |

### Sentences removed from `CONTRIBUTING.md`, and where each lands

| `CONTRIBUTING.md` | Sentence | Guidance line |
| --- | --- | --- |
| 23–25 | "`AGENTS.md`, `.claude/agents/`, `.claude/skills/` and `.claude/rules/` are prompts: … proved most of their sentences." | 8 (the four paths become `AGENTS.md` and `.claude/`; "proved most of their sentences" becomes "mostly proved by loop runs") |
| 25 | "Change one only for a defect, a duplicate or a measured cost." | 9 |
| 27 | "One home per fact." | 10 |
| 27–28 | "A fact a script computes lives in the script; a doc says where to read the result." | 10–11 |
| 28 | "An agent's preloaded skill is not repeated in the agent's body." | 11 |
| 29 | "A skill's description says when to use it and the topics it covers, never its steps." | 28–29 |
| 29–31 | "An agent follows a narrated workflow instead of the body; a session with no topic words greps instead of invoking." | 29–30 |
| 32–33 | "Measure a description change in real sessions: … count `Skill` calls." | 30–31 |
| 33–34 | "Asking a model to pick from the list scores far higher …, so it cannot show a loss." | 31 |
| 35–36 | "A procedure one task in a project needs goes in a supporting file …" | 32–33 |
| 37 | "Name a current fact, not its history." | 13 |
| 37 | "Text for older catalogs goes when `minCatalog` passes them." | 13 |
| 38–39 | "`dev-loop` stays under 5,000 tokens: its sessions are long, and after a compaction …" | 37–38 ("its sessions are long" goes: the compaction clause is the reason) |
| 39 | "Its commit gate is at the end." | 37 |
| 40–41 | "The skill listing shares a budget …, about 8,000 characters by default; …" | 39–40, corrected (the default is 1% of the context window) |
| 43 | "`scripts/docs.test.mjs` holds the budgets and checks the pointers." | 14 |
| 43–44 | "A budget moves only with a reason in the plan that moves it." | 14–15 |

### Confirmed, left out

Each applies to instruction files and has a source, and the tree already complies or a test
holds it better than a sentence: forward slashes in paths (SK › Avoid Windows-style paths; grep
finds none); a table of contents in a reference file over 100 lines (SK; the longest supporting
file is 85); a default instead of a list of options (SK › Avoid offering too many options);
the level of detail matched to how fragile the task is (SK › Set appropriate degrees of
freedom); a role sentence (BP › Give Claude a role; every agent file has one); the stops wanted
and not wanted, by name (O55 › Unattended agentic runs); 200 lines for an always-loaded file
(MEM; `AGENTS.md`'s 1,200-word budget is stricter); rules grouped under headings and bullets
(MEM › Write effective instructions, Structure; cut by answer 4).

### Taken without a listed source (answer 4)

Proposed by the planner, taken by Eitan. Neither is on a listed page or in `CONTRIBUTING.md`.

- Line 9, "replace or tighten, never only add". Basis: Eitan's standing rule. MEM's "Longer
  files consume more context and reduce adherence" supports the direction and not the rule.
- Line 12, the framework-neutral rule. Basis: Eitan's ruling of 2026-11-06; F1 is what happens
  without it.

## Appendix C: the hook

### What it does

`show-instruction-guidance.mjs`, PreToolUse on `Edit|Write`. In this order, inside one
`try` whose `catch` exits 0:

1. Read stdin. Not JSON, not an object, a tool other than Edit or Write, or no string
   `tool_input.file_path`: exit 0.
2. Make the path project-relative (`toProjectRelative`, which also turns Windows separators).
   Outside the root, or `isInstructionFile` false: exit 0.
3. No string `session_id`, or no `scratchpad_dir`: exit 0 with the pointer (below).
4. The marker is `<scratchpad_dir>/instruction-guidance-<session_id>-<agent_id or "main">`,
   ids reduced to `[A-Za-z0-9_-]`. It holds the time of the first refusal.
5. Marker present and older than the batch window (3 s): exit 0. Younger: exit 2 with one
   line: this call was refused with the one before it, the guidance is in that refusal, retry.
6. Read `.claude/instruction-files.md` under the project root. Missing, unreadable or empty:
   exit 0 with a `systemMessage` and `additionalContext` that say so. No marker is written.
7. Write the marker, creating it exclusively. It exists already (a parallel call won): as
   step 5, younger. Any other failure: exit 0 with the pointer.
8. Exit 2. Stderr is a header, the file's text and a last line:

```
[instruction-guidance] <path> is an instruction file. This is its editing guidance, shown once
per session. It is not a guardrail refusal and needs no report: read it, then make the same
call again.

<the text of .claude/instruction-files.md>

Now make the same call again.
```

The pointer is exit 0 with `additionalContext`: "The instruction-file guidance could not be
shown first; read `.claude/instruction-files.md`." With `--reset` (the `SessionStart` entry) the
script deletes this session's markers and always exits 0.

### Wiring

```json
"PreToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [{
      "type": "command",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/show-instruction-guidance.mjs"],
      "if": "Edit(**/*.md)",
      "timeout": 10,
      "onFailure": "block"
    }]
  }
],
"SessionStart": [
  {
    "matcher": "compact|clear",
    "hooks": [{
      "type": "command",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/show-instruction-guidance.mjs", "--reset"],
      "timeout": 10
    }]
  }
]
```

### Decisions

Hooks page: code.claude.com/docs/en/hooks; tools page: `…/tools-reference`.

| # | Decision | Reason |
| --- | --- | --- |
| 1 | Edit and Write only | Tools page, table: the file writers are Write, Edit and NotebookEdit ("Modifies Jupyter notebook cells"); it lists no MultiEdit. As expected |
| 2 | Refuse with exit 2 and stderr, not JSON `deny` | Hooks › Exit code 2: "Claude receives the hook's stderr as the tool's error, prefixed with the event name, the tool name, and the hook's command". Hooks › PreToolUse decision control: exit 2 "routes the same way as `"deny"`". So `deny` gains nothing, and exit 2 is what the three hooks and the test harness use, and still blocks when stdout is not valid JSON. As expected |
| 3 | `additionalContext` only on the paths that cannot refuse | Hooks › Add context for Claude: for PreToolUse it is placed "next to the tool result", so the edit is written first. As expected |
| 4 | `"if": "Edit(**/*.md)"` | Hooks › Common fields: `if` is one permission rule, on tool events only, and a call that does not match "would never run, avoiding the process spawn overhead". Tools page: an `Edit(...)` rule applies to Edit, Write and NotebookEdit. Whether that also holds inside `if` is not stated: S1 item 2. If not, two handlers (`Edit(…)`, `Write(…)`); if `if` cannot be used, none. The script tests the tool and the path itself either way, because the update probe ignores `matcher` and `if` |
| 5 | The marker lives in `scratchpad_dir` | Hooks › Common input fields: "the session's scratchpad directory … Absent when the session has no scratchpad or the temp directory is unavailable". It is per session, so nothing goes stale and no cleanup code runs in a hook that must not fail; a reboot clears it. A git-ignored directory in the repository needs a prune by age, litters the tree, fails in a read-only checkout and sits beside loop output. If S1 item 1 finds the field absent in `-p` runs or subagents, the marker moves to `<os tmpdir>/instruction-guidance/`, keyed the same way, with a prune of markers older than seven days |
| 6 | Key: `session_id`, and `agent_id` when present | Hooks › Hook locations: settings hooks "also run inside subagents" and "the input carries the `agent_id` and `agent_type`". `agent_type` is also present with `--agent`; `agent_id` is documented for a subagent or teammate only, so a main session keys as `main`. Each subagent is gated once |
| 7 | One turn, several calls: refuse every matching call for 3 s after the first refusal | The other calls of the turn run before Claude reads any result (hooks › PostToolBatch: one batch, then "the next request to the model"). The window is measured from the first refusal and never extended, so it ends by itself; a retry needs a model round trip and cannot arrive inside it. Limit: a batch that puts a slow call between two instruction edits lets the later one through |
| 8 | Re-arm on `SessionStart` `compact` and `clear`; not on `resume` | The page does not say whether `session_id` changes on `/clear`, `--resume` or a compaction (`SessionEnd` has a `clear` reason, which suggests a new session, no more). The reset makes the gate independent of the answer. A resumed session has the text in its transcript. PostCompact would do the same; `SessionStart` covers `clear` in one entry. No `onFailure`: the event cannot block, and a failed reset only leaves the gate unarmed |
| 9 | Errors inside the script allow the call; `onFailure: block` stays | The secret-file hook on `*` already blocks an unreadable payload. A gate refusal without the text is a refusal with no way forward. What `onFailure` still catches is a script that cannot start, which should be loud; `if` keeps that to `.md` files |
| 10 | The refusal carries its own tag and says it is not a guardrail refusal | `AGENTS.md:29` tells every role to report a refusal and not route around it |

### Cases

| | Case | Result |
| --- | --- | --- |
| T1 | First call on `AGENTS.md`, `.claude/agents/backend.md`, `.doc/glossary.md`, `frontend/AGENTS.md` | exit 2, the file's text and the retry line on stderr |
| T2 | `README.md`, `CONTRIBUTING.md`, `.plan/000-backlog.md`, `.orchestrate/x/backend.md`, the README template, `frontend/README.md`, `frontend/node_modules/p/AGENTS.md`, `src/x.ts`, a path outside the root | exit 0, no marker |
| T3 | A file that does not exist yet: `.claude/skills/new/SKILL.md`, `.claude/rules/new.md` | exit 2 |
| T4 | Second call, marker older than the window; marker younger | exit 0; exit 2 with the one line and no file text |
| T5 | A subagent (`agent_id` A) after the main session passed; A again; `agent_id` B | exit 2; exit 0; exit 2 |
| T6 | No `scratchpad_dir`; one that cannot be written (a path under a file) | exit 0 with the pointer |
| T7 | Guidance file missing: any in-scope path, the guidance file itself included | exit 0, no marker |
| T8 | Empty stdin, invalid JSON, an array, no `tool_input`, a non-string `file_path` | exit 0 |
| T9 | The update probe's three payloads (no `session_id`) | exit 0 |
| T10 | Backslash separators; another letter case on Windows | in scope |
| T11 | `.claude/worktrees/x/AGENTS.md`; `.claude/worktrees/x/README.md` | exit 2; exit 0 |
| T12 | `--reset` | removes this session's markers only; exit 0 on any input |
| T13 | Two first calls at once | both exit 2, exactly one with the file text |
| T14 | Role `backend` on `.claude/agents/backend.md` | both hooks exit 2; the marker is written |

### The other three points

- **The update probe** (`scripts/harness-update.mjs:292-302`) sends every PreToolUse hook a
  Read, a `git status` and an Edit of `README.md`, with no `session_id`. The gate exits 0 on all
  three by steps 1 and 2 (T9), so the probe is unchanged. It reads only `hooks.PreToolUse`, so
  the `SessionStart` entry is not probed; the comment at line 277 is corrected.
- **With `enforce-agent-boundaries.mjs`.** Matching hooks run in parallel (hooks › Hook handler
  fields) and `deny` wins. What Claude receives when two hooks block is not documented (S1
  item 4). The gate cannot know the other hook's verdict, so it writes its marker on a call the
  lane hook also refuses (T14). If Claude is shown only the lane refusal, that agent's next
  in-scope edit passes without the text. Known limit: it needs a role agent that first tries an
  instruction file outside its lane.
- **Bash and PowerShell writes** (`>`, `sed -i`, `Set-Content`) do not pass this hook. Known
  limit. Role agents cannot use them (the lane hook refuses shell writes); the main session and
  `general-purpose` agents can.

Other known limits: a subagent that compacts is re-armed only if `SessionStart` fires for it
(S1 item 6); `@`-mentions and Reads are never gated, by design.

## Appendix D: the review

2026-11-17, at ef5afc1, against the draft of Appendix B and the three model guides. Facts were
checked against the code, the pinned catalog (`catalog.lock` v1.14.0, read in the bootstrap's
cache) and Claude Code's pages. `scripts/docs.test.mjs` passes at Base (13 of 13).

### What the tree already gets right

- No capitals for urgency, no "think carefully", "double-check" or "if in doubt" (grep, all 32).
- No blanket delegation: four agents carry `disallowedTools: Agent`, the reviewer's `tools`
  has no Agent, and `dev-loop` names each dispatch.
- One check, not rounds: `verify --reuse` is the evidence; the reviewers and QA are told not to
  re-run the gates (`code-review/SKILL.md:24-25`, `:88-91`; `qa.md:31-33`); fix rounds stop at
  two, each re-reviewed on its own diff. This is the wanted kind of check, not over-verification.
- Every `SKILL.md` is under 500 lines (longest 323); supporting files are one link from their
  `SKILL.md`; the listing is 3,713 of 3,800 characters.
- Checked and true: `/ultrareview` still reaches the cloud review beside a project `code-review`
  skill (CS › Resolve skills that share a name: a project skill replaces the command "but not
  its aliases"); the ten-minute cap on background agents in `-p`; `permissions.allow` waiting
  for trust; the 5,000-token re-attach.

### Scores

0 to 5 on accuracy, actionability, one home, context economy, discoverability. Rank 1 needs the
most work; a tie goes to the file loaded more often.

| Rank | File | Acc | Act | Home | Econ | Disc | Sum | Findings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `.claude/skills/error-handling/SKILL.md` | 3 | 4 | 2 | 3 | 5 | 17 | F1, F12 |
| 2 | `.claude/skills/writing-tests/SKILL.md` | 4 | 4 | 3 | 3 | 5 | 19 | F1, F6, F12 |
| 3 | `.claude/agents/frontend.md` | 3 | 4 | 3 | 4 | 5 | 19 | F1, F3 |
| 4 | `.claude/skills/writing-plans/template.md` | 3 | 4 | 3 | 4 | 5 | 19 | F1 |
| 5 | `.claude/skills/dev-loop/scaffold-step.md` | 5 | 3 | 3 | 4 | 4 | 19 | F4, F12 |
| 6 | `.claude/skills/dev-loop/SKILL.md` | 5 | 4 | 3 | 3 | 5 | 20 | F8, F12, F16 |
| 7 | `.doc/architecture.md` | 3 | 4 | 4 | 4 | 5 | 20 | F4 |
| 8 | `.claude/skills/bootstrap-project/SKILL.md` | 5 | 3 | 4 | 3 | 5 | 20 | F5, F17 |
| 9 | `.claude/skills/ui-design/SKILL.md` | 4 | 4 | 4 | 4 | 5 | 21 | F1, F10 |
| 10 | `.claude/skills/code-review/SKILL.md` | 4 | 5 | 3 | 4 | 5 | 21 | F1 |
| 11 | `.claude/README.md` | 3 | 5 | 4 | 4 | 5 | 21 | F9 |
| 12 | `.claude/agents/reviewer.md` | 5 | 5 | 3 | 4 | 5 | 22 | F3, F7, F15 |
| 13 | `.claude/agents/qa.md` | 5 | 5 | 4 | 3 | 5 | 22 | F3, F11 |
| 14 | `.claude/skills/database/SKILL.md` | 5 | 5 | 3 | 4 | 5 | 22 | F12 |
| 15 | `.claude/skills/api-design/SKILL.md` | 5 | 5 | 3 | 4 | 5 | 22 | F14 |
| 16 | `.doc/glossary.md` | 4 | 4 | 4 | 5 | 5 | 22 | F1 |
| 17 | `AGENTS.md` | 4 | 5 | 5 | 4 | 5 | 23 | F2, F18 |
| 18 | `.claude/agents/backend.md` | 5 | 5 | 4 | 4 | 5 | 23 | F3 |
| 19 | `.claude/agents/orchestrator.md` | 4 | 5 | 4 | 5 | 5 | 23 | F3, F13 |
| 20 | `.claude/skills/writing-plans/SKILL.md` | 5 | 5 | 4 | 4 | 5 | 23 | F12 |
| 21 | `.claude/skills/deployment/SKILL.md` | 5 | 5 | 4 | 4 | 5 | 23 | F12 |
| 22 | `.doc/product-definition.md` | 5 | 5 | 5 | 4 | 5 | 24 | none |
| 23 | `.claude/rules/git-workflow.md` | 5 | 5 | 5 | 4 | 5 | 24 | none |
| 24 | `.claude/rules/naming.md` | 5 | 5 | 5 | 4 | 5 | 24 | none |
| 25 | `.claude/rules/ui-and-styling.md` | 5 | 5 | 4 | 5 | 5 | 24 | none |
| 26 | `.claude/skills/cutting-a-release/SKILL.md` | 5 | 5 | 5 | 5 | 4 | 24 | none |
| 27 | `.claude/skills/database/data-layer-task.md` | 5 | 4 | 5 | 5 | 5 | 24 | none |
| 28 | `.claude/skills/ui-design/platform-guidance.md` | 5 | 5 | 5 | 5 | 4 | 24 | none |
| 29 | `CLAUDE.md` | 5 | 5 | 5 | 5 | 5 | 25 | none |
| 30 | `.doc/conventions.md` | 5 | 5 | 5 | 5 | 5 | 25 | none |
| 31 | `.claude/rules/code-style.md` | 5 | 5 | 5 | 5 | 5 | 25 | none |
| 32 | `.github/copilot-instructions.md` | 5 | 5 | 5 | 5 | 5 | 25 | none |

### Ranked fix list

Ranked by harm times how often the text loads: wrong facts first, then duplicates that have
already drifted, then cost, then candidates that need a measurement. In each row the first fix
is the recommended one.

| # | Finding | Evidence | Fix, then alternatives |
| --- | --- | --- | --- |
| F1 | Per-framework names copied from the catalog into harness text have drifted. Six places name React, Next, Angular and Vue; none names Astro, which the pinned catalog ships, and one names the wrong file for Next. Each place also cites the package's `AGENTS.md`, which is the home | `frontend.md:56-57` (`SIGNED_IN_ROUTES` "in `tests/e2e/screen-routes.ts`": in Next it is in `tests/e2e/screens.spec.ts`, catalog v1.14.0 `frontend/next/base/AGENTS.md:571-578`; Astro's list is `EXTRA_ROUTES`, `frontend/astro/base/AGENTS.md:127-128`); `error-handling/SKILL.md:90-102`; `writing-tests/SKILL.md:75-76`; `writing-plans/template.md:62-66`; `ui-design/SKILL.md:43-46`; `code-review/SKILL.md:52-57`; `.doc/glossary.md:19-20` | Keep the framework-neutral rule and the pointer; cut the names (about 200 words, most of them preloaded into every backend and frontend run) · add Astro to each list (a seventh copy to keep in step) · a docs test that greps the catalog cache (the harness tests do not read the catalog) |
| F2 | "`.claude/settings.json`, the only hook and permission config Claude Code reads" is false, in the file every agent loads | `AGENTS.md:17-18`; against `.claude/README.md:40-41` and `:56-58` (`settings.local.json` holds `disableAllHooks`, project hooks and personal permissions) and hooks › Hook locations (entries merge across settings levels) | "wired by `.claude/settings.json`. A hook script not wired there never runs." (6 words fewer) · leave it |
| F3 | No agent sets `effort:` (open since plan 018). An agent on the session's model takes the session's level; on another model "that level doesn't apply". So the reviewer and the orchestrator run at whatever the user last picked when the driver is on Opus, and at a default otherwise. This machine also saves `high` for Opus 5.5 in the user settings, and the pages do not say whether a saved level reaches a subagent. The loop's depth and cost vary by machine and by driver model | `.claude/agents/*.md` frontmatter (grep: no `effort:`); SA › When a subagent has no `effort` field; MC › Adjust effort level (defaults: `medium` for Sonnet 5.5 and Opus 5.5). Guides: S55 › Calibrate effort ("For agentic coding … start at `medium` for well-specified tasks and move to `high` for harder or longer ones"; at `xhigh` and `max` it "can start its own rounds of review"); O55 › Calibrate effort ("Start at `medium` … set it explicitly"; "Reserve `xhigh` and `max` for work where you've measured a quality gain") | `effort: medium` on all five, after S1 item 8 shows what they run at today. It is both guides' starting point and the documented default, so it pins the proven behaviour. If S1 shows the Opus agents at `high` here, run one A/B loop before pinning lower · `high` for the reviewer (MC: "work where verification matters"), only with that A/B · leave unset. Watch: S55 says `medium` "is more likely to stop and check in" on long tasks; if `loop-stats` shows agents ending with no report, raise the implementers to `high`. `CLAUDE_CODE_EFFORT_LEVEL` overrides the frontmatter |
| F4 | A project on `serverless/cloudflare` keeps container-only text that nothing rewrites: the `backend/` row ("The server's container"), Health, Startup and shutdown, Replicas, and "`docker compose --profile app up --build` runs the stack locally". A serverless server has no Compose file | `.doc/architecture.md:15`, `:124-141`; `bootstrap-project/SKILL.md:112-113`; `dev-loop/scaffold-step.md:30-34` has a serverless clause for three rows and none for these | One row in `scaffold-step.md`'s table: for serverless, replace those lines with a pointer to `serverless/<provider>/AGENTS.md` (paid for by F12's cut in the same file) · a scaffold marker, as `auth-start` works (a script and catalog change: proposed backlog line) |
| F5 | A completion claim with no check: the bootstrap ticks the three Ready-to-plan boxes "once each holds", and the dev loop trusts the ticks. No script looks for a leftover marker | `bootstrap-project/SKILL.md:291-296`; `dev-loop/SKILL.md:65-67`; `grep -n "FILL" scripts/bootstrap.mjs scripts/verify.mjs scripts/verify/*.mjs` finds nothing | Name the check in section 5 item 5: `grep -n "FILL" .doc/*.md` prints only the three markers that item allows · `--finish` refuses (proposed backlog line) |
| F6 | General testing knowledge, preloaded into three roles on every run: about 95 words | `writing-tests/SKILL.md:30-31`, `:35-37`, `:86`, `:91`; SK › Concise is key | Cut "Test behaviour, not implementation details", "Fast feedback first", "Pure rules …", "Minimal fixtures …", "No flaky tests …"; keep the project's halves (the clock reset, no sleep, no process-global mock, no secrets) · leave. Measure first: one loop's `Tests first:` lines before and after |
| F7 | The reviewer's body repeats its preloaded skill in three steps | `reviewer.md:27-29` against `code-review/SKILL.md:8-9`; `:32-34` against `:77-79`; `:35-36` against `:118-119`; C:28 | Cut steps 2 and 4 and the clause in 5 (about 75 words) · cut the skill's copies (ad-hoc reviews lose them) |
| F8 | The model choice has two homes: each agent's frontmatter, and "passed explicitly as `model`". The per-invocation parameter wins, takes an alias only, and so silently overrides a frontmatter that pins a full model id | `dev-loop/SKILL.md:255-256` (since 2d8cea5); SA › Choose a model, the order | "Model and effort are each agent's frontmatter; pass neither." Check first: one dispatch with no `model` runs on the frontmatter's model · leave |
| F9 | The manual says "The dev loop has exercised React and Next", and carries four lines of catalog history | `.claude/README.md:88-92`; `.plan/019-2026-11-06-angular-spa.md:510-512` (a full loop on `angular-bun-express`); C:37 | Cut both (about 60 words; `### Older projects` keeps the versions that matter). Pays for D1's two lines · correct the sentence and keep the history |
| F10 | A garbled sentence in rubric check 7: "laid out as the its `from:` source does" | `ui-design/SKILL.md:103-104` | "laid out as its `from:` source is" |
| F11 | The same judged rubric runs twice over the same screenshots: the frontend's UI pass, then QA's UX pass, whose rubric findings are P2 and open no fix round. The guides name a second agent's verification as cost; plan 018 recorded that plan 016's V09 to V11 were never measured | `frontend.md:51-64`; `qa.md:41-49`; O5 › Task scope and over-verification; `.plan/018-2026-10-30-instruction-audit.md:235` | Measure first: in the next loop count QA `UX:` findings that are not in the frontend's `Handoff`. If none, QA judges only the routes the frontend left open or did not capture · leave |
| F12 | Numbers with two or more homes, not yet drifted: the store retry (10 attempts, 5 s); the `TRUST_PROXY` defaults (four places); "about 30 active signed-in visitors per 15 minutes"; the `skipif` exemption; the plan caps 120, 8 and 3 | `database/SKILL.md:88` and `error-handling/SKILL.md:80-81`; `deployment/SKILL.md:17`, `:174-175`, `scaffold-step.md:31-32`, `.doc/architecture.md:146-147`; `deployment/SKILL.md:186-187` and `scaffold-step.md:31`; `writing-tests/SKILL.md:99-100` and `database/SKILL.md:128-129`; `dev-loop/SKILL.md:88-90` and `writing-plans/SKILL.md:111-116` | One home each and a pointer from the other; for the plan caps, which the driver needs inline, a docs test that the two files agree · leave |
| F13 | A wrong reason: the package `AGENTS.md` files "do not [load], because you write only `.orchestrate/…`". A nested `AGENTS.md` loads for no agent while a root `CLAUDE.md` exists, and the catalog's packages ship no `CLAUDE.md`. Every role is told to Read the file, so only the reason is wrong | `orchestrator.md:16-17`; MEM › When Claude Code reads AGENTS.md; catalog v1.14.0 (no `CLAUDE.md` under any `base/`) | "… do not load by themselves. Read the package files you need." · leave |
| F14 | `api-design` explains HTTP methods any model knows, and repeats a rule of `error-handling`; both skills preload into the backend | `api-design/SKILL.md:17-18`; `:89-91` against `error-handling/SKILL.md:26-28` | Keep "`PUT` (full replace, rarely)" as the one project choice; cut the rest and the repeat (about 50 words) · leave |
| F15 | "Drop anything you cannot substantiate" after one check. The Opus 5 guide says a conservative filter is followed literally and lowers recall, and to report everything and filter in a separate pass | `reviewer.md:30-31`; O5 › Capability improvements (code review) | Leave until a missed finding is traced to it: no local evidence, and plan 027's two reviews agreed · report it as `P2 — Unverified:` with the check that would settle it |
| F16 | The driver is told how `--reuse` builds its key, which the script computes and the driver never acts on; and the frontend "stops after `check`", where its own file says after the partial `verify` | `dev-loop/SKILL.md:37-39`, `:132`; `frontend.md:40-41`; C:27 | Cut the key's parts (about 25 words); "after its partial `verify`" · leave |
| F17 | The dev check is not a command: "open the frontend's `http.port`: the home page renders" | `bootstrap-project/SKILL.md:232-234`; MEM › Write effective instructions | "`curl -fsS http://localhost:<port>/` answers 200" (the e2e smoke in `verify` already proved rendering) · leave |
| F18 | "the driver" is used and never defined in the files a role agent loads | `AGENTS.md:27`; `dev-loop/SKILL.md:8` defines it, and no role agent loads that | "the driver (the session running `dev-loop`)" at first use, inside F2's six saved words · leave |

Top five: F1, F2, F3, F4, F5.

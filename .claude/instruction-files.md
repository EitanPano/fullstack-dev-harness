# Instruction files

Rules for the harness's prompts: the root `AGENTS.md` and `CLAUDE.md`, and `.claude/`. A hook
shows them once per session, in place of the first edit of such a file: read them, then retry.

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

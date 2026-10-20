# AI4Dev Agent Files

A structured workspace for running an AI-driven product development loop.

This repository holds the source-of-truth instructions, product docs, planning artifacts, and orchestration outputs used to build a product through specialized agents. The product itself is defined in one place: `.doc/product-definition.md`.

## What this repository is

- A coordination and governance repo for multi-agent delivery
- A place to keep product intent, architecture notes, backlog, and implementation plans aligned
- A contract handoff point for future backend implementation

## Current project focus

- Product: see `.doc/product-definition.md`
- Scope: frontend-first, mock-data-driven user journeys until a backlog task opts into `stack:full`
- Delivery model: Orchestrator -> Frontend/Backend (when needed) -> QA

## Repository map

| Path | Purpose |
|---|---|
| AGENTS.md | Canonical operating rules and guardrails for all agents |
| CLAUDE.md | Loads AGENTS.md into compatible runtimes |
| .doc/ | Product and architecture source docs |
| .plan/ | Prioritized backlog and approved implementation plans |
| .claude/rules/ | Always-on coding and workflow constraints |
| .claude/skills/ | On-demand procedural playbooks |
| .claude/agents/ | Role definitions for orchestrator, frontend, backend, qa, and security-reviewer |
| .claude/hooks/ | Runtime guardrails that enforce boundaries and safety; `bun run hooks:test` runs their payload matrix |
| .orchestrate/ | Generated outputs from the latest dev loop run; only its README.md is tracked |
| package.json | Runtime contract (Node 24, Bun 1.4) and harness scripts |
| .github/copilot-instructions.md | Copilot entry point that points to AGENTS.md |

## Prerequisites and guardrails

- Claude Code 2.1.295 or newer (hooks use exec form and `onFailure: "block"`).
- Node 24 or newer, available to Claude Code as a real `node` executable on `PATH` (not a
  `.cmd` shim), and Bun 1.4 or newer for `bun run` scripts. On Windows, Git Bash backs the
  Bash tool.
- The guardrail hooks in `.claude/hooks/` **fail closed**: a hook that crashes, times out, or
  cannot start blocks the tool call. If `node` is missing from Claude Code's `PATH`, every
  tool call (Read and Edit included) is blocked until that is fixed. Recovery: put
  `{ "disableAllHooks": true }` in `.claude/settings.local.json` (gitignored) or edit
  `.claude/settings.json` by hand, then restore the hooks once `node` resolves.
- On an older Claude Code the hooks run but fail open (an unknown `onFailure` is ignored),
  so upgrade before relying on them.
- `bun run hooks:test` runs the hook payload matrix. Run it after the workspace trust dialog
  on a fresh clone and after any change to `.claude/hooks/` or the hook block in
  `.claude/settings.json`.

## How work moves through this repo

1. Add or prioritize tasks in .plan/000-backlog.md.
2. Create or update an implementation plan in .plan/NNN-YYYY-MM-DD-topic.md.
3. Execute the dev loop in your local environment.
4. Review generated artifacts in .orchestrate/:
   - PLAN.md mirror
   - api-contract.yaml
   - agent reports
   - qa-report.md
   - trace.json
5. Validate acceptance criteria against .doc/product-definition.md.

## Source of truth and generated files

- Durable, hand-maintained sources:
  - .doc/
  - .plan/
  - .claude/rules/
  - .claude/skills/
  - AGENTS.md
- Generated, disposable artifacts:
  - .orchestrate/* (except .orchestrate/README.md, which documents the folder)


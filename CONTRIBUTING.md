# Contributing to the harness

For changes to the harness itself. To build a product with it, start from the
[README](README.md). Detach removes this file from every project.

## Tests

Run both suites before a change merges. The harness has no build, type-check or lint step.

```
node --test ".claude/hooks/test/*.test.mjs"
node --test "scripts/**/*.test.mjs"
```

## Adding a file

Every tracked file belongs to one group in `.claude/harness.json`: `harness` files ship and update
with the harness, `project` files belong to the product after setup, and `dev` files are removed
by detach, except those in `setup`, which `--finish` removes. A `harness` file may name a `dev`
file only through the manifest's `references` list.

## Changing the instruction files

The rules are in `.claude/instruction-files.md`; a hook shows them before the first edit of such a
file in a session.

## Changing the hooks

Any change to `.claude/hooks/` must pass the hooks suite before it merges. A broken hook blocks
every tool call, so change it in a worktree.

## Bumping the catalog

`catalog.lock` pins the template catalog. After bumping it, before merging:

1. Grep the harness text (`AGENTS.md`, `README.md`, `.claude/`, `.doc/`, `scripts/`) for the
   old version's paths, rule names and command names.
2. Update every hit to the new template's `AGENTS.md`, or record why it stays.
3. Run the hooks suite and `node scripts/verify.mjs` on a project generated from the new lock.

To try an unreleased catalog, use `--templates <path>` or `FULLSTACK_TEMPLATES_DIR`. Otherwise the
bootstrap clones the pinned catalog into `~/.cache/fullstack-templates/<version>/`;
`FULLSTACK_TEMPLATES_CACHE` overrides that directory.

## What setup leaves in a project

`node scripts/detach.mjs` removes the dev files outside `setup` and, in a clone, the harness's
commits. `node scripts/bootstrap.mjs --finish` then removes the `setup` files, leaving a generated
product `README.md` and the harness version in `.fullstack/harness.json`. `.claude/README.md`
ships to every project.

## Releasing the harness

1. Run both test suites.
2. Set `version` in `.claude/harness.json` in the release commit; between releases it reads
   `unreleased`.
3. Tag `vMAJOR.MINOR.PATCH` on `main` through the `cutting-a-release` skill.

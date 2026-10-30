# Contributing to the harness

For changes to the harness itself. To build a product with it, start from the
[README](README.md). Setup removes this file from every project.

## Tests

Run both suites before a change merges. The harness has no build, type-check or lint step.

```
node --test ".claude/hooks/test/*.test.mjs"
node --test "scripts/**/*.test.mjs"
```

## Adding a file

Every tracked file belongs to one group in `.claude/harness.json`: `harness` files ship and update
with the harness, `project` files belong to the product after setup, and `dev` files are removed at
setup. A `harness` file may name a `dev` file only through the manifest's `references` list.

## Changing the hooks

Any change to `.claude/hooks/` must pass the hooks suite before it merges. A broken hook blocks
every tool call, so make the change in a worktree, not in the live checkout.

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

The bootstrap's finish step (`node scripts/bootstrap.mjs --finish`) turns the clone into a product
repository. It leaves a generated product `README.md`, no harness tests or setup scripts, and the
harness version in `.fullstack/harness.json`. `.claude/README.md`, the harness manual, ships to
every project.

## Releasing the harness

1. Run both test suites.
2. Set `version` in `.claude/harness.json` in the release commit; between releases it reads
   `unreleased`.
3. Tag `vMAJOR.MINOR.PATCH` on `main` through the `cutting-a-release` skill.

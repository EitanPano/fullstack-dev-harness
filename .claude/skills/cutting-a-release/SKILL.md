---
name: cutting-a-release
description: Version and publish a release. Use when choosing a version number, deciding between MAJOR, MINOR and PATCH, naming a prerelease, writing release notes, or tagging a release.
---

# Cutting a Release

Creating a tag, merging or publishing needs explicit user approval every time
(`.claude/rules/git-workflow.md`).

## The version

Semantic Versioning, tagged `vMAJOR.MINOR.PATCH` on `main`; a prerelease reads `v2.0.0-rc.1`.

## Before tagging

1. The gates pass on the commit to tag. With a `.fullstack/catalog.yaml`,
   `node scripts/verify.mjs --out .orchestrate/release` exits 0 (in the background: it outlives a
   foreground timeout). Without one, the repository's test suites pass.
2. Release notes summarize user-visible changes and name breaking behaviour.
3. Each shipped plan says `Status: done`, open items under `Changes during the task`: `active`
   means unfinished.
4. The user has explicitly approved the tag.

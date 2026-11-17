// The harness's Markdown prompts, the files the guidance hook gates. The product's `.doc/` and a
// package's `AGENTS.md` (from the catalog) are the project's own text and stay out. One set of
// patterns for the hook and the docs test; a path is classified by its spelling alone.
import process from 'node:process'

import { toRegExp } from '../../../scripts/verify/glob.mjs'

export const INCLUDE = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/**/*.md',
  '.github/copilot-instructions.md'
]
// The README template becomes the product's README, which is written for people.
export const EXCLUDE = ['**/node_modules/**', '.claude/skills/bootstrap-project/readme-template.md']

// Windows paths fold case, as the write lanes do.
const flags = process.platform === 'win32' ? 'i' : ''
const compile = globs => globs.map(glob => new RegExp(toRegExp(glob).source, flags))
const include = compile(INCLUDE)
const exclude = compile(EXCLUDE)
// A worktree is another checkout of the same files, so the rest of its path decides.
const WORKTREE = /^\.claude\/worktrees\/[^/]+\//i

// `rel` is project-relative; backslashes read as slashes.
export function isInstructionFile(rel) {
  const file = rel.replaceAll('\\', '/').replace(WORKTREE, '')
  const hit = patterns => patterns.some(pattern => pattern.test(file))
  return hit(include) && !hit(exclude)
}

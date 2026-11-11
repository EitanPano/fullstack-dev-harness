// Every path the scaffold writes, deletes or runs in comes from a generated file list, a
// provenance file or a state file; none of them may reach outside the project root.
import path from 'node:path'
import { ScaffoldError } from './request.mjs'

// A relative POSIX path: no drive letter, backslash, NUL, absolute form or `..` segment.
export function safeRelative(rel, what = 'path') {
  const bad =
    typeof rel !== 'string' ||
    rel === '' ||
    rel.includes('\0') ||
    rel.includes('\\') ||
    rel.startsWith('/') ||
    /^[A-Za-z]:/.test(rel) ||
    path.isAbsolute(rel) ||
    rel.split('/').includes('..')
  if (bad) throw new ScaffoldError(`unsafe ${what} ${JSON.stringify(rel)}: outside the project`)
  return rel
}

export function assertConfined(root, rels, what = 'path') {
  const base = path.resolve(root)
  for (const rel of rels) {
    safeRelative(rel, what)
    const inside = path.relative(base, path.resolve(base, rel))
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
      throw new ScaffoldError(`unsafe ${what} ${JSON.stringify(rel)}: outside the project`)
    }
  }
}

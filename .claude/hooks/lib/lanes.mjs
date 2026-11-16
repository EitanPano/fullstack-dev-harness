// Recorded write lanes: a strict reader for `packages.<name>.lanes` in .fullstack/catalog.yaml.
// - Node built-ins only and independent of scripts/, so a broken scripts/ cannot weaken a hook.
// - It understands exactly one shape: a `packages:` map, each package's `lanes:` map, and per
//   role an inline `[a, b]` list or a block `- a` list. Comments and quoted scalars are fine.
//   Anything else inside a package's `lanes` drops that package's lanes, never guesses.
// - Whatever it returns is confined (see confinedLanes) before a hook uses it.
import fs from 'node:fs'
import path from 'node:path'

const ROLES = new Set(['backend', 'frontend', 'qa'])
const PACKAGE_KEY = /^[a-z][a-z0-9-]*$/
// First path segments that name the harness's own machinery; a lane never starts there.
const RESERVED = new Set(['.fullstack', '.claude', '.plan', '.orchestrate', '.git', '.doc'])

// The extra lanes of `role` under `root`, each prefixed with its package directory. Any problem
// reading the file means no extra lanes.
export function recordedLanes(root, role) {
  if (!ROLES.has(role)) return []
  try {
    const text = fs.readFileSync(path.join(root, '.fullstack', 'catalog.yaml'), 'utf8')
    return confinedLanes(parseLaneRecord(text), role)
  } catch {
    return []
  }
}

// `{ package: { role: [entry, …] } }` for the packages whose lanes parse cleanly; entries are
// raw strings, not yet checked. Returns {} when the file has no usable record.
export function parseLaneRecord(text) {
  const lines = logicalLines(text)
  if (lines === null) return {}
  const at = lines.findIndex(line => line.indent === 0 && /^packages\s*:$/.test(line.text))
  if (at === -1) return {}
  const body = []
  for (const line of lines.slice(at + 1)) {
    if (line.indent === 0) break
    body.push(line)
  }
  if (body.length === 0) return {}
  const pkgIndent = body[0].indent
  const found = []
  let current = null
  for (const line of body) {
    if (line.indent < pkgIndent) return {}
    if (line.indent === pkgIndent) {
      const entry = keyValue(line.text)
      current = entry !== null && entry.value === '' ? { name: entry.key, rows: [] } : null
      if (current !== null) found.push(current)
    } else if (current !== null) {
      current.rows.push(line)
    }
  }
  const out = []
  for (const { name, rows } of found) {
    const roles = rolesOf(rows)
    if (roles !== null) out.push([name, roles])
  }
  return Object.fromEntries(out)
}

// The role map of one package's rows, or null when it has no lanes or they are malformed.
function rolesOf(own) {
  if (own.length === 0) return null
  const inner = own[0].indent
  const lanesAt = own.findIndex(line => line.indent === inner && /^lanes\s*:$/.test(line.text))
  if (lanesAt === -1) return null
  const rows = []
  for (const line of own.slice(lanesAt + 1)) {
    if (line.indent <= inner) break
    rows.push(line)
  }
  if (rows.length === 0) return null
  const roleIndent = rows[0].indent
  const roles = new Map()
  let list = null
  let block = false
  for (const row of rows) {
    if (row.indent === roleIndent && !/^-(\s|$)/.test(row.text)) {
      const entry = keyValue(row.text)
      if (entry === null || roles.has(entry.key)) return null
      block = entry.value === ''
      list = block ? [] : inlineList(entry.value)
      if (list === null) return null
      roles.set(entry.key, list)
    } else if (block && /^-\s+\S/.test(row.text)) {
      const item = scalar(row.text.replace(/^-\s+/, ''))
      if (item === null) return null
      list.push(item)
    } else {
      return null
    }
  }
  return Object.fromEntries(roles)
}

// Non-blank lines without comments, as { indent, text }; null when a tab indents one.
function logicalLines(text) {
  const out = []
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const stripped = stripComment(raw).replace(/\s+$/, '')
    if (stripped.trim() === '') continue
    if (/^\s*\t/.test(stripped)) return null
    const indent = stripped.length - stripped.trimStart().length
    out.push({ indent, text: stripped.trimStart() })
  }
  return out
}

// A `#` starts a comment at the line start or after whitespace, outside quotes.
function stripComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i)
    }
  }
  return line
}

// `name:` or `name: value`; the name is quoted, or bare with no spaces, colons or brackets.
function keyValue(text) {
  const match =
    /^("[^"]*"|'[^']*'|[^\s:'"[\]{},#&*!|>%@`-][^\s:'"[\]{},]*)\s*:(?:\s+(.*))?$/.exec(text)
  if (match === null) return null
  const first = match[1][0]
  const bare = first !== '"' && first !== "'"
  return { key: bare ? match[1] : match[1].slice(1, -1), value: (match[2] ?? '').trim() }
}

// One scalar: a quoted string, or a bare word with no flow syntax in it. Null when it is neither.
function scalar(text) {
  const value = text.trim()
  if (value === '') return null
  if (value.length >= 2 && /^(["']).*\1$/.test(value)) return value.slice(1, -1)
  // Block-scalar and quoting syntax is refused; a stray `*` or `&` is just a name that confinement
  // rejects.
  if (/^["']/.test(value) || /[[\]{}]/.test(value) || /^[|>`]/.test(value)) return null
  return value
}

// `[a, "b c", 'd']` as strings, or null for anything else (a nested list, a bare scalar, a
// list that does not close).
function inlineList(text) {
  if (!text.startsWith('[') || !text.endsWith(']')) return null
  const inner = text.slice(1, -1)
  if (inner.trim() === '') return []
  const items = []
  let current = ''
  let quote = null
  for (const char of inner) {
    if (quote !== null) {
      if (char === quote) quote = null
      current += char
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (char === ',') {
      items.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (quote !== null) return null
  items.push(current)
  const out = []
  for (const item of items) {
    const value = scalar(item)
    if (value === null) return null
    out.push(value)
  }
  return out
}

// The recorded lanes of `role`, prefixed with their package. Only a plain relative path inside
// a plainly named package is kept; the rest is dropped one by one.
export function confinedLanes(record, role) {
  if (!ROLES.has(role)) return []
  const out = []
  for (const [pkg, roles] of Object.entries(record)) {
    if (!PACKAGE_KEY.test(pkg) || !Object.hasOwn(roles, role)) continue
    for (const entry of roles[role]) {
      if (isPlainEntry(entry)) out.push(`${pkg}/${entry}`)
    }
  }
  return out
}

function isPlainEntry(entry) {
  if (typeof entry !== 'string' || entry === '' || entry !== entry.trim()) return false
  // Drive letters and streams (`:`), backslashes, globs and control characters.
  if (/[:\\*?\u0000-\u001f]/.test(entry) || entry.startsWith('/')) return false
  const segments = (entry.endsWith('/') ? entry.slice(0, -1) : entry).split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return false
  return !RESERVED.has(segments[0].toLowerCase())
}

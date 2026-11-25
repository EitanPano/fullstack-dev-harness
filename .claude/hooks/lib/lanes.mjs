// Derived write lanes: a strict reader for each package's `template:` in .fullstack/catalog.yaml.
// - Node built-ins only and independent of scripts/, so a broken scripts/ cannot weaken a hook.
// - It understands exactly one shape: a `packages:` map whose keys are one or two plain
//   segments and whose entries carry `template: <kind>/<id>` (block, or inside `{ … }`).
//   Anything else drops that package, never guesses. A `lanes:` map is ignored.
// - The lane follows the template kind: server and serverless are the backend's, frontend and
//   sdk the frontend's, and all four have a `tests/` folder for qa.
import fs from 'node:fs'
import path from 'node:path'

const ROLES = new Set(['backend', 'frontend', 'qa'])
const SEGMENT = /^[a-z][a-z0-9-]*$/
const TEMPLATE = /^([a-z][a-z0-9-]*)\/\S+$/
// Directories of the harness or the project that are no generated package: a package key never
// starts with one, so a record cannot turn `scripts/` or `db/` into a lane.
const NOT_PACKAGES = new Set([
  '.fullstack', '.claude', '.plan', '.orchestrate', '.git', '.doc', 'scripts', 'db', 'docs',
  'node_modules'
])

// The derived lanes of `role` under `root`, each a package directory. Any problem reading the
// file means no extra lanes.
export function recordedLanes(root, role) {
  if (!ROLES.has(role)) return []
  try {
    const text = fs.readFileSync(path.join(root, '.fullstack', 'catalog.yaml'), 'utf8')
    return lanesFor(parsePackages(text), role)
  } catch {
    return []
  }
}

// `[{ dir, kind }]` for the packages whose key and template parse cleanly; a package nested
// under another recorded package's directory is dropped. Returns [] when there is no record.
export function parsePackages(text) {
  const lines = logicalLines(text)
  if (lines === null) return []
  const at = lines.findIndex(line => line.indent === 0 && /^packages\s*:$/.test(line.text))
  if (at === -1) return []
  const body = []
  for (const line of lines.slice(at + 1)) {
    if (line.indent === 0) break
    body.push(line)
  }
  if (body.length === 0) return []
  const pkgIndent = body[0].indent
  const found = []
  let current = null
  for (const line of body) {
    if (line.indent < pkgIndent) return []
    if (line.indent === pkgIndent) {
      const entry = keyValue(line.text)
      current = entry === null ? null : { key: entry.key, value: entry.value, rows: [] }
      if (current !== null) found.push(current)
    } else if (current !== null) {
      current.rows.push(line)
    }
  }
  const out = []
  for (const { key, value, rows } of found) {
    if (!isPackageKey(key)) continue
    const kind = kindOf(value === '' ? blockTemplate(rows) : inlineTemplate(value))
    if (kind !== null) out.push({ dir: key, kind })
  }
  return out.filter(
    pkg => !out.some(other => other !== pkg && pkg.dir.startsWith(`${other.dir}/`))
  )
}

// The `template:` value of a block package, or null when it is missing, repeated or empty.
function blockTemplate(own) {
  if (own.length === 0) return null
  const inner = own[0].indent
  const values = own
    .filter(line => line.indent === inner && /^template\s*:/.test(line.text))
    .map(line => keyValue(line.text))
  if (values.length !== 1 || values[0] === null) return null
  return unquoted(values[0].value)
}

// The `template` of a flow mapping `{ template: x, … }`, or null.
function inlineTemplate(value) {
  if (!value.startsWith('{') || !value.endsWith('}')) return null
  const all = [
    ...value.matchAll(/[{,]\s*template\s*:\s*("[^"]*"|'[^']*'|[^,}\s]+)\s*(?=[,}])/g)
  ]
  return all.length === 1 ? unquoted(all[0][1]) : null
}

function unquoted(value) {
  const text = value.trim()
  return /^(["']).*\1$/.test(text) ? text.slice(1, -1) : text
}

function kindOf(template) {
  if (typeof template !== 'string') return null
  return TEMPLATE.exec(template)?.[1] ?? null
}

// One or two plain segments, the first not a harness directory.
function isPackageKey(key) {
  const segments = key.split('/')
  if (segments.length > 2 || !segments.every(segment => SEGMENT.test(segment))) return false
  return !NOT_PACKAGES.has(segments[0])
}

// The lanes of `role`: the package directory itself for the backend and the frontend, its
// `tests/` folder for qa. Any other template kind gains nothing.
export function lanesFor(packages, role) {
  if (!ROLES.has(role)) return []
  const backend = kind => kind === 'server' || kind === 'serverless'
  const frontend = kind => kind === 'frontend' || kind === 'sdk'
  const out = []
  for (const { dir, kind } of packages) {
    if (role === 'backend' && backend(kind)) out.push(`${dir}/`)
    else if (role === 'frontend' && frontend(kind)) out.push(`${dir}/`)
    else if (role === 'qa' && (backend(kind) || frontend(kind))) out.push(`${dir}/tests/`)
  }
  return out
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

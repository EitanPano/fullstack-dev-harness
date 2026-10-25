// Clears what a product must not inherit from the harness: its own plans and the auth text
// that does not apply when the product has no accounts. Called by bootstrap.mjs after the
// generator ran, or by hand: `node scripts/history.mjs <root> [--auth=false]`.
//
// Markers in `.doc/` files:
//   ... <!-- auth -->               a line (a table row's marker sits inside its last cell)
//   <!-- auth-start --> ... <!-- auth-end -->   a block
//   <!-- noauth: TEXT -->           TEXT replaces the line when the product has no auth
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DOC_FILES = ['glossary.md', 'architecture.md']
const PLAN_FILE = /^\d{3}-.+\.md$/
// Only a marker at the end of the line's content (before a table row's closing `|`) is inline;
// any other spelling stays in the text and the post-condition in resolveAuthMarkers rejects it.
const INLINE = / ?<!-- auth\s*-->(?=\s*(?:\|\s*)?$)/
const LEFTOVER = /<!--\s*(?:no)?auth|auth-(?:start|end)/
const BLOCK_START = /^\s*<!-- auth-start -->\s*$/
const BLOCK_END = /^\s*<!-- auth-end -->\s*$/
const NOAUTH = /^(\s*)<!-- noauth: (.*) -->\s*$/

export function resolveAuthMarkers(text, auth) {
  const eol = text.match(/\r?\n/)?.[0] === '\r\n' ? '\r\n' : '\n'
  const out = []
  let inBlock = false
  for (const line of text.split(/\r?\n/)) {
    if (BLOCK_START.test(line)) {
      if (inBlock) throw new Error('nested <!-- auth-start --> inside an open auth block')
      inBlock = true
    } else if (BLOCK_END.test(line)) {
      if (!inBlock) throw new Error('stray <!-- auth-end --> with no open auth block')
      inBlock = false
    } else if (inBlock) {
      if (auth) out.push(line)
    } else if (NOAUTH.test(line)) {
      const [, indent, body] = line.match(NOAUTH)
      if (!auth) out.push(indent + body)
    } else if (INLINE.test(line)) {
      if (auth) out.push(line.replace(INLINE, ''))
    } else {
      out.push(line)
    }
  }
  if (inBlock) throw new Error('unclosed <!-- auth-start --> block: no <!-- auth-end --> found')
  const result = out.join(eol)
  const left = LEFTOVER.exec(result)
  if (left !== null) {
    const shown = result.slice(left.index).split(/\r?\n/)[0].slice(0, 60)
    throw new Error(`an auth marker is misspelled or not at the end of its line: ${shown}`)
  }
  return result
}

// The plan files git tracks and has not modified, or null when `root` is not the top of a git
// repository. A plan the product wrote itself (untracked or edited) is never the harness's.
function pristinePlans(root) {
  const git = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const prefix = git(['rev-parse', '--show-prefix'])
  if (prefix.status !== 0 || prefix.stdout.trim() !== '') return null
  const tracked = git(['ls-files', '-z', '--', '.plan'])
  const status = git(['status', '--porcelain', '-z', '--', '.plan'])
  if (tracked.status !== 0 || status.status !== 0) return null
  const changed = new Set(status.stdout.split('\0').map((entry) => entry.slice(3)))
  return new Set(tracked.stdout.split('\0').filter((file) => file !== '' && !changed.has(file)))
}

export function clearHarnessHistory(root, { auth }) {
  const removedPlans = []
  const keptPlans = []
  const docs = []
  // Resolve every text before touching anything, so a malformed marker leaves the tree as is.
  const writes = []
  for (const name of DOC_FILES) {
    const file = path.join(root, '.doc', name)
    if (!existsSync(file)) continue
    const before = readFileSync(file, 'utf8')
    const after = resolveAuthMarkers(before, auth)
    if (after !== before) writes.push({ file, after, rel: `.doc/${name}` })
  }
  const planDir = path.join(root, '.plan')
  if (existsSync(planDir)) {
    const pristine = pristinePlans(root)
    for (const name of readdirSync(planDir).sort()) {
      if (!PLAN_FILE.test(name) || name === '000-backlog.md') continue
      const rel = `.plan/${name}`
      if (pristine?.has(rel)) {
        rmSync(path.join(planDir, name))
        removedPlans.push(rel)
      } else {
        keptPlans.push(rel)
      }
    }
  }
  for (const { file, after, rel } of writes) {
    writeFileSync(file, after)
    docs.push(rel)
  }
  return { removedPlans, keptPlans, docs }
}

export function authFlagFrom(provenancePath) {
  if (!existsSync(provenancePath)) return true
  const lines = readFileSync(provenancePath, 'utf8').split(/\r?\n/)
  return !lines.some((line) => /^\s+auth:\s*false\s*$/.test(line))
}

// Run by hand to finish what bootstrap.mjs could not (a marker it refused, once fixed).
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const [root, ...flags] = process.argv.slice(2)
  if (root === undefined) {
    console.error('usage: node scripts/history.mjs <root> [--auth=false]')
    process.exit(2)
  }
  const auth = flags.includes('--auth=false')
    ? false
    : flags.includes('--auth=true') || authFlagFrom(path.join(root, '.fullstack', 'catalog.yaml'))
  try {
    const { removedPlans, keptPlans, docs } = clearHarnessHistory(root, { auth })
    for (const file of removedPlans) console.log(`  removed ${file}`)
    for (const file of keptPlans) console.log(`  kept (not tracked or modified) ${file}`)
    for (const file of docs) console.log(`  resolved the auth markers in ${file}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

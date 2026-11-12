// Clears what a product must not inherit from the harness: its own plans and the auth text
// that does not apply when the product has no accounts. Called by bootstrap.mjs after the
// generator ran, or by hand: `node scripts/history.mjs <root> [--auth=false]`.
//
// Markers in `.doc/` files:
//   ... <!-- auth -->               a line (a table row's marker sits inside its last cell)
//   <!-- auth-start --> ... <!-- auth-end -->   a block
//   <!-- noauth: TEXT -->           TEXT replaces the line when the product has no auth
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  buildRecord,
  filesIn,
  groupsOf,
  loadManifest,
  trackedFiles,
  writeRecord,
} from './manifest.mjs'
import { renderConfiguration, renderPackageBlocks } from './readme.mjs'

export const MIN_NODE = 24
export const MIN_BUN = [1, 4]

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

// Auth is on only when a package's `flags` block says `auth: true`; a project without a server
// (or an unreadable file) has no accounts, so its auth text is cleared.
export function authFlagFrom(provenancePath) {
  if (!existsSync(provenancePath)) return false
  let flagsIndent
  for (const line of readFileSync(provenancePath, 'utf8').split(/\r?\n/)) {
    const indent = /^\s*/.exec(line)[0].length
    if (/^\s+flags:\s*$/.test(line)) flagsIndent = indent
    else if (line.trim() !== '' && flagsIndent !== undefined && indent <= flagsIndent) {
      flagsIndent = undefined
    }
    const authLine = /^\s+auth:\s*true\s*(#.*)?$/.test(line)
    if (flagsIndent !== undefined && indent > flagsIndent && authLine) {
      return true
    }
  }
  return false
}

const gitIn = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })

// The brand display name the generator recorded under `answers.brand`, if any.
function displayNameOf(catalogFile) {
  if (!existsSync(catalogFile)) return undefined
  const text = readFileSync(catalogFile, 'utf8').replace(/\r\n/g, '\n')
  const brand = /^ {2}brand:\s*\n((?: {4}.*\n?)*)/m.exec(text)
  const name = brand && /^ {4}displayName:\s*(.+?)\s*$/m.exec(brand[1])
  return name ? name[1].replace(/^['"]|['"]$/g, '') : undefined
}

// Fills the template's `{{token}}`s from the catalog; a token left over is a bug, not output.
export function writeProjectReadme(root, name, templateFile, catalogRoot) {
  const catalogFile = path.join(root, '.fullstack', 'catalog.yaml')
  const values = {
    name: displayNameOf(catalogFile) ?? name,
    ...renderPackageBlocks(root, catalogRoot, { name }),
    configuration: renderConfiguration(root),
    license: existsSync(path.join(root, 'LICENSE'))
      ? 'See [LICENSE](LICENSE).'
      : 'No license has been chosen yet.',
  }
  const text = readFileSync(templateFile, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\{([\w-]+)\}\}/g, (token, key) => {
      if (!(key in values)) throw new Error(`the README template has an unknown token ${token}`)
      return values[key]
    })
  writeFileSync(path.join(root, 'README.md'), text.replace(/\n{3,}/g, '\n\n'))
}

const DEV_BLOCK_START = '# >>> harness-dev: removed at setup'
const DEV_BLOCK_END = '# <<< harness-dev'

function withoutDevBlock(text) {
  const lines = text.split(/\r?\n/)
  const from = lines.findIndex((line) => line.trim() === DEV_BLOCK_START)
  if (from === -1) return undefined
  const to = lines.findIndex((line, i) => i > from && line.trim() === DEV_BLOCK_END)
  if (to === -1) throw new Error(`.gitignore: "${DEV_BLOCK_START}" has no "${DEV_BLOCK_END}"`)
  lines.splice(from, to - from + 1)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return `${lines.join('\n')}\n`
}

// Tracked in HEAD and untouched there, so a file the product changed or added is never removed.
// `touched` is what differs from HEAD, staged or not.
function headState(root) {
  const head = gitIn(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD'])
  const changed = gitIn(root, ['diff', '-z', '--no-renames', '--name-only', 'HEAD'])
  const touched = new Set(changed.stdout.split('\0').filter(Boolean))
  const inHead = head.stdout.split('\0').filter(Boolean)
  return { touched, pristine: new Set(inHead.filter((file) => !touched.has(file))) }
}

function untrackedFiles(root) {
  const out = gitIn(root, ['ls-files', '-z', '--others', '--exclude-standard'])
  return out.stdout.split('\0').filter(Boolean)
}

function removeEmptyParents(root, file) {
  const top = path.resolve(root)
  for (let dir = path.dirname(path.resolve(root, file)); dir !== top; dir = path.dirname(dir)) {
    try {
      rmdirSync(dir)
    } catch {
      return
    }
  }
}

// Turns the bootstrapped clone into the product: the harness version record, no dev files, no
// dev ignore block. Everything is checked first so a refusal leaves the tree as it was.
export function finishProject(root) {
  const actions = []
  const warnings = []
  if (!existsSync(path.join(root, '.fullstack', 'catalog.yaml'))) {
    throw new Error('.fullstack/catalog.yaml is missing: this is not a bootstrapped project')
  }
  const readme = path.join(root, 'README.md')
  if (!existsSync(readme)) throw new Error('README.md is missing: write it before --finish')
  const marker = /<!--\s*readme:[^>]*-->/.exec(readFileSync(readme, 'utf8'))
  if (marker !== null) {
    throw new Error(`README.md still holds the placeholder ${marker[0]}: replace it first`)
  }
  const manifest = loadManifest(root)
  const gitignore = path.join(root, '.gitignore')
  const trimmed = existsSync(gitignore)
    ? withoutDevBlock(readFileSync(gitignore, 'utf8'))
    : undefined

  // Without a HEAD there is no way to tell the harness's files from the product's changes.
  const head = gitIn(root, ['rev-parse', 'HEAD'])
  if (head.status !== 0) {
    throw new Error(
      'the repository has no commit: commit the untouched harness as the root commit first, ' +
        'then run --finish',
    )
  }
  const sha = head.stdout.trim()
  const ancestor = gitIn(root, ['merge-base', '--is-ancestor', manifest.rootCommit, 'HEAD'])
  const kept = ancestor.status === 0
  const files = trackedFiles(root)
  const harnessFiles = filesIn(manifest, 'harness', files)
  if (harnessFiles.length === 0) {
    throw new Error('no harness files are tracked in this repository: nothing to record')
  }
  const { touched, pristine } = headState(root)
  // A dev file already gone from disk (bootstrap removed it) is neither removed nor kept.
  const devFiles = filesIn(manifest, 'dev', [...files, ...untrackedFiles(root)]).filter((file) =>
    existsSync(path.join(root, file)),
  )
  const removable = devFiles.filter(
    (file) => pristine.has(file) && groupsOf(manifest, file).length === 1,
  )

  const record = buildRecord(root, manifest, {
    commit: kept ? sha : null,
    files: harnessFiles,
  })
  writeRecord(root, record)
  actions.push(`wrote .fullstack/harness.json (${Object.keys(record.files).length} files)`)
  if (trimmed !== undefined) {
    writeFileSync(gitignore, trimmed)
    actions.push('removed the harness-dev block from .gitignore')
  }
  for (const file of removable) {
    rmSync(path.join(root, file))
    removeEmptyParents(root, file)
    actions.push(`removed ${file}`)
  }
  for (const file of devFiles.filter((file) => !removable.includes(file))) {
    actions.push(`kept ${file} (modified, untracked or also in another group)`)
  }
  for (const file of harnessFiles.filter((file) => touched.has(file))) {
    warnings.push(
      `${file} differs from HEAD but is recorded as shipped, so the next update treats it as ` +
        'harness content',
    )
  }
  if (kept) {
    warnings.push(
      "this history holds the harness's own commits. To start the project with a fresh one, " +
        'create it from the GitHub "Use this template" button instead of cloning.',
    )
  }
  return { actions, warnings }
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

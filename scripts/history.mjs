// Clears the auth text that does not apply when the product has no accounts. Called by
// bootstrap.mjs after the generator ran, or by hand:
// `node scripts/history.mjs <root> [--auth=false]`.
//
// The markers it resolves are described in auth-markers.mjs.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
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
import { resolveAuthMarkers } from './auth-markers.mjs'
import { authFlagFrom, kindOf, readProvenance } from './provenance.mjs'
import { renderConfiguration, renderPackageBlocks } from './readme.mjs'

export const MIN_NODE = 24
export const MIN_BUN = [1, 4]

const DOC_FILES = ['.doc/glossary.md', '.doc/architecture.md']

// A server or serverless package's own architecture file, when it exists.
function packageArchitectures(root) {
  const catalog = path.join(root, '.fullstack', 'catalog.yaml')
  return readProvenance(catalog)
    .packages.filter(({ template }) => ['server', 'serverless'].includes(kindOf(template)))
    .map(({ dir }) => `${dir}/.doc/architecture.md`)
}

export function resolveAuthText(root, { auth }) {
  const docs = []
  // Resolve every text before touching anything, so a malformed marker leaves the tree as is.
  const writes = []
  for (const rel of [...DOC_FILES, ...packageArchitectures(root)]) {
    const file = path.join(root, rel)
    if (!existsSync(file)) continue
    const before = readFileSync(file, 'utf8')
    const after = resolveAuthMarkers(before, auth)
    if (after !== before) writes.push({ file, after, rel })
  }
  for (const { file, after, rel } of writes) {
    writeFileSync(file, after)
    docs.push(rel)
  }
  return { docs }
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
  const files = trackedFiles(root)
  const harnessFiles = filesIn(manifest, 'harness', files)
  if (harnessFiles.length === 0) {
    throw new Error('no harness files are tracked in this repository: nothing to record')
  }
  const { touched, pristine } = headState(root)
  // A dev file already gone from disk (detach removed it) is neither removed nor kept.
  const devFiles = filesIn(manifest, 'dev', [...files, ...untrackedFiles(root)]).filter((file) =>
    existsSync(path.join(root, file)),
  )
  const removable = devFiles.filter(
    (file) => pristine.has(file) && groupsOf(manifest, file).length === 1,
  )

  const record = buildRecord(root, manifest, {
    commit: null,
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
    const { docs } = resolveAuthText(root, { auth })
    for (const file of docs) console.log(`  resolved the auth markers in ${file}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

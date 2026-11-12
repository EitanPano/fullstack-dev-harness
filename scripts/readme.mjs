// The generated blocks of a project's README. `--configuration` rewrites the Configuration table
// (from the tracked example env files) between its two marker lines; `--packages` rewrites the
// Prerequisites, Installation, Usage and Running Tests blocks (from `.fullstack/catalog.yaml` and
// the catalog's template `tools:` lists). The full `verify` run fails when the table is stale.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { defaultCacheRoot, locateCatalog } from './catalog.mjs'
import { readProvenance } from './provenance.mjs'
import { isMain } from './verify/main.mjs'

export const START = '<!-- configuration:start -->'
export const END = '<!-- configuration:end -->'
const USAGE =
  'usage: node scripts/readme.mjs [--configuration] [--packages [--templates <path>]] ' +
  '[--root <dir>]'
// The blocks `--packages` owns, in README order; each sits between `<!-- NAME:start -->` and
// `<!-- NAME:end -->` lines.
export const PACKAGE_BLOCKS = ['prerequisites', 'installation', 'usage', 'usage-notes', 'tests']
const EXAMPLE = '.env.example'
const NONE = 'This project reads no environment variables.'
const OPTIONAL = /^#\s?([A-Z][A-Z0-9_]*)=(.*)$/
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

// A value that is empty or a `change-me` placeholder is not a default worth showing.
function cleanValue(raw) {
  let value = raw.trim()
  if (/^(['"]).*\1$/.test(value) && value.length >= 2) value = value.slice(1, -1)
  return value === '' || value.startsWith('change-me') ? undefined : value
}

// Comment lines directly above a variable describe it; a blank line turns them into a header.
export function parseEnvExample(text) {
  const variables = []
  let pending = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    const optional = OPTIONAL.exec(trimmed)
    const assignment = ASSIGNMENT.exec(trimmed)
    if (trimmed === '') pending = []
    else if (optional || assignment) {
      const [, name, raw] = optional ?? assignment
      const description = pending.join(' ')
      variables.push({ name, description, value: cleanValue(raw), optional: Boolean(optional) })
      pending = []
    } else if (trimmed.startsWith('#')) {
      const text = trimmed.replace(/^#\s?/, '').trim()
      if (text !== '') pending.push(text)
    } else pending = []
  }
  return variables
}

function trackedExamples(root) {
  // Untracked files that are not ignored count too: verify judges the tree as `git add -A` sees it.
  const run = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (run.status !== 0) throw new Error(`git could not list files in ${root}`)
  return [...new Set(run.stdout.split('\0'))]
    .filter((file) => file === EXAMPLE || file.endsWith(`/${EXAMPLE}`))
    // A file deleted from the working tree but not yet staged is still listed.
    .filter((file) => existsSync(path.join(root, file)))
    .sort()
}

const cell = (text) => text.replaceAll('|', '\\|')

export function renderConfiguration(root) {
  const files = trackedExamples(root)
  if (files.length === 0) return [START, NONE, END].join('\n')
  const rows = ['| Variable | Description | Default |', '| --- | --- | --- |']
  for (const file of files) {
    const dir = path.posix.dirname(file)
    const prefix = files.length > 1 && dir !== '.' ? `${dir}: ` : ''
    const text = readFileSync(path.join(root, file), 'utf8')
    for (const v of parseEnvExample(text)) {
      const shown = v.value === undefined ? undefined : `\`${cell(v.value)}\``
      let fallback = shown ?? '—'
      if (v.optional) fallback = shown === undefined ? 'optional' : `optional (example ${shown})`
      rows.push(`| \`${v.name}\` | ${cell(prefix + v.description)} | ${fallback} |`)
    }
  }
  return [START, ...rows, END].join('\n')
}

function markerLines(lines, start = START, end = END) {
  const at = (marker) => lines.flatMap((l, i) => (l.trim() === marker ? [i] : []))
  const starts = at(start)
  const ends = at(end)
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(`README.md needs exactly one ${start} and one ${end} marker line`)
  }
  if (ends[0] < starts[0]) throw new Error(`the ${end} marker comes before ${start}: wrong order`)
  return [starts[0], ends[0]]
}

// The block as it stands in the README, line endings normalised to LF.
export function extractConfiguration(readmeText) {
  const lines = readmeText.split(/\r?\n/)
  const [from, to] = markerLines(lines)
  return lines.slice(from, to + 1).join('\n')
}

export function replaceConfiguration(readmeText, block) {
  const eol = readmeText.includes('\r\n') ? '\r\n' : '\n'
  const lines = readmeText.split(/\r?\n/)
  const [from, to] = markerLines(lines)
  lines.splice(from, to - from + 1, ...block.split('\n'))
  return lines.join(eol)
}

const gitIn = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })

// Every command comes resolved from the catalog and runs inside its package's folder. One
// `cd` per package keeps the lines valid in bash and PowerShell alike (no `&&`, no subshell).
function packageBlock(pkg, commands) {
  const lines = commands.flatMap((name) => (pkg.commands[name] ?? '').split('\n')).filter(Boolean)
  return lines.length === 0 ? [] : [`# ${pkg.dir}`, `cd ${pkg.dir}`, ...lines, 'cd ..']
}

const fenced = (lines) => (lines.length === 0 ? '' : `\`\`\`bash\n${lines.join('\n')}\n\`\`\``)

// The tools a template declares in its `tools:` list (`- { name: uv, min: '0.12.23' }`), read
// from the catalog checkout, so no stack or template name is spelled here.
function templateTools(catalogRoot, template) {
  const file = path.join(catalogRoot, template, 'template.yaml')
  if (!existsSync(file)) return []
  const tools = []
  let inList = false
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^tools:\s*$/.test(line)) inList = true
    else if (inList && /^\s+-\s/.test(line)) {
      const name = /\bname:\s*['"]?([\w.-]+)/.exec(line)?.[1]
      const min = /\bmin:\s*['"]?([\w.+-]+)/.exec(line)?.[1]
      if (name !== undefined) tools.push({ name, min })
    } else if (inList && /^\S/.test(line)) break
  }
  return tools
}

function prerequisites(root, packages, catalogRoot) {
  const seen = new Map()
  for (const pkg of packages) {
    if (catalogRoot === undefined) break
    for (const tool of templateTools(catalogRoot, pkg.template)) {
      if (!seen.has(tool.name)) seen.set(tool.name, tool)
    }
  }
  const lines = [...seen.values()].map(({ name, min }) => `- ${name}${min ? ` ${min}+` : ''}`)
  lines.push('- git')
  if (existsSync(path.join(root, 'docker-compose.yml'))) lines.push('- Docker with Compose v2')
  return lines.join('\n')
}

const normalizedUrl = (url) =>
  url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')

// An origin that is a local path or the harness itself (a plain `git clone` of it) is not the
// product's repository, so the README shows a placeholder instead of leaking it.
function repositoryUrl(root) {
  const remote = gitIn(root, ['remote', 'get-url', 'origin'])
  const url = remote.status === 0 ? remote.stdout.trim() : ''
  if (url === '' || /^([a-z]:|\/|\.\.?\/|file:)/i.test(url)) return undefined
  try {
    const manifest = readFileSync(path.join(root, '.claude', 'harness.json'), 'utf8')
    const harness = JSON.parse(manifest).repository
    if (typeof harness === 'string' && normalizedUrl(harness) === normalizedUrl(url)) {
      return undefined
    }
  } catch {
    // No readable manifest: nothing to compare with, so the origin stands.
  }
  return url
}

// In development the app is the frontend's dev server, which proxies /api; only the Compose
// image of a `single` deploy serves the built frontend from the server's port.
function usageNotes(root, { deploy, packages }) {
  const server = packages.find((pkg) => pkg.template.startsWith('server/'))
  const frontend = packages.find((pkg) => pkg.template.startsWith('frontend/'))
  const port = (frontend ?? server)?.port
  const notes = []
  if (port !== undefined) notes.push(`Open http://localhost:${port} once the dev servers are up.`)
  if (existsSync(path.join(root, 'docker-compose.yml'))) {
    const composePort = (deploy === 'single' ? server : (frontend ?? server))?.port
    const where =
      composePort === undefined ? '' : ` (the app is then at http://localhost:${composePort})`
    notes.push(
      `To run the whole stack with Docker Compose${where}:\n\n` +
        '```bash\ndocker compose --profile app up --build\n```',
    )
  }
  return notes.join('\n\n')
}

const pairOf = (name) => [`<!-- ${name}:start -->`, `<!-- ${name}:end -->`]
const wrap = (name, body) => {
  const [start, end] = pairOf(name)
  return [start, ...(body === '' ? [] : [body]), end].join('\n')
}

// The git clone and cd lines of an existing Installation block, so a re-render keeps the
// directory name the bootstrap chose.
export function cloneLinesFrom(readmeText) {
  const lines = readmeText.split(/\r?\n/)
  const [start, end] = pairOf('installation')
  const from = lines.findIndex((line) => line.trim() === start)
  const to = lines.findIndex((line, i) => i > from && line.trim() === end)
  if (from === -1 || to === -1) return undefined
  const at = lines.slice(from, to).findIndex((line) => line.startsWith('git clone '))
  const cd = lines[from + at + 1]
  return at === -1 || !cd?.startsWith('cd ') ? undefined : [lines[from + at], cd]
}

// Each generated block as the README holds it, marker lines included. `name` is the project
// name (the clone directory when no origin gives one); `clone` pins the clone lines.
export function renderPackageBlocks(root, catalogRoot, { name, clone } = {}) {
  const { packages, deploy } = readProvenance(path.join(root, '.fullstack', 'catalog.yaml'))
  const url = repositoryUrl(root)
  const dir =
    (url ?? '')
      .replace(/\/+$/, '')
      .split(/[/:]/)
      .pop()
      ?.replace(/\.git$/, '') ||
    name ||
    path.basename(path.resolve(root))
  const blocks = (commands) => packages.flatMap((pkg) => packageBlock(pkg, commands))
  const dev = blocks(['dev'])
  const values = {
    prerequisites: prerequisites(root, packages, catalogRoot),
    installation: fenced([
      ...(clone ?? [`git clone ${url ?? '<repository-url>'}`, `cd ${dir}`]),
      ...blocks(['install']),
    ]),
    usage: fenced(dev.length === 0 ? [] : ['# Run each of these in its own terminal.', ...dev]),
    'usage-notes': usageNotes(root, { deploy, packages }),
    tests: fenced(blocks(['check', 'test', 'testE2e'])),
  }
  return Object.fromEntries(PACKAGE_BLOCKS.map((block) => [block, wrap(block, values[block])]))
}

// Swaps the lines between each named block's markers. Every marker is checked before any text
// changes, so a README missing one is refused whole.
export function replacePackageBlocks(readmeText, blocks) {
  const eol = readmeText.includes('\r\n') ? '\r\n' : '\n'
  const lines = readmeText.split(/\r?\n/)
  const spans = Object.keys(blocks).map((name) => {
    const [start, end] = pairOf(name)
    return { name, span: markerLines(lines, start, end) }
  })
  // Bottom-up, so an earlier splice never moves a later span.
  for (const { name, span } of spans.sort((a, b) => b.span[0] - a.span[0])) {
    lines.splice(span[0], span[1] - span[0] + 1, ...blocks[name].split('\n'))
  }
  return lines.join(eol)
}

function main(argv) {
  let root = process.cwd()
  let configuration = false
  let packages = false
  let templates
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--configuration') configuration = true
    else if (argv[i] === '--packages') packages = true
    else if (argv[i] === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else if (argv[i] === '--templates' && argv[i + 1] !== undefined) templates = argv[++i]
    else return fail(2, `unknown or incomplete argument ${argv[i]}\n${USAGE}`)
  }
  if (!configuration && !packages) return fail(2, USAGE)
  if (templates !== undefined && !packages) return fail(2, `--templates needs --packages\n${USAGE}`)
  const file = path.join(root, 'README.md')
  try {
    let text = readFileSync(file, 'utf8')
    if (packages) {
      // The lock's cached clone, or the override, exactly as the bootstrap finds it.
      const { catalog } = locateCatalog({
        harnessRoot: root,
        override: templates ?? process.env.FULLSTACK_TEMPLATES_DIR,
        cacheRoot: defaultCacheRoot(),
      })
      const clone = cloneLinesFrom(text)
      text = replacePackageBlocks(text, renderPackageBlocks(root, catalog, { clone }))
    }
    if (configuration) text = replaceConfiguration(text, renderConfiguration(root))
    writeFileSync(file, text)
  } catch (error) {
    const reason = error.code === 'ENOENT' ? `${error.path ?? file} does not exist` : error.message
    return fail(1, reason.split('\n')[0])
  }
  return 0
}

function fail(code, message) {
  console.error(message)
  return code
}

if (isMain(import.meta.url, process.argv[1])) process.exit(main(process.argv.slice(2)))

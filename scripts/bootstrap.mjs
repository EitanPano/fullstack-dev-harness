#!/usr/bin/env node
// Scaffolds a new project from this harness. Deterministic: the same inputs produce the
// same tree. Run once, from the repository root:
//
//   node scripts/bootstrap.mjs [--name <project-name>] [--auth full|none] [--skip-install]
//     [--root <dir>]
//
// Steps: check prerequisites → create-next-app (pinned) into frontend/ → overlay
// templates/frontend → copy templates/backend → copy templates/root → replace
// __PROJECT_NAME__ → apply the auth variant → install, generate the contract, format. `--root`
// targets another directory (used to validate the harness itself); `--skip-install` stops after
// the copy. `--auth full` (the default) keeps the template's working authentication; `--auth
// none` scaffolds a backend without it (see applyAuthVariant).
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CREATE_NEXT_APP = 'create-next-app@16.4.2'
const CREATE_NEXT_APP_FLAGS = [
  '--ts',
  '--tailwind',
  '--eslint',
  '--app',
  '--src-dir',
  '--import-alias',
  '@/*',
  '--use-bun',
  '--disable-git',
  '--no-agent-feedback',
  '--skip-install',
  '--yes'
]
const BOILERPLATE = ['public/file.svg', 'public/globe.svg', 'public/next.svg', 'public/vercel.svg', 'public/window.svg']
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.json', '.yml', '.yaml', '.md', '.toml', '.css', '.example'])
const MIN_BUN = [1, 4]
const MIN_NODE = 24

const AUTH_VARIANTS = ['full', 'none']

// Whole files and directories (relative to backend/) that only authentication uses. They are
// deleted for `--auth none`; a path that no longer exists fails the bootstrap, so the list
// cannot drift from the templates.
const AUTH_ONLY_PATHS = [
  'src/api/auth',
  'src/api/user',
  'src/infra/jobs/session-cleanup.ts',
  'src/infra/subscribers/send-welcome.ts',
  'src/middleware/auth.ts',
  'src/middleware/role.ts',
  'src/models/auth',
  'src/models/session',
  'src/models/user',
  'src/services/communicate/templates',
  'src/services/security/cookies.ts',
  'src/services/security/jwt.ts',
  'src/services/security/otp.ts',
  'src/services/session.ts',
  'tests/auth.test.ts',
  'tests/infra/send-welcome.test.ts',
  'tests/infra/session-cleanup.test.ts',
  'tests/middleware/auth.test.ts',
  'tests/middleware/role.test.ts',
  'tests/services/cookies.test.ts',
  'tests/services/jwt.test.ts',
  'tests/services/otp.test.ts',
  'tests/services/session.test.ts',
  'tests/user.test.ts',
]

// Packages (in backend/package.json) that only the files above use.
const AUTH_ONLY_DEPENDENCIES = {
  dependencies: ['cookie-parser', 'jose'],
  devDependencies: ['@types/cookie-parser'],
}

// A marker as written in a comment; plain text such as an `@auth/…` package scope is not one.
const MARKER = /(?:\/\/|#|<!--)[ \t]*@(?:no)?auth(?:-start|-end)?\b/

// Comment syntax of the files the marker pass rewrites: the opening token and, for Markdown,
// the closing one. Any other file is only checked for leftover markers.
const MARKER_COMMENTS = {
  '.ts': ['//', ''],
  '.tsx': ['//', ''],
  '.mts': ['//', ''],
  '.mjs': ['//', ''],
  '.js': ['//', ''],
  '.yml': ['#', ''],
  '.yaml': ['#', ''],
  '.example': ['#', ''],
  '.md': ['<!--', ' -->'],
}

const args = parseArgs(process.argv.slice(2))
const auth = args.auth ?? 'full'
const harnessRoot = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(args.root ?? harnessRoot)
const templates = path.join(harnessRoot, 'templates')
const projectName = toProjectName(args.name ?? path.basename(root))
const frontend = path.join(root, 'frontend')
const backend = path.join(root, 'backend')

main()

function main() {
  step('Checking prerequisites')
  checkPrerequisites()
  for (const dir of [frontend, backend]) {
    if (existsSync(dir)) fail(`${dir} already exists; the bootstrap runs once on an empty project`)
  }
  step('Checking the auth markers in templates/')
  checkTemplateMarkers()

  step(`Scaffolding frontend/ with ${CREATE_NEXT_APP}`)
  run('bun', ['x', CREATE_NEXT_APP, 'frontend', ...CREATE_NEXT_APP_FLAGS], root)
  for (const file of BOILERPLATE) rmSync(path.join(frontend, file), { force: true })

  step('Overlaying templates/frontend')
  cpSync(path.join(templates, 'frontend'), frontend, {
    recursive: true,
    filter: (source) => path.basename(source) !== 'package.partial.json'
  })
  mergePackageJson(
    path.join(frontend, 'package.json'),
    readJson(path.join(templates, 'frontend', 'package.partial.json')),
    `${projectName}-frontend`
  )

  step('Copying templates/backend')
  cpSync(path.join(templates, 'backend'), backend, { recursive: true })

  step('Copying templates/root (existing files are kept)')
  for (const entry of readdirSync(path.join(templates, 'root'))) {
    const target = path.join(root, entry)
    if (existsSync(target)) continue
    cpSync(path.join(templates, 'root', entry), target, { recursive: true })
  }

  step(`Naming the project "${projectName}"`)
  for (const dir of [frontend, backend]) replaceToken(dir)
  replaceToken(path.join(root, 'docker-compose.yml'))

  step(`Applying the auth variant "${auth}"`)
  applyAuthVariant()

  if (args.skipInstall) {
    step('Skipping install (--skip-install)')
    printNextSteps(true)
    return
  }

  step('Installing backend dependencies')
  run('bun', ['install'], backend)
  step('Installing frontend dependencies')
  run('bun', ['install'], frontend)
  step('Generating the API contract and its types')
  run('bun', ['run', 'openapi'], backend)
  run('bun', ['run', 'api:types'], frontend)
  step('Formatting')
  run('bun', ['run', 'format'], backend)
  run('bun', ['run', 'format'], frontend)

  printNextSteps(false)
}

function checkPrerequisites() {
  const node = Number(process.versions.node.split('.')[0])
  if (node < MIN_NODE) fail(`Node ${MIN_NODE} or newer is required (found ${process.versions.node})`)

  const bunCommand = resolveCommand('bun')
  const bun = spawnSync(bunCommand.file, [...bunCommand.prefix, '--version'], { encoding: 'utf8' })
  if (bun.status !== 0) fail('bun is not on PATH; install it from https://bun.sh')
  const [major = 0, minor = 0] = bun.stdout.trim().split('.').map(Number)
  if (major < MIN_BUN[0] || (major === MIN_BUN[0] && minor < MIN_BUN[1])) {
    fail(`Bun ${MIN_BUN.join('.')} or newer is required (found ${bun.stdout.trim()})`)
  }

  const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' })
  if (docker.status !== 0) {
    console.warn('  warning: docker is not on PATH; the compose stack and any database service need it')
  }
}

// `full` keeps every file and only strips the markers; `none` also deletes the auth-only files
// and packages and drops what the markers select. Markers are written in the comment syntax
// of the file (`//`, `#` or `<!-- -->`):
//   code // @auth                        the line exists only with auth (`@noauth`: only without)
//   // @auth-start … // @auth-end        the same for a block (`@noauth-start` … `@noauth-end`)
// The pass fails on an unbalanced block and on any marker left behind, so a scaffold never
// contains one.
function applyAuthVariant() {
  if (auth === 'none') {
    for (const entry of AUTH_ONLY_PATHS) {
      const target = path.join(backend, entry)
      if (!existsSync(target)) fail(`auth-only path ${entry} is missing from templates/backend`)
      rmSync(target, { recursive: true })
      pruneEmptyParents(path.dirname(target))
    }
    removeAuthDependencies(path.join(backend, 'package.json'))
  }

  const files = [...listFiles(backend), path.join(root, 'docker-compose.yml')]
  for (const file of files) {
    const comment = MARKER_COMMENTS[path.extname(file)]
    if (comment === undefined) continue
    const content = readFileSync(file, 'utf8')
    const applied = applyMarkers(content, comment, path.relative(root, file), auth)
    if (applied !== content) writeFileSync(file, applied)
  }
  for (const file of files) {
    const left = MARKER.exec(readFileSync(file, 'utf8'))
    if (left !== null) fail(`${path.relative(root, file)} still contains an auth marker (${left[0]})`)
  }
}

// Runs the marker pass for both variants over templates/ before anything is created, so a
// marker mistake fails here instead of leaving a half-built scaffold to delete by hand.
function checkTemplateMarkers() {
  const files = [
    ...listFiles(path.join(templates, 'backend')),
    path.join(templates, 'root', 'docker-compose.yml'),
  ]
  for (const file of files) {
    const name = path.relative(harnessRoot, file)
    const content = readFileSync(file, 'utf8')
    const comment = MARKER_COMMENTS[path.extname(file)]
    const results =
      comment === undefined
        ? [content]
        : AUTH_VARIANTS.map((variant) => applyMarkers(content, comment, name, variant))
    for (const result of results) {
      const left = MARKER.exec(result)
      if (left !== null) fail(`${name} holds an auth marker the pass cannot remove (${left[0]})`)
    }
  }
}

function applyMarkers(content, [open, close], name, variant) {
  const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const token = `${escape(open)} @(no)?auth`
  const tail = `${escape(close)}[ \\t]*$`
  const lineMarker = new RegExp(`^(.*\\S)[ \\t]+${token}${tail}`)
  const blockStart = new RegExp(`^[ \\t]*${token}-start${tail}`)
  const blockEnd = new RegExp(`^[ \\t]*${token}-end${tail}`)
  const keeps = (kind) => (kind === 'no' ? variant === 'none' : variant === 'full')

  const kept = []
  let block
  for (const [index, raw] of content.split('\n').entries()) {
    const line = raw.replace(/\r$/, '')
    const where = `${name}:${String(index + 1)}`
    const start = blockStart.exec(line)
    if (start !== null) {
      if (block !== undefined) fail(`${where}: a marker block inside another`)
      block = { kind: start[1] ?? '', where }
      continue
    }
    const end = blockEnd.exec(line)
    if (end !== null) {
      if (block === undefined || block.kind !== (end[1] ?? '')) fail(`${where}: unbalanced marker end`)
      block = undefined
      continue
    }
    if (block !== undefined && !keeps(block.kind)) continue
    const single = lineMarker.exec(line)
    if (single === null) kept.push(raw)
    else if (keeps(single[2] ?? '')) {
      // A CRLF checkout keeps its carriage return.
      kept.push(line.replace(lineMarker, '$1') + raw.slice(line.length))
    }
  }
  if (block !== undefined) fail(`${block.where}: marker block is never closed`)
  return kept.join('\n')
}

function removeAuthDependencies(file) {
  const pkg = readJson(file)
  for (const [key, names] of Object.entries(AUTH_ONLY_DEPENDENCIES)) {
    for (const name of names) {
      if (pkg[key]?.[name] === undefined) fail(`${name} is missing from backend package.json ${key}`)
      delete pkg[key][name]
    }
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

// Every file below a directory, node_modules excluded.
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

// A deleted file can leave its directory empty (jobs/, subscribers/); git does not track one.
function pruneEmptyParents(start) {
  const floor = path.join(backend, 'src') + path.sep
  let dir = start
  while (dir.startsWith(floor) && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true })
    dir = path.dirname(dir)
  }
}

function mergePackageJson(file, partial, name) {
  const pkg = readJson(file)
  pkg.name = name
  pkg.engines = { bun: '>=1.4.0', node: '>=24.0.0' }
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    pkg[key] = sortKeys({ ...(pkg[key] ?? {}), ...(partial[key] ?? {}) })
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

function replaceToken(target) {
  if (!existsSync(target)) return
  if (statSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) {
      if (entry === 'node_modules') continue
      replaceToken(path.join(target, entry))
    }
    return
  }
  if (!TEXT_EXTENSIONS.has(path.extname(target))) return
  const content = readFileSync(target, 'utf8')
  if (!content.includes('__PROJECT_NAME__')) return
  writeFileSync(target, content.replaceAll('__PROJECT_NAME__', projectName))
}

function printNextSteps(skipped) {
  console.log('\nDone. Next:')
  if (skipped) {
    console.log('  cd backend && bun install && bun run openapi')
    console.log('  cd frontend && bun install && bun run api:types')
  }
  console.log('  cd backend && bun run check')
  console.log('  cd frontend && bun run check')
  console.log(
    process.platform === 'linux'
      ? '  cd frontend && bun x playwright install --with-deps chromium && bun run test:e2e'
      : '  cd frontend && bun x playwright install chromium && bun run test:e2e',
  )
  console.log('  Then fill .doc/ and add the first line to .plan/000-backlog.md')
  console.log('  Dependency versions follow the caret ranges in templates/ until the first bun.lock is committed.')
}

function run(command, commandArgs, cwd) {
  const resolved = resolveCommand(command)
  const result = spawnSync(resolved.file, [...resolved.prefix, ...commandArgs], { cwd, stdio: 'inherit' })
  if (result.status !== 0) fail(`${command} ${commandArgs.join(' ')} failed in ${cwd}`)
}

// Windows: an npm-installed `bun` is a .cmd shim that spawn cannot execute directly.
function resolveCommand(command) {
  if (process.platform !== 'win32') return { file: command, prefix: [] }
  const where = spawnSync('where.exe', [command], { encoding: 'utf8' })
  const first = (where.stdout ?? '').split(/\r?\n/).find((line) => line.trim() !== '')
  if (first === undefined) return { file: command, prefix: [] }
  return /\.(cmd|bat)$/i.test(first) ? { file: 'cmd.exe', prefix: ['/c', first] } : { file: first, prefix: [] }
}

function parseArgs(argv) {
  const parsed = { skipInstall: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--skip-install') parsed.skipInstall = true
    else if (arg === '--name') parsed.name = argv[++i]
    else if (arg === '--root') parsed.root = argv[++i]
    else if (arg === '--auth') parsed.auth = argv[++i] ?? ''
    else die(`unknown argument ${arg}`)
  }
  if (parsed.auth !== undefined && !AUTH_VARIANTS.includes(parsed.auth)) {
    die(`--auth must be one of ${AUTH_VARIANTS.join(', ')}`)
  }
  return parsed
}

function toProjectName(raw) {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name === '' ? 'app' : name
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
}

function step(message) {
  console.log(`\n==> ${message}`)
}

// An argument error happens before any path exists, so it must not look at the scaffold.
function die(message) {
  console.error(`bootstrap: ${message}`)
  process.exit(1)
}

function fail(message) {
  console.error(`bootstrap: ${message}`)
  if (existsSync(frontend) || existsSync(backend)) {
    console.error(
      'bootstrap: the scaffold is incomplete. Delete frontend/ and backend/ by hand (the guardrail ' +
        'hook refuses to delete directory trees for an agent), then run the bootstrap again.',
    )
  }
  process.exit(1)
}

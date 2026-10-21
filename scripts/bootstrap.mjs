#!/usr/bin/env node
// Scaffolds a new project from this harness. Deterministic: the same inputs produce the
// same tree. Run once, from the repository root:
//
//   node scripts/bootstrap.mjs [--name <project-name>] [--skip-install] [--root <dir>]
//
// Steps: check prerequisites → create-next-app (pinned) into frontend/ → overlay
// templates/frontend → copy templates/backend → copy templates/root → replace
// __PROJECT_NAME__ → install, generate the contract, format. `--root` targets another
// directory (used to validate the harness itself); `--skip-install` stops after the copy.
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

const args = parseArgs(process.argv.slice(2))
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
    else fail(`unknown argument ${arg}`)
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

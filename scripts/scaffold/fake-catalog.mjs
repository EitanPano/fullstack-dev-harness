// A tiny stand-in for the template catalog, for tests: a git repository whose `tools/generate.ts`
// (run by Bun, as the real one is) writes a deterministic tree from its arguments. Not shipped to
// projects; only the scaffold tests import it.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCommand } from '../catalog.mjs'

const GENERATOR = `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const argv = process.argv.slice(2)
const o: any = { flags: [], caps: [] }
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a === '--flag') o.flags.push(argv[++i])
  else if (a === '--capability') o.caps.push(argv[++i])
  else if (a.startsWith('--')) o[a.slice(2)] = argv[++i]
}
const SERVER = { template: 'server/fake-server', dir: 'backend' }
const FRONTEND = { template: 'frontend/fake', dir: o.dir ?? 'frontend' }
const members = o.stack ? [SERVER, { ...FRONTEND, dir: 'frontend' }] : [FRONTEND]
const answers = o.answers ? JSON.parse(readFileSync(o.answers, 'utf8')) : {}
const defaults: any = { auth: true, pwa: false }
const flagOwner: any = { auth: 'server', pwa: 'frontend' }
const pkgs: any = {}
for (const m of members) {
  const kind = m.template.split('/')[0]
  const flags: any = {}
  for (const [k, owner] of Object.entries(flagOwner)) if (owner === kind) flags[k] = defaults[k]
  Object.assign(flags, answers.packages?.[m.dir]?.flags)
  pkgs[m.dir] = { ...m, kind, flags, caps: { ...answers.packages?.[m.dir]?.capabilities } }
}
for (const f of o.flags) {
  const [k, v] = f.split('=')
  const owner = Object.values(pkgs).find((p: any) => k in p.flags) as any
  if (!owner) throw new Error('unknown flag: ' + k)
  owner.flags[k] = v === 'true'
}
for (const c of o.caps) {
  const [k, v] = c.split('=')
  const owner = Object.values(pkgs).find((p: any) => p.kind === 'server') as any
  if (k !== 'database' || !owner) throw new Error('unknown capability: ' + k)
  owner.caps[k] = v
}
const hasServer = Object.values(pkgs).some((p: any) => p.kind === 'server')
const deploy = hasServer ? (o.deploy ?? answers.deploy ?? 'single') : null
const put = (rel: string, text: string) => {
  const file = path.join(o.out, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const gi = Object.values(pkgs).map(
  (p: any) => '# --- fullstack-templates: ' + p.dir + ' ---\\n' + p.dir + '/dist/\\n',
)
put('.gitignore', gi.join('\\n'))
const failing =
  "process.env.SCAFFOLD_TEST_FAIL && process.argv[2] === 'frontend' && " +
  "process.argv[3] === 'install'"
const logging =
  "require('node:fs').appendFileSync(process.env.SCAFFOLD_TEST_LOG || 'run.log', " +
  "process.argv.slice(2).join(' ') + '\\\\n')"
put('run-step.cjs', 'if (' + failing + ') process.exit(1)\\n' + logging + '\\n')
for (const p of Object.values(pkgs) as any[]) {
  put(p.dir + '/package.json', '{"name":"' + p.dir + '"}\\n')
  put(p.dir + '/bun.lock', 'lock\\n')
  if (p.kind === 'frontend') {
    const api = hasServer ? 'yes' : 'none'
    const title = 'title: app\\n1\\n2\\n3\\n4\\n5\\napi: '
    put(p.dir + '/src/app.txt', title + api + '\\npwa: ' + p.flags.pwa + '\\n')
    if (!hasServer) put(p.dir + '/src/standalone.txt', 'standalone\\n')
  } else {
    const database = p.caps.database ?? 'none'
    put(p.dir + '/src/server.txt', 'auth: ' + p.flags.auth + '\\ndatabase: ' + database + '\\n')
    const url = p.caps.database ? '# Database URL.\\nDATABASE_URL=\\n' : ''
    put(p.dir + '/.env.example', '# Port the server listens on.\\nPORT=3000\\n' + url)
  }
}
if (hasServer) put('docker-compose.yml', 'deploy: ' + deploy + '\\n')
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
const step = (dir: string, name: string) =>
  '      ' + name + ': node ../run-step.cjs ' + dir + ' ' + name + '\\n'
const version = o['catalog-version'] ?? 'local'
let y = 'schemaVersion: 1\\ncatalog:\\n  repository: https://example.invalid/t\\n'
y += '  version: ' + version
y += '\\n  commit: ' + commit + '\\n'
y += 'generatedAt: ' + new Date().toISOString() + '\\n'
y += 'stack: ' + (o.stack ?? 'null') + '\\n'
if (deploy) y += 'deploy: ' + deploy + '\\n'
y += 'packages:\\n'
for (const p of Object.values(pkgs) as any[]) {
  y += '  ' + p.dir + ':\\n    template: ' + p.template + '\\n    version: 1.0.0\\n'
  const f = Object.entries(p.flags)
  const row = ([k, v]: any) => '      ' + k + ': ' + v + '\\n'
  const lines = (key: string, entries: any[]) =>
    entries.length ? '    ' + key + ':\\n' + entries.map(row).join('') : '    ' + key + ': {}\\n'
  y += lines('flags', f)
  const c = Object.entries(p.caps)
  y += lines('capabilities', c)
  const names = ['install', 'contract', 'format', 'check']
  y += '    commands:\\n' + names.map((n) => step(p.dir, n)).join('')
  y += '    http:\\n      port: ' + (p.kind === 'server' ? 3000 : 5173) + '\\n'
}
y += 'answers:\\n  projectName: ' + o.name + '\\n'
put('.fullstack/catalog.yaml', y)
`

const git = (cwd, args) => {
  const run = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { cwd, encoding: 'utf8' },
  )
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
  return run.stdout.trim()
}
export { git }

const write = (root, rel, text) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  writeFileSync(path.join(root, rel), text)
}

export function makeCatalog(parent) {
  const dir = mkdtempSync(path.join(parent ?? os.tmpdir(), 'fake-catalog-'))
  write(dir, 'index.yaml', 'schemaVersion: 1\n')
  write(dir, 'tools/generate.ts', GENERATOR)
  const stack = (id, packages) =>
    write(
      dir,
      `stacks/${id}/stack.yaml`,
      `schemaVersion: 1\nid: ${id}\npackages:\n` +
        packages.map(([t, d]) => `  - template: ${t}\n    dir: ${d}\n`).join(''),
    )
  stack('fe-be', [['server/fake-server', 'backend'], ['frontend/fake', 'frontend']])
  stack('other', [['frontend/other', 'frontend']])
  git(dir, ['init', '-q'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'catalog'])
  return dir
}

const README = [
  '# demo',
  ...['prerequisites', 'installation', 'usage', 'usage-notes', 'tests', 'configuration'].flatMap(
    (n) => [`<!-- ${n}:start -->`, `<!-- ${n}:end -->`, ''],
  ),
].join('\n')

// A project generated from the fake catalog (a lone frontend unless `args` says otherwise),
// with a lock file and a README, committed.
export function makeProject(catalog, parent, args = ['--template', 'frontend/fake']) {
  const dir = mkdtempSync(path.join(parent ?? os.tmpdir(), 'fake-project-'))
  const bun = resolveCommand('bun')
  const run = spawnSync(
    bun.file,
    [...bun.prefix, 'tools/generate.ts', ...args, '--out', dir, '--name', 'demo'],
    { cwd: catalog, encoding: 'utf8', shell: false },
  )
  if (run.status !== 0) throw new Error(`fake generator failed: ${run.stderr}`)
  write(dir, 'README.md', README)
  write(
    dir,
    'catalog.lock',
    JSON.stringify({
      repository: 'https://example.invalid/t',
      version: 'v1.10.0',
      commit: 'a'.repeat(40),
    }),
  )
  git(dir, ['init', '-q'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'project'])
  return dir
}

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runVerify } from './verify.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const bases = []
// Every test builds its own fixture, so they run side by side to keep the file fast.
const tests = []
const test = (name, run) => tests.push([name, run])

// One stub drives every gate command: pass, fail, skip, flake, rewrite a file, or hang with a
// child. It logs each run outside the repository so a test can count what verify executed.
const STUB = `
import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const [mode, file, text] = process.argv.slice(2)
appendFileSync(path.resolve(import.meta.dirname, '..', 'runs.log'), mode + '\\n')
if (mode === 'pass') console.log('3 pass\\n0 fail')
else if (mode === 'fail') { console.log('1 fail'); process.exit(1) }
else if (mode === 'skip') console.log('2 pass\\n1 skip\\n0 fail')
else if (mode === 'flaky') console.log('  3 passed (2s)\\n  1 flaky')
else if (mode === 'stable') writeFileSync(file, text)
else if (mode === 'write') writeFileSync(file, text + Date.now())
else if (mode === 'orphan') {
  // A detached grandchild that outlives this command, which lingers long enough to be seen.
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  writeFileSync(file, String(child.pid))
  setTimeout(() => {}, 1500)
} else if (mode === 'hang') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  console.log('child ' + child.pid)
  setInterval(() => {}, 1000)
}
`

const DOCKER = `
import { appendFileSync, existsSync } from 'node:fs'
import path from 'node:path'
const args = process.argv.slice(2).join(' ')
appendFileSync(path.resolve(import.meta.dirname, '..', 'docker.log'), args + '\\n')
if (args === 'compose config --services') {
  const noDb = existsSync(path.resolve(import.meta.dirname, '..', 'no-db'))
  console.log(noDb ? 'backend' : 'backend\\ndatabase')
}
`

function git(cwd, ...args) {
  // The fsmonitor daemon would outlive the test and hold the fixture folder open.
  const config = ['-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false']
  const run = spawnSync('git', [...config, ...args], { cwd, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}

// Where no PID lookup tool exists the reason says so instead of naming the PID.
const canFindPid =
  process.platform === 'win32' ||
  ['lsof', 'ss'].some((tool) => spawnSync(tool, ['-V'], { stdio: 'ignore' }).error === undefined)
const pidPattern = new RegExp(canFindPid ? `PID ${process.pid}\\b` : 'PID unknown')

// Tests run side by side, so a port is never handed out twice and comes from a block below the
// operating system's ephemeral range, where the port-0 listeners of the busy-port tests live.
let nextPort = 20000 + (process.pid % 500) * 10
async function freePort() {
  for (;;) {
    const port = nextPort++
    const free = await new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
    })
    if (free) return port
  }
}

// A repository with a server package (`backend`) and a frontend, committed, with a plan whose
// Base is that commit. `commands` overrides one command of one package.
async function fixture({ commands = {}, ports, noDb = false, plan = true } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'verify-'))
  bases.push(base)
  const root = path.join(base, 'repo')
  mkdirSync(path.join(root, 'backend'), { recursive: true })
  mkdirSync(path.join(root, 'frontend'), { recursive: true })
  mkdirSync(path.join(root, '.fullstack'))
  mkdirSync(path.join(root, '.plan'))
  const [backendPort, frontendPort] = ports ?? [await freePort(), await freePort()]
  const stub = (mode, ...rest) => `node ../stub.mjs ${mode} ${rest.join(' ')}`.trim()
  const defaults = {
    backend: {
      contract: stub('stable', '../backend/contract.json', 'v1'),
      check: stub('pass'),
      testDb: stub('pass'),
      migrate: stub('pass'),
    },
    frontend: { contract: stub('pass'), check: stub('pass'), testE2e: stub('pass') },
  }
  const lines = ['deploy: split', 'packages:']
  for (const [dir, template, port] of [
    ['frontend', 'frontend/react', frontendPort],
    ['backend', 'server/python-fastapi', backendPort],
  ]) {
    lines.push(`  ${dir}:`, `    template: ${template}`, '    http:', `      port: ${port}`)
    lines.push('    commands:')
    for (const [name, line] of Object.entries({ ...defaults[dir], ...commands[dir] })) {
      if (line === null) continue
      // The folded form is what the generator writes for a long command.
      const block = (style) => `${style}\n        ${line.replaceAll('\n', '\n        ')}`
      const value = name === 'testDb' ? block('>-') : line.includes('\n') ? block('|-') : line
      lines.push(`      ${name}: ${value}`)
    }
  }
  writeFileSync(path.join(root, '.fullstack', 'catalog.yaml'), `${lines.join('\n')}\n`)
  writeFileSync(path.join(root, 'stub.mjs'), STUB)
  writeFileSync(path.join(root, 'docker-stub.mjs'), DOCKER)
  writeFileSync(path.join(root, '.gitignore'), '.orchestrate/\n')
  writeFileSync(path.join(root, 'backend', 'contract.json'), 'v1')
  writeFileSync(path.join(root, 'backend', 'app.ts'), 'export const a = 1\n')
  writeFileSync(path.join(root, 'frontend', 'app.ts'), 'export const b = 1\n')
  if (noDb) writeFileSync(path.join(base, 'no-db'), '')
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 't@example.com')
  git(root, 'config', 'user.name', 't')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'init')
  const sha = git(root, 'rev-parse', '--short', 'HEAD')
  if (plan) {
    const text = `Branch: harness \`feat/lean-loop\`, cut from dev\nBase: ${sha} (\`dev\`)\n`
    writeFileSync(path.join(root, '.plan', '001-test.md'), text)
  }
  return { root, base, sha }
}

function opts(fx, extra = {}) {
  const lines = []
  return {
    lines,
    options: {
      root: fx.root,
      plan: '.plan/001-test.md',
      docker: `node "${path.join(fx.root, 'docker-stub.mjs')}"`,
      timeouts: { contract: 20000, check: 20000, testDb: 20000, testE2e: 20000 },
      // The process-table queries cost about 0.6 s a step on Windows; one test turns them on.
      reap: false,
      log: (line) => lines.push(line),
      ...extra,
    },
  }
}

const read = (fx, name = 'verify.json') =>
  JSON.parse(readFileSync(path.join(fx.root, '.orchestrate', 'lean-loop', name), 'utf8'))
const runs = (fx) =>
  existsSync(path.join(fx.base, 'runs.log'))
    ? readFileSync(path.join(fx.base, 'runs.log'), 'utf8').split('\n').filter(Boolean)
    : []

after(() => {
  for (const dir of bases) rmSync(dir, { recursive: true, force: true })
})

test('a clean fixture passes with exit 0 and records every step', async () => {
  const fx = await fixture()
  const { options, lines } = opts(fx)
  const { exit } = await runVerify(options)
  const result = read(fx)
  assert.equal(exit, 0)
  assert.equal(result.ok, true)
  assert.equal(result.tree, result.startTree)
  assert.equal(result.base, fx.sha)
  for (const step of ['contract', 'check', 'testDb', 'migrate']) {
    assert.equal(result.packages.backend[step].exit, 0, step)
  }
  assert.equal(result.packages.backend.check.passed, 3)
  assert.equal(result.packages.frontend.testE2e.exit, 0)
  assert.ok(result.checks.every((check) => check.ok))
  assert.match(lines.at(-1), /^verify: PASS [0-9a-f]{40}$/)
  assert.ok(lines.some((line) => /^ok\s+backend check/.test(line)))
})

test('a failing check fails with the step and the log tail', async () => {
  const fx = await fixture({ commands: { backend: { check: 'node ../stub.mjs fail' } } })
  const { options, lines } = opts(fx)
  const { exit } = await runVerify(options)
  const result = read(fx)
  assert.equal(exit, 1)
  assert.equal(result.ok, false)
  assert.equal(result.packages.backend.check.exit, 1)
  assert.equal(result.packages.backend.check.failed, 1)
  assert.match(result.packages.backend.check.log, /1 fail/)
  assert.match(lines.at(-1), /^verify: FAIL /)
  assert.ok(lines.some((line) => /^FAIL\s+backend check/.test(line)))
})

test('a skipped testDb suite fails, a skipped check suite does not', async () => {
  const fx = await fixture({
    commands: { backend: { testDb: 'node ../stub.mjs skip', check: 'node ../stub.mjs skip' } },
  })
  const { exit } = await runVerify(opts(fx).options)
  const result = read(fx)
  assert.equal(exit, 1)
  assert.equal(result.packages.backend.testDb.skipped, 1)
  assert.equal(result.packages.backend.testDb.ok, false)
  assert.match(result.packages.backend.testDb.reason, /skipped/)
  assert.equal(result.packages.backend.check.ok, true)
})

test('a Playwright flaky count fails the step', async () => {
  const fx = await fixture({ commands: { frontend: { testE2e: 'node ../stub.mjs flaky' } } })
  const { exit } = await runVerify(opts(fx).options)
  const result = read(fx)
  assert.equal(exit, 1)
  assert.equal(result.packages.frontend.testE2e.exit, 0)
  assert.equal(result.packages.frontend.testE2e.flaky, 1)
  assert.equal(result.packages.frontend.testE2e.ok, false)
})

test('a stale contract fails and names the rewritten file', async () => {
  const fx = await fixture()
  writeFileSync(path.join(fx.root, 'backend', 'contract.json'), 'hand edited')
  git(fx.root, 'commit', '-qam', 'stale')
  const { exit } = await runVerify(opts(fx).options)
  const check = read(fx).checks.find((entry) => entry.name === 'contract-fresh')
  assert.equal(exit, 1)
  assert.equal(check.ok, false)
  assert.match(check.detail, /backend\/contract\.json/)
})

test('an added .only fails the diff checks, naming file and line', async () => {
  const fx = await fixture()
  writeFileSync(path.join(fx.root, 'backend', 'app.test.ts'), 'export const a = 1\ntest.only("x")\n')
  const { exit } = await runVerify(opts(fx).options)
  const check = read(fx).checks.find((entry) => entry.name === 'no-focused-or-skipped-test')
  assert.equal(exit, 1)
  assert.equal(check.ok, false)
  assert.match(check.detail, /backend\/app\.test\.ts:2/)
})

test('an untracked file with a skip is found too, and a python skip', async () => {
  const fx = await fixture()
  writeFileSync(path.join(fx.root, 'frontend', 'new.test.ts'), 'it.skip("x", () => {})\n')
  writeFileSync(path.join(fx.root, 'backend', 'test_a.py'), '@pytest.mark.skipif(True)\n')
  const { exit } = await runVerify(opts(fx).options)
  const check = read(fx).checks.find((entry) => entry.name === 'no-focused-or-skipped-test')
  assert.equal(exit, 1)
  assert.match(check.detail, /frontend\/new\.test\.ts:1/)
  assert.match(check.detail, /backend\/test_a\.py:1/)
})

test('an axe .exclude( in an e2e spec fails, in another file it does not', async () => {
  const fx = await fixture()
  mkdirSync(path.join(fx.root, 'frontend', 'e2e'))
  writeFileSync(path.join(fx.root, 'frontend', 'app.ts'), 'list.exclude(1)\n')
  const clean = await runVerify(opts(fx).options)
  assert.equal(clean.exit, 0)
  writeFileSync(path.join(fx.root, 'frontend', 'e2e', 'a11y.spec.ts'), 'axe.exclude(".x")\n')
  const { exit } = await runVerify(opts(fx).options)
  const check = read(fx).checks.find((entry) => entry.name === 'no-axe-exclude')
  assert.equal(exit, 1)
  assert.match(check.detail, /frontend\/e2e\/a11y\.spec\.ts:1/)
})

test('a gate that rewrites a tracked file fails and lists it', async () => {
  const fx = await fixture({
    commands: { frontend: { check: 'node ../stub.mjs write ../backend/app.ts export' } },
  })
  const { exit } = await runVerify(opts(fx).options)
  const result = read(fx)
  const check = result.checks.find((entry) => entry.name === 'tree-unchanged')
  assert.equal(exit, 1)
  assert.notEqual(result.tree, result.startTree)
  assert.equal(check.ok, false)
  assert.match(check.detail, /backend\/app\.ts/)
})

test('a step past its timeout fails and the child it spawned is gone', async () => {
  const fx = await fixture({ commands: { backend: { check: 'node ../stub.mjs hang' } } })
  const { options } = opts(fx, { timeouts: { check: 3000, contract: 20000, testDb: 20000 } })
  const started = Date.now()
  const { exit } = await runVerify(options)
  const step = read(fx).packages.backend.check
  assert.equal(exit, 1)
  assert.ok(Date.now() - started < 15000)
  assert.equal(step.ok, false)
  assert.match(step.reason, /timed out/)
  const pid = Number(/child (\d+)/.exec(step.log)[1])
  assert.throws(() => process.kill(pid, 0), /ESRCH/)
})

test('a missing database service fails testDb with the reason and starts nothing', async () => {
  const fx = await fixture({ noDb: true })
  const { exit } = await runVerify(opts(fx).options)
  const result = read(fx)
  const docker = readFileSync(path.join(fx.base, 'docker.log'), 'utf8')
  assert.equal(exit, 1)
  assert.equal(result.packages.backend.testDb.ok, false)
  assert.match(result.packages.backend.testDb.reason, /database/)
  assert.doesNotMatch(docker, /up -d/)
})

test('the database is started once, before testDb and migrate', async () => {
  const fx = await fixture()
  await runVerify(opts(fx).options)
  const docker = readFileSync(path.join(fx.base, 'docker.log'), 'utf8').split('\n').filter(Boolean)
  assert.deepEqual(docker, ['compose config --services', 'compose up -d --wait database'])
})

test('--reuse on an unchanged passing tree runs nothing, on a changed tree runs everything', async () => {
  const fx = await fixture()
  const index = readFileSync(path.join(fx.root, '.git', 'index'))
  assert.equal((await runVerify(opts(fx).options)).exit, 0)
  const ran = runs(fx).length
  const again = opts(fx, { reuse: true })
  const reused = await runVerify(again.options)
  assert.equal(reused.exit, 0)
  assert.equal(runs(fx).length, ran)
  assert.match(again.lines.at(-1), /^verify: PASS \(unchanged since \d{4}-/)
  writeFileSync(path.join(fx.root, 'backend', 'app.ts'), 'export const a = 2\n')
  assert.equal((await runVerify(opts(fx, { reuse: true }).options)).exit, 0)
  assert.ok(runs(fx).length > ran)
  assert.deepEqual(readFileSync(path.join(fx.root, '.git', 'index')), index)
  assert.equal(git(fx.root, 'stash', 'list'), '')
})

test('--reuse does not skip a run whose last result failed', async () => {
  const fx = await fixture({ commands: { backend: { check: 'node ../stub.mjs fail' } } })
  assert.equal((await runVerify(opts(fx).options)).exit, 1)
  const ran = runs(fx).length
  assert.equal((await runVerify(opts(fx, { reuse: true }).options)).exit, 1)
  assert.ok(runs(fx).length > ran)
})

test('a partial run writes verify-partial.json and never satisfies --reuse', async () => {
  const fx = await fixture()
  const partial = await runVerify(opts(fx, { packages: ['backend'] }).options)
  assert.equal(partial.exit, 0)
  const result = read(fx, 'verify-partial.json')
  assert.deepEqual(Object.keys(result.packages), ['backend'])
  assert.equal(existsSync(path.join(fx.root, '.orchestrate', 'lean-loop', 'verify.json')), false)
  const ran = runs(fx).length
  assert.equal((await runVerify(opts(fx, { packages: ['backend'], reuse: true }).options)).exit, 0)
  assert.ok(runs(fx).length > ran)
  assert.equal((await runVerify(opts(fx, { reuse: true }).options)).exit, 0)
  assert.ok(existsSync(path.join(fx.root, '.orchestrate', 'lean-loop', 'verify.json')))
  const noE2e = await runVerify(opts(fx, { noE2e: true }).options)
  assert.equal(noE2e.exit, 0)
  assert.equal(read(fx, 'verify-partial.json').packages.frontend.testE2e, undefined)
})

test('a busy port fails the e2e step with the PID and leaves the listener alone', async () => {
  const fx = await fixture()
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    const busy = await fixture({
      ports: [port, await freePort()],
      commands: { frontend: { testE2e: 'node ../stub.mjs marker' } },
    })
    const { exit } = await runVerify(opts(busy).options)
    const step = read(busy).packages.frontend.testE2e
    assert.equal(exit, 1)
    assert.equal(step.ok, false)
    assert.match(step.reason, new RegExp(`port ${port}.*${pidPattern.source}`))
    assert.ok(!runs(busy).includes('marker'))
    const probe = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.on('connect', () => (socket.destroy(), resolve(true)))
      socket.on('error', () => resolve(false))
    })
    assert.equal(probe, true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  assert.equal((await runVerify(opts(fx).options)).exit, 0)
})

test('--no-e2e skips migrate and the port check', async () => {
  const fx = await fixture()
  const { exit } = await runVerify(opts(fx, { noE2e: true }).options)
  assert.equal(exit, 0)
  assert.equal(read(fx, 'verify-partial.json').packages.backend.migrate, undefined)
})

test('a repository with no base records the diff checks as skipped', async () => {
  const fx = await fixture({ plan: false })
  const out = path.join(fx.root, '.orchestrate', 'lean-loop')
  const { exit } = await runVerify({ ...opts(fx).options, plan: undefined, out })
  const check = read(fx).checks.find((entry) => entry.name === 'diff-checks')
  assert.equal(exit, 0)
  assert.equal(check.ok, true)
  assert.equal(check.detail, 'skipped: no base')
})

test('usage and environment errors exit 2 and write the reason', async () => {
  const fx = await fixture()
  rmSync(path.join(fx.root, '.fullstack'), { recursive: true, force: true })
  const { exit, result } = await runVerify(opts(fx).options)
  assert.equal(exit, 2)
  assert.match(result.reason, /catalog/)
  assert.equal(read(fx).reason, result.reason)
  assert.equal(read(fx).ok, false)
  const noPlanBranch = await fixture()
  writeFileSync(path.join(noPlanBranch.root, '.plan', '001-test.md'), 'Base: abc1234\n')
  assert.match((await runVerify(opts(noPlanBranch).options)).result.reason, /Branch/)
  const unknown = await fixture()
  const pkg = await runVerify(opts(unknown, { packages: ['nope'] }).options)
  assert.equal(pkg.exit, 2)
  assert.match(pkg.result.reason, /nope/)
})

test('the CLI exits 0 on a pass and 2 without a plan or out', async () => {
  const fx = await fixture()
  const script = path.join(here, 'verify.mjs')
  const bad = spawnSync(process.execPath, [script], { cwd: fx.root, encoding: 'utf8' })
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /usage/)
  const ok = spawnSync(
    process.execPath,
    [script, '--plan', '.plan/001-test.md', '--package', 'frontend', '--no-e2e'],
    { cwd: fx.root, encoding: 'utf8' },
  )
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /verify: PASS/)
})

test('a full run fails when a package has no check command', async () => {
  const fx = await fixture({ commands: { frontend: { check: null } } })
  const { exit } = await runVerify(opts(fx).options)
  const step = read(fx).packages.frontend.check
  assert.equal(exit, 1)
  assert.equal(step.ok, false)
  assert.match(step.reason, /no check command/)
})

test('a partial run keeps passing when a package has no check command', async () => {
  const fx = await fixture({ commands: { frontend: { check: null } } })
  const partial = opts(fx, { packages: ['frontend'], noE2e: true })
  assert.equal((await runVerify(partial.options)).exit, 0)
})

test('a package without a contract command is skipped, not failed', async () => {
  const fx = await fixture({ commands: { frontend: { contract: null } } })
  const { exit } = await runVerify(opts(fx).options)
  const step = read(fx).packages.frontend.contract
  assert.equal(exit, 0)
  assert.equal(step.ok, true)
  assert.match(step.reason, /skipped: no contract command/)
})

test('a full run fails when the database service exists and no package has testDb', async () => {
  const fx = await fixture({ commands: { backend: { testDb: null } } })
  const { exit } = await runVerify(opts(fx).options)
  const check = read(fx).checks.find((entry) => entry.name === 'testdb-defined')
  assert.equal(exit, 1)
  assert.equal(check.ok, false)
  const none = { testDb: null, migrate: null }
  const noDb = await fixture({ commands: { backend: none }, noDb: true })
  assert.equal((await runVerify(opts(noDb).options)).exit, 0)
})

test('--reuse re-runs when the Base or the plan changed on the same tree', async () => {
  const fx = await fixture()
  const planFile = path.join(fx.root, '.plan', '001-test.md')
  const copy = path.join(fx.root, '.plan', '002-test.md')
  writeFileSync(copy, readFileSync(planFile, 'utf8'))
  const reuse = (extra) => runVerify(opts(fx, { reuse: true, ...extra }).options)
  assert.equal((await reuse({ plan: '.plan/001-test.md' })).exit, 0)
  const ran = runs(fx).length
  await reuse({ plan: '.plan/001-test.md' })
  assert.equal(runs(fx).length, ran, 'same tree, base and plan: reused')
  await reuse({ plan: '.plan/001-test.md', base: git(fx.root, 'rev-parse', 'HEAD') })
  assert.ok(runs(fx).length > ran, 'a changed Base re-runs')
  const again = runs(fx).length
  await reuse({ plan: '.plan/002-test.md' })
  assert.ok(runs(fx).length > again, 'a different plan re-runs')
})

test('exit 2 with an unreadable plan still writes the JSON to --out', async () => {
  const fx = await fixture()
  const out = path.join(fx.root, '.orchestrate', 'elsewhere')
  const { exit, result } = await runVerify({ ...opts(fx).options, plan: '.plan/nope.md', out })
  assert.equal(exit, 2)
  const written = JSON.parse(readFileSync(path.join(out, 'verify.json'), 'utf8'))
  assert.equal(written.reason, result.reason)
  const none = await runVerify({ ...opts(fx).options, plan: '.plan/nope.md' })
  assert.equal(none.exit, 2)
  assert.equal(existsSync(path.join(fx.root, '.orchestrate', 'lean-loop')), false)
})

test('a failed check skips testDb and testE2e, the diff checks and end tree still run', async () => {
  const fx = await fixture({ commands: { backend: { check: 'node ../stub.mjs fail' } } })
  const { exit } = await runVerify(opts(fx).options)
  const result = read(fx)
  assert.equal(exit, 1)
  for (const [dir, step] of [
    ['backend', 'testDb'],
    ['frontend', 'testE2e'],
  ]) {
    assert.equal(result.packages[dir][step].ok, false)
    assert.match(result.packages[dir][step].reason, /skipped: backend check failed/)
  }
  assert.equal(result.packages.backend.migrate, undefined)
  assert.ok(result.checks.some((entry) => entry.name === 'tree-unchanged'))
  assert.ok(result.checks.some((entry) => entry.name === 'no-axe-exclude'))
  // contract x2 and check x2 ran; testDb, migrate and the e2e command did not.
  assert.equal(runs(fx).length, 4)
})

test('a failed contract step also skips the expensive steps', async () => {
  const fx = await fixture({ commands: { backend: { contract: 'node ../stub.mjs fail' } } })
  assert.equal((await runVerify(opts(fx).options)).exit, 1)
  assert.match(read(fx).packages.backend.testDb.reason, /skipped: backend contract failed/)
})

test('a dirty tree and an untracked file leave the real index and stash alone', async () => {
  const fx = await fixture()
  writeFileSync(path.join(fx.root, 'backend', 'app.ts'), 'export const a = 3\n')
  writeFileSync(path.join(fx.root, 'backend', 'fresh.ts'), 'export const f = 1\n')
  const index = readFileSync(path.join(fx.root, '.git', 'index'))
  assert.equal((await runVerify(opts(fx).options)).exit, 0)
  assert.deepEqual(readFileSync(path.join(fx.root, '.git', 'index')), index)
  assert.equal(git(fx.root, 'stash', 'list'), '')
})

test('a grandchild left behind by a normal exit is reaped', async (t) => {
  if (process.platform !== 'win32') return t.skip('POSIX reaps through the process group')
  const fx = await fixture({
    commands: { backend: { check: 'node ../stub.mjs orphan ../../orphan.pid' } },
  })
  let pid
  try {
    const { exit } = await runVerify(opts(fx, { reap: true, reapInterval: 300 }).options)
    pid = Number(readFileSync(path.join(fx.base, 'orphan.pid'), 'utf8'))
    assert.equal(exit, 0)
    assert.throws(() => process.kill(pid, 0), /ESRCH/)
  } finally {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone, as it should be.
    }
  }
})

test('a busy IPv6 loopback port names the PID', async (t) => {
  const server = net.createServer()
  const listening = await new Promise((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(0, '::1', () => resolve(true))
  })
  if (!listening) return t.skip('no IPv6 loopback on this host')
  try {
    const { port } = server.address()
    const busy = await fixture({ ports: [port, await freePort()] })
    await runVerify(opts(busy).options)
    const reason = read(busy).packages.frontend.testE2e.reason
    assert.match(reason, pidPattern)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('the CLI runs through a directory link instead of exiting 0 silently', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-link-'))
  bases.push(dir)
  const link = path.join(dir, 'scripts')
  symlinkSync(here, link, 'junction')
  const run = spawnSync(process.execPath, [path.join(link, 'verify.mjs')], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /usage/)
})

test('a partial run ignores an edit outside its package and fails on one inside', async () => {
  const outside = await fixture({
    commands: { backend: { contract: 'node ../stub.mjs write ../frontend/app.ts export' } },
  })
  const partial = opts(outside, { packages: ['backend'], noE2e: true })
  assert.equal((await runVerify(partial.options)).exit, 0)
  const checks = read(outside, 'verify-partial.json').checks
  assert.ok(checks.every((entry) => entry.ok))
  const inside = await fixture({
    commands: { backend: { contract: 'node ../stub.mjs write ../backend/app.ts export' } },
  })
  const bad = opts(inside, { packages: ['backend'], noE2e: true })
  assert.equal((await runVerify(bad.options)).exit, 1)
  const names = read(inside, 'verify-partial.json').checks.filter((entry) => !entry.ok)
  assert.ok(names.some((entry) => entry.name === 'contract-fresh'))
  const full = await fixture({
    commands: { backend: { contract: 'node ../stub.mjs write ../frontend/app.ts export' } },
  })
  assert.equal((await runVerify(opts(full).options)).exit, 1)
})

test('a partial diff check reads only the selected packages', async () => {
  const fx = await fixture()
  writeFileSync(path.join(fx.root, 'frontend', 'a.test.ts'), 'it.only("x", f)\n')
  const partial = opts(fx, { packages: ['backend'], noE2e: true })
  assert.equal((await runVerify(partial.options)).exit, 0)
  assert.equal((await runVerify(opts(fx).options)).exit, 1)
})

test('a frontend-only e2e run still starts the database and migrates the server', async () => {
  const fx = await fixture({ commands: { backend: { migrate: 'node ../stub.mjs marker' } } })
  const { exit } = await runVerify(opts(fx, { packages: ['frontend'] }).options)
  const docker = readFileSync(path.join(fx.base, 'docker.log'), 'utf8')
  assert.equal(exit, 0)
  assert.ok(runs(fx).includes('marker'))
  assert.match(docker, /up -d --wait database/)
  assert.equal(read(fx, 'verify-partial.json').packages.backend.migrate.ok, true)
})

test('a missing docker is an environment error, exit 2', async () => {
  const fx = await fixture()
  const { exit, result } = await runVerify(opts(fx, { docker: 'no-such-docker-binary-xyz' }).options)
  assert.equal(exit, 2)
  assert.equal(result.reason, 'docker unavailable')
  assert.equal(read(fx).reason, 'docker unavailable')
})

test('on Windows a multi-line command is refused with exit 2', async () => {
  const fx = await fixture({ commands: { backend: { check: 'node ../stub.mjs pass\nnode ../stub.mjs fail' } } })
  const win = await runVerify(opts(fx, { platform: 'win32' }).options)
  assert.equal(win.exit, 2)
  assert.match(win.result.reason, /backend check.*multi-line/)
  assert.equal(runs(fx).length, 0)
  assert.notEqual((await runVerify(opts(fx, { platform: 'linux' }).options)).exit, 2)
})

test('a full run records whether the change touches security paths', async () => {
  const fx = await fixture()
  await runVerify(opts(fx).options)
  assert.deepEqual(read(fx).security, { triggered: false, paths: [] })
  mkdirSync(path.join(fx.root, 'backend', 'auth'))
  writeFileSync(path.join(fx.root, 'backend', 'auth', 'gate.ts'), 'export const g = 1\n')
  writeFileSync(path.join(fx.root, 'frontend', 'app.ts'), 'export const b = 2\n')
  await runVerify(opts(fx).options)
  assert.deepEqual(read(fx).security, { triggered: true, paths: ['backend/auth/gate.ts'] })
  await runVerify(opts(fx, { packages: ['backend'], noE2e: true }).options)
  assert.equal(read(fx, 'verify-partial.json').security, undefined)
})

describe('verify', { concurrency: 6 }, () => {
  for (const [name, run] of tests) it(name, run)
})

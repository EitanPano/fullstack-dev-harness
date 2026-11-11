import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { git, makeCatalog, makeProject } from './scaffold/fake-catalog.mjs'

const script = fileURLToPath(new URL('./scaffold.mjs', import.meta.url))
const top = mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'))
const scratch = path.join(top, 'tmp')
const logFile = path.join(top, 'run.log')
let catalog

const scaffold = (project, args, { templates = true, env = {} } = {}) => {
  const run = spawnSync(
    process.execPath,
    [script, ...args, '--root', project, ...(templates ? ['--templates', catalog] : [])],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SCAFFOLD_TEST_LOG: logFile,
        TEMP: scratch,
        TMP: scratch,
        TMPDIR: scratch,
        GIT_CONFIG_PARAMETERS: "'core.fsmonitor=false'",
        ...env,
      },
    },
  )
  return { status: run.status, out: run.stdout, err: run.stderr }
}
const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n') : [])
const fresh = () => {
  rmSync(logFile, { force: true })
  return makeProject(catalog, top)
}
const read = (project, rel) => readFileSync(path.join(project, rel), 'utf8')
const STACK = ['--stack', 'fe-be']

before(() => {
  rmSync(scratch, { recursive: true, force: true })
  spawnSync('node', ['-e', `require('node:fs').mkdirSync(${JSON.stringify(scratch)})`])
  catalog = makeCatalog(top)
})
after(() => rmSync(top, { recursive: true, force: true }))

describe('refusals (exit 2, nothing written)', () => {
  const refused = (project, args, pattern, options) => {
    const before = git(project, ['status', '--porcelain'])
    const result = scaffold(project, args, options)
    assert.equal(result.status, 2, result.err + result.out)
    assert.match(result.err, pattern)
    assert.equal(git(project, ['status', '--porcelain']), before)
    assert.deepEqual(readdirSync(scratch), [], 'temp folders are cleaned up')
  }
  it('names the usage on --help', () => {
    const result = scaffold(top, ['--help'], { templates: false })
    assert.equal(result.status, 0)
    assert.match(result.out, /usage: node scripts\/scaffold\.mjs/)
  })
  it('without provenance', () => {
    const empty = mkdtempSync(path.join(top, 'empty-'))
    git(empty, ['init', '-q'])
    refused(empty, STACK, /\.fullstack\/catalog\.yaml/)
  })
  it('on a dirty tree', () => {
    const project = fresh()
    writeFileSync(path.join(project, 'stray.txt'), 'x')
    refused(project, STACK, /uncommitted|dirty/)
  })
  it('when the lock differs from provenance (no override)', () => {
    refused(fresh(), STACK, /catalog\.lock/, { templates: false })
  })
  it('when the override checkout moved off the recorded commit', () => {
    const project = fresh()
    writeFileSync(path.join(catalog, 'moved.txt'), 'x')
    git(catalog, ['add', '-A'])
    git(catalog, ['commit', '-q', '-m', 'move'])
    refused(project, STACK, /HEAD/)
  })
  it('a null recorded commit under an override', () => {
    const project = fresh()
    const file = path.join(project, '.fullstack', 'catalog.yaml')
    const provenance = read(project, '.fullstack/catalog.yaml')
    writeFileSync(file, provenance.replace(/commit: \w+/, 'commit: null'))
    git(project, ['commit', '-qam', 'null commit'])
    refused(project, STACK, /commit/)
  })
  it('a stack that lacks the package, a deploy without a stack, an empty request', () => {
    const project = fresh()
    refused(project, ['--stack', 'other'], /does not carry frontend\/fake/)
    refused(project, ['--deploy', 'single'], /--deploy/)
    refused(project, [], /nothing to add/)
  })
  it('a request that removes, or a stack on a project that has one', () => {
    rmSync(logFile, { force: true })
    const project = makeProject(catalog, top, STACK)
    refused(project, ['--flag', 'auth=false'], /removes/)
    refused(project, STACK, /already has a stack/)
  })
  it('turning off a flag the frontend has on', () => {
    const project = makeProject(catalog, top, ['--template', 'frontend/fake', '--flag', 'pwa=true'])
    refused(project, [...STACK, '--flag', 'pwa=false'], /removes/)
  })
})

describe('adding a server', () => {
  it('merges, finishes and prints the commit line', () => {
    const project = fresh()
    const args = [...STACK, '--capability', 'database=postgres', '--flag', 'auth=true']
    const result = scaffold(project, args)
    assert.equal(result.status, 0, result.err + result.out)
    assert.match(result.out, /chore\(scaffold\): add backend, auth, database=postgres/)
    assert.equal(read(project, 'backend/src/server.txt'), 'auth: true\ndatabase: postgres\n')
    assert.match(read(project, 'frontend/src/app.txt'), /api: yes/)
    assert.match(read(project, '.gitignore'), /fullstack-templates: backend/)
    const gitignore = read(project, '.gitignore')
    assert.match(gitignore, /fullstack-templates: frontend[\s\S]*fullstack-templates: backend/)
    assert.match(read(project, '.fullstack/catalog.yaml'), /stack: fe-be/)
    assert.equal(existsSync(path.join(project, '.orchestrate', 'scaffold', 'conflicts.md')), false)
    // Producers first; install, then contract, then format, each over every package.
    assert.deepEqual(log(), [
      'backend install',
      'frontend install',
      'backend contract',
      'frontend contract',
      'backend format',
      'frontend format',
    ])
    const readme = read(project, 'README.md')
    assert.match(readme, /node \.\.\/run-step\.cjs backend install/)
    assert.match(readme, /`PORT`/)
    assert.match(readme, /`DATABASE_URL`/)
    assert.deepEqual(readdirSync(scratch), [], 'temp folders are removed')
  })
  it('keeps the project generatedAt', () => {
    const project = fresh()
    const stamp = /generatedAt: .*/.exec(read(project, '.fullstack/catalog.yaml'))[0]
    scaffold(project, STACK)
    assert.equal(/generatedAt: .*/.exec(read(project, '.fullstack/catalog.yaml'))[0], stamp)
  })
  it('--dry-run prints one line per path and writes nothing', () => {
    const project = fresh()
    const result = scaffold(project, [...STACK, '--dry-run'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /write\s+backend\/src\/server\.txt/)
    assert.match(result.out, /write\s+frontend\/src\/app\.txt/)
    assert.equal(git(project, ['status', '--porcelain']), '')
    assert.deepEqual(log(), [])
    assert.deepEqual(readdirSync(scratch), [])
  })
})

describe('conflicts and --complete', () => {
  it('lists the conflict, runs nothing, then finishes once the markers are gone', () => {
    const project = fresh()
    const app = path.join(project, 'frontend/src/app.txt')
    writeFileSync(app, read(project, 'frontend/src/app.txt').replace('api: none', 'api: mine'))
    git(project, ['commit', '-qam', 'edit'])
    const result = scaffold(project, [...STACK, '--slug', 'sc'])
    assert.equal(result.status, 1, result.err + result.out)
    assert.match(result.out, /conflicts\.md/)
    const marked = /<<<<<<< project\napi: mine\n=======\napi: yes\n>>>>>>> next/
    assert.match(read(project, 'frontend/src/app.txt'), marked)
    assert.equal(existsSync(path.join(project, 'backend/src/server.txt')), true)
    const list = read(project, '.orchestrate/sc/scaffold/conflicts.md')
    const row = /^- \[ \] frontend\/src\/app\.txt — frontend — frontend — merge conflict$/m
    assert.match(list, row)
    const state = JSON.parse(read(project, '.orchestrate/sc/scaffold/state.json'))
    assert.deepEqual(state.conflicts, [{ path: 'frontend/src/app.txt', markers: true }])
    assert.deepEqual(state.parts, ['backend'])
    assert.deepEqual(log(), [])

    const refusedAgain = scaffold(project, ['--complete', '--slug', 'sc'])
    assert.equal(refusedAgain.status, 2)
    assert.match(refusedAgain.err, /frontend\/src\/app\.txt/)
    assert.deepEqual(log(), [])

    const markers = /<<<<<<<[\s\S]*>>>>>>> next\n/
    const resolved = read(project, 'frontend/src/app.txt').replace(markers, 'api: both\n')
    writeFileSync(app, resolved)
    const done = scaffold(project, ['--complete', '--slug', 'sc'])
    assert.equal(done.status, 0, done.err + done.out)
    assert.match(done.out, /chore\(scaffold\): add backend/)
    assert.equal(log().length, 6)
    assert.equal(existsSync(path.join(project, '.orchestrate/sc/scaffold/state.json')), false)
  })

  it('blocks --complete on a marker-less conflict until its line is checked off', () => {
    const project = fresh()
    const file = path.join(project, 'frontend/src/standalone.txt')
    writeFileSync(file, 'mine\n')
    git(project, ['commit', '-qam', 'edit'])
    const result = scaffold(project, [...STACK, '--slug', 'rm'])
    assert.equal(result.status, 1, result.err + result.out)
    const listFile = path.join(project, '.orchestrate/rm/scaffold/conflicts.md')
    assert.match(
      readFileSync(listFile, 'utf8'),
      /^- \[ \] frontend\/src\/standalone\.txt — frontend — frontend — removed by the part/m,
    )
    assert.equal(read(project, 'frontend/src/standalone.txt'), 'mine\n')

    const open = scaffold(project, ['--complete', '--slug', 'rm'])
    assert.equal(open.status, 2)
    assert.match(open.err, /frontend\/src\/standalone\.txt/)
    assert.deepEqual(log(), [])

    writeFileSync(listFile, readFileSync(listFile, 'utf8').replace('- [ ]', '- [x]'))
    const done = scaffold(project, ['--complete', '--slug', 'rm'])
    assert.equal(done.status, 0, done.err + done.out)
    assert.equal(log().length, 6)
  })
  it('takes commands from the project provenance, not state.json, and confines its paths', () => {
    const project = fresh()
    writeFileSync(path.join(project, 'frontend/src/standalone.txt'), 'mine\n')
    git(project, ['commit', '-qam', 'edit'])
    scaffold(project, [...STACK, '--slug', 'ev'])
    const stateFile = path.join(project, '.orchestrate/ev/scaffold/state.json')
    const state = JSON.parse(readFileSync(stateFile, 'utf8'))
    const install = 'node -e "require(\'fs\').writeFileSync(\'pwned.txt\',\'x\')"'
    const evil = { template: 'x', commands: { install } }
    writeFileSync(stateFile, JSON.stringify({ ...state, next: { packages: { frontend: evil } } }))
    const listFile = path.join(project, '.orchestrate/ev/scaffold/conflicts.md')
    writeFileSync(listFile, readFileSync(listFile, 'utf8').replace('- [ ]', '- [x]'))
    const done = scaffold(project, ['--complete', '--slug', 'ev'])
    assert.equal(done.status, 0, done.err + done.out)
    assert.equal(existsSync(path.join(project, 'pwned.txt')), false)
    assert.equal(log().length, 6)

    scaffold(project, [...STACK, '--slug', 'ev2', '--dry-run'])
    const crafted = { parts: ['x'], conflicts: [{ path: '../out.txt', markers: true }] }
    writeFileSync(stateFile, JSON.stringify(crafted))
    const bad = scaffold(project, ['--complete', '--slug', 'ev'])
    assert.equal(bad.status, 2)
    assert.match(bad.err, /outside the project/)
  })
  it('refuses a slug that climbs out of .orchestrate', () => {
    const result = scaffold(fresh(), [...STACK, '--slug', '../x'])
    assert.equal(result.status, 2)
    assert.match(result.err, /slug/)
  })
  it('a dry run with a conflict exits 1 and writes nothing', () => {
    const project = fresh()
    writeFileSync(path.join(project, 'frontend/src/standalone.txt'), 'mine\n')
    git(project, ['commit', '-qam', 'edit'])
    const result = scaffold(project, [...STACK, '--dry-run'])
    assert.equal(result.status, 1)
    assert.match(result.out, /removed by the part, changed here/)
    assert.equal(git(project, ['status', '--porcelain']), '')
  })
  it('a failing package command exits 3, keeps state, and --complete retries', () => {
    const project = fresh()
    const base = read(project, '.fullstack/catalog.yaml')
    assert.match(base, /install: node/)
    // The retry reads the merged provenance, so break the command after the merge: a failing
    // frontend install via an environment-independent command.
    const env = { SCAFFOLD_TEST_FAIL: '1' }
    const result = scaffold(project, [...STACK, '--slug', 'cf'], { env })
    assert.equal(result.status, 3, result.err + result.out)
    assert.match(result.err, /frontend install failed/)
    assert.equal(existsSync(path.join(project, '.orchestrate/cf/scaffold/state.json')), true)
    const retry = scaffold(project, ['--complete', '--slug', 'cf'])
    assert.equal(retry.status, 0, retry.err + retry.out)
    assert.equal(existsSync(path.join(project, '.orchestrate/cf/scaffold/state.json')), false)
  })

  it('lets a checked-off marker-less file keep a legitimate ======= line', () => {
    const project = fresh()
    const file = path.join(project, 'frontend/src/standalone.txt')
    writeFileSync(file, 'Title\n=======\nmine\n')
    git(project, ['commit', '-qam', 'edit'])
    assert.equal(scaffold(project, [...STACK, '--slug', 'sx']).status, 1)
    const listFile = path.join(project, '.orchestrate/sx/scaffold/conflicts.md')
    assert.equal(scaffold(project, ['--complete', '--slug', 'sx']).status, 2)
    writeFileSync(listFile, readFileSync(listFile, 'utf8').replace('- [ ]', '- [x]'))
    const done = scaffold(project, ['--complete', '--slug', 'sx'])
    assert.equal(done.status, 0, done.err + done.out)
  })
  it('judges a merge conflict by its labelled lines, not a bare =======', () => {
    const project = fresh()
    const app = path.join(project, 'frontend/src/app.txt')
    writeFileSync(app, read(project, 'frontend/src/app.txt').replace('api: none', 'api: mine'))
    git(project, ['commit', '-qam', 'edit'])
    assert.equal(scaffold(project, [...STACK, '--slug', 'lb']).status, 1)
    const text = read(project, 'frontend/src/app.txt')
    const marked = (resolved) => text.replace(/<<<<<<<[\s\S]*>>>>>>> next\n/, resolved)
    writeFileSync(app, marked('<<<<<<< project\napi: both\n'))
    const left = scaffold(project, ['--complete', '--slug', 'lb'])
    assert.equal(left.status, 2)
    assert.match(left.err, /frontend\/src\/app\.txt/)
    writeFileSync(app, marked('Heading\n=======\napi: both\n'))
    const done = scaffold(project, ['--complete', '--slug', 'lb'])
    assert.equal(done.status, 0, done.err + done.out)
  })
})

describe('fix wave', () => {
  const edit = (project, rel, from, to) => {
    writeFileSync(path.join(project, rel), read(project, rel).replace(from, to))
    git(project, ['commit', '-qam', 'edit'])
  }
  it('echoes the slug and the templates in the --complete hint', () => {
    const project = fresh()
    edit(project, 'frontend/src/app.txt', 'api: none', 'api: mine')
    const result = scaffold(project, [...STACK, '--slug', 'hi'])
    assert.equal(result.status, 1, result.err + result.out)
    assert.ok(result.out.includes(`--complete --slug hi --templates ${catalog}`), result.out)
    assert.match(read(project, '.orchestrate/hi/scaffold/conflicts.md'), /--complete --slug hi/)
    assert.doesNotMatch(result.out, /git checkout|git clean/)
  })
  it('writes NEXT copy of a deleted-here conflict and names it in conflicts.md', () => {
    const project = fresh()
    git(project, ['rm', '-q', 'frontend/src/app.txt'])
    git(project, ['commit', '-qm', 'delete'])
    const result = scaffold(project, [...STACK, '--slug', 'nx'])
    assert.equal(result.status, 1, result.err + result.out)
    const copy = '.orchestrate/nx/scaffold/next/frontend/src/app.txt'
    assert.match(read(project, copy), /api: yes/)
    const list = read(project, '.orchestrate/nx/scaffold/conflicts.md')
    assert.ok(list.includes(copy), list)
    assert.match(list, /^- \[ \] frontend\/src\/app\.txt — .*deleted here, changed by the part/m)
    assert.equal(existsSync(path.join(project, 'frontend/src/app.txt')), false)
  })
  it('accepts a capital X in the checklist', () => {
    const project = fresh()
    writeFileSync(path.join(project, 'frontend/src/standalone.txt'), 'mine\n')
    git(project, ['commit', '-qam', 'edit'])
    assert.equal(scaffold(project, [...STACK, '--slug', 'cx']).status, 1)
    const listFile = path.join(project, '.orchestrate/cx/scaffold/conflicts.md')
    writeFileSync(listFile, readFileSync(listFile, 'utf8').replace('- [ ]', '- [X]'))
    const done = scaffold(project, ['--complete', '--slug', 'cx'])
    assert.equal(done.status, 0, done.err + done.out)
  })
  it('runs the commands of the merged project provenance on the clean path', () => {
    const project = fresh()
    edit(project, '.fullstack/catalog.yaml', 'frontend format', 'frontend format-mine')
    const result = scaffold(project, STACK)
    assert.equal(result.status, 0, result.err + result.out)
    assert.ok(log().includes('frontend format-mine'), log().join('|'))
  })
  it('keeps CRLF in a project file the part changes', () => {
    const project = fresh()
    const app = path.join(project, 'frontend/src/app.txt')
    writeFileSync(app, read(project, 'frontend/src/app.txt').replace(/\n/g, '\r\n'))
    const plain = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false']
    git(project, [...plain, 'commit', '-qam', 'crlf'])
    const result = scaffold(project, STACK)
    assert.equal(result.status, 0, result.err + result.out)
    const text = read(project, 'frontend/src/app.txt')
    assert.match(text, /api: yes\r\n/)
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false)
  })
  it('refuses a capability with no server to carry it', () => {
    const project = fresh()
    const before = git(project, ['status', '--porcelain'])
    const result = scaffold(project, ['--capability', 'database=postgres'])
    assert.equal(result.status, 2, result.err + result.out)
    assert.match(result.err, /no server/)
    assert.equal(git(project, ['status', '--porcelain']), before)
  })
  it('refuses a templates checkout with uncommitted changes', () => {
    const project = fresh()
    writeFileSync(path.join(catalog, 'tools', 'extra.txt'), 'x')
    try {
      const result = scaffold(project, STACK)
      assert.equal(result.status, 2, result.err + result.out)
      assert.match(result.err, /uncommitted/)
    } finally {
      rmSync(path.join(catalog, 'tools', 'extra.txt'))
    }
  })
})

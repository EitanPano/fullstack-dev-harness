import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DetachRefusal, detach } from './detach.mjs'

// Every repository here is a throwaway under the OS temp dir. Nothing touches this repository:
// the scripts a fixture needs are copied out of it, and detach runs with the fixture as root.
// A system git config can turn the fsmonitor daemon on: one per fixture would outlive the test
// and hold its temp folder open.
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.fsmonitor',
  GIT_CONFIG_VALUE_0: 'false',
})

const here = path.dirname(fileURLToPath(import.meta.url))
const copied = ['detach.mjs', 'manifest.mjs', 'verify/glob.mjs']

const made = []
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function temp(prefix = 'detach-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

const FLAGS = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false']

function git(root, ...args) {
  const run = spawnSync('git', [...FLAGS, '-C', root, ...args], { encoding: 'utf8' })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}

// Exit status and output, for a command that is expected to fail.
function gitRun(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

function put(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), text)
}

function manifestText(rootCommit) {
  return JSON.stringify({
    format: 1,
    version: 'unreleased',
    repository: 'https://example.com/h',
    rootCommit,
    minCatalog: 'v1.0.0',
    groups: {
      harness: ['.claude/harness.json', 'AGENTS.md', 'scripts/manifest.mjs', 'scripts/verify/*'],
      project: ['README.md', '.plan/000-backlog.md', '.gitignore'],
      dev: [
        'scripts/detach.mjs',
        'scripts/bootstrap.mjs',
        'scripts/history.mjs',
        '**/*.test.mjs',
        'scripts/scaffold/**',
        'CONTRIBUTING.md',
        '.plan/*.md',
        '!.plan/000-backlog.md',
      ],
    },
    setup: ['scripts/bootstrap.mjs', 'scripts/history.mjs'],
    references: [],
  })
}

// A harness origin: three commits (the manifest pins the first), two branches and a tag.
function origin({ pinned = true } = {}) {
  const root = temp('detach-origin-')
  git(root, 'init', '-q', '--initial-branch=main')
  put(root, 'AGENTS.md', 'rules\n')
  put(root, 'README.md', '# harness\n')
  put(root, '.gitignore', 'node_modules/\n')
  put(root, '.plan/000-backlog.md', 'queue\n')
  put(root, '.plan/001-first.md', 'plan\n')
  put(root, 'scripts/bootstrap.mjs', 'x\n')
  put(root, 'scripts/history.mjs', 'x\n')
  put(root, 'scripts/scaffold/fake.mjs', 'x\n')
  put(root, 'scripts/a.test.mjs', 'x\n')
  put(root, 'CONTRIBUTING.md', 'c\n')
  for (const file of copied) put(root, `scripts/${file}`, readFileSync(path.join(here, file)))
  put(root, '.claude/harness.json', manifestText('f'.repeat(40)))
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'one')
  const first = git(root, 'rev-parse', 'HEAD')
  put(root, '.claude/harness.json', manifestText(pinned ? first : 'f'.repeat(40)))
  git(root, 'commit', '-q', '--allow-empty', '-am', 'two')
  put(root, '.plan/002-second.md', 'plan\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'three')
  git(root, 'branch', 'topic')
  git(root, 'tag', 'v1.0.0')
  return root
}

function clone(source, { shallow = false } = {}) {
  const dest = path.join(temp('detach-clone-'), 'project')
  const url = pathToFileURL(source).href
  const flags = shallow ? ['--depth', '1'] : []
  const run = spawnSync('git', ['clone', '-q', ...flags, url, dest], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  return dest
}

// A repository made from the template: the harness's files in a first commit of its own.
function fromTemplate() {
  const source = origin()
  const root = clone(source)
  rmSync(path.join(root, '.git'), { recursive: true, force: true })
  git(root, 'init', '-q', '--initial-branch=main')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'Initial commit')
  git(root, 'remote', 'add', 'origin', pathToFileURL(source).href)
  return root
}

// What a refusal must leave as it was.
function snapshot(root) {
  const read = (args) => gitRun(root, ...args).stdout
  return {
    head: read(['rev-parse', 'HEAD']),
    refs: read(['for-each-ref']),
    status: read(['status', '--porcelain', '--untracked-files=all']),
    files: read(['ls-files']),
    disk: readdirSync(root).sort(),
  }
}

function refused(root, pattern) {
  const before = snapshot(root)
  assert.throws(() => detach(root, { log: () => {} }), (error) => {
    assert.ok(error instanceof DetachRefusal, String(error))
    assert.match(error.message, pattern)
    return true
  })
  assert.deepEqual(snapshot(root), before)
}

const quiet = { log: () => {} }

describe('detach', () => {
  it("a clone loses the harness's commits", () => {
    const root = clone(origin())
    assert.ok(gitRun(root, 'rev-parse', 'v1.0.0').status === 0, 'the clone has the tag')
    const result = detach(root, quiet)
    assert.equal(result.clone, true)
    assert.equal(result.leftover, null)
    assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.notEqual(gitRun(root, 'rev-parse', '--verify', 'HEAD').status, 0, 'no commit')
    assert.equal(git(root, 'remote'), '')
    assert.equal(git(root, 'tag'), '')
    assert.equal(git(root, 'branch', '-a'), '')
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith('.git-')),
      [],
      'no renamed directory is left',
    )
  })

  it('removes the dev files the bootstrap does not need', () => {
    const root = fromTemplate()
    const head = git(root, 'rev-parse', 'HEAD')
    const result = detach(root, quiet)
    assert.deepEqual(result.removed.sort(), [
      '.plan/001-first.md',
      '.plan/002-second.md',
      'CONTRIBUTING.md',
      'scripts/a.test.mjs',
      'scripts/detach.mjs',
      'scripts/scaffold/fake.mjs',
    ])
    for (const gone of result.removed) assert.equal(existsSync(path.join(root, gone)), false, gone)
    for (const kept of [
      'scripts/bootstrap.mjs',
      'scripts/history.mjs',
      'scripts/manifest.mjs',
      '.plan/000-backlog.md',
      'README.md',
      'AGENTS.md',
    ]) {
      assert.ok(existsSync(path.join(root, kept)), kept)
    }
    assert.equal(existsSync(path.join(root, 'scripts', 'scaffold')), false, 'the empty folder goes')
    assert.equal(git(root, 'rev-parse', 'HEAD'), head, 'nothing is committed')
  })

  it('a template repository keeps its git', () => {
    const root = fromTemplate()
    const head = git(root, 'rev-parse', 'HEAD')
    const result = detach(root, quiet)
    assert.equal(result.clone, false)
    assert.equal(git(root, 'rev-parse', 'HEAD'), head)
    assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.match(git(root, 'remote', '-v'), /^origin\t/)
    const status = gitRun(root, 'status', '--porcelain').stdout.trimEnd().split('\n')
    assert.equal(status.length, result.removed.length)
    assert.ok(status.every((line) => line.startsWith(' D ')), status.join('\n'))
  })

  it('a shallow clone is treated as a clone', () => {
    const root = clone(origin(), { shallow: true })
    assert.equal(git(root, 'rev-parse', '--is-shallow-repository'), 'true')
    const result = detach(root, quiet)
    assert.equal(result.clone, true)
    assert.notEqual(gitRun(root, 'rev-parse', '--verify', 'HEAD').status, 0)
    assert.equal(git(root, 'remote'), '')
  })

  // A release tag can sit on a commit no branch holds; offline it cannot be told from a local one.
  it('a clone with a fetched tag on no branch still detaches', () => {
    const source = origin()
    git(source, 'checkout', '-q', '--detach')
    git(source, 'commit', '-q', '--allow-empty', '-m', 'release')
    git(source, 'tag', 'v2.0.0')
    git(source, 'checkout', '-q', 'main')
    const root = clone(source)
    assert.equal(gitRun(root, 'branch', '-r', '--contains', 'v2.0.0').stdout.trim(), '')
    assert.equal(detach(root, quiet).clone, true)
    assert.equal(git(root, 'tag'), '')
  })

  it('a failure after .git was moved aside puts the repository back', () => {
    const root = clone(origin())
    const head = git(root, 'rev-parse', 'HEAD')
    const failing = (line) => {
      if (/removed \d+ files/.test(line)) throw new Error('disk trouble')
    }
    assert.throws(() => detach(root, { log: failing }), /disk trouble.*git restore/s)
    assert.equal(git(root, 'rev-parse', 'HEAD'), head)
    assert.equal(git(root, 'remote'), 'origin')
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith('.git-')),
      [],
    )
    const status = gitRun(root, 'status', '--porcelain').stdout.trimEnd().split('\n')
    assert.ok(status.every((line) => line.startsWith(' D ')), status.join('\n'))
  })

  it('a repository whose history lacks the pinned commit is not a clone', () => {
    const root = clone(origin({ pinned: false }))
    assert.equal(detach(root, quiet).clone, false)
    assert.equal(git(root, 'remote'), 'origin')
  })

  it('--dry-run changes neither the tree nor the repository', () => {
    for (const root of [clone(origin()), fromTemplate()]) {
      const before = snapshot(root)
      const out = []
      const result = detach(root, { dryRun: true, log: (line) => out.push(line) })
      assert.ok(result.removed.length > 0)
      assert.match(out.join('\n'), /would remove \.plan\/001-first\.md/)
      assert.match(out.join('\n'), result.clone ? /would replace \.git/ : /git is left alone/)
      assert.deepEqual(snapshot(root), before)
    }
  })
})

describe('detach guards', () => {
  it('refuses a dirty tree', () => {
    const root = fromTemplate()
    put(root, 'README.md', 'changed\n')
    refused(root, /not clean/)
  })

  it('refuses an untracked file', () => {
    const root = fromTemplate()
    put(root, 'notes.txt', 'mine\n')
    refused(root, /not clean/)
  })

  it('refuses a bootstrapped tree', () => {
    const root = fromTemplate()
    put(root, '.fullstack/catalog.yaml', 'packages:\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'bootstrapped')
    refused(root, /already bootstrapped/)
  })

  it('refuses a folder that is not a git repository', () => {
    const root = temp('detach-bare-')
    put(root, '.claude/harness.json', manifestText('f'.repeat(40)))
    const ceiling = process.env.GIT_CEILING_DIRECTORIES
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(root)
    try {
      assert.throws(() => detach(root, quiet), /not a git repository/)
    } finally {
      if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES
      else process.env.GIT_CEILING_DIRECTORIES = ceiling
    }
    assert.ok(existsSync(path.join(root, '.claude', 'harness.json')))
  })

  it('refuses a folder nested in another repository', () => {
    const outer = temp('detach-outer-')
    git(outer, 'init', '-q', '--initial-branch=main')
    put(outer, 'sub/.claude/harness.json', manifestText('f'.repeat(40)))
    put(outer, 'sub/scripts/a.test.mjs', 'x\n')
    git(outer, 'add', '-A')
    git(outer, 'commit', '-q', '-m', 'outer')
    const before = snapshot(outer)
    assert.throws(() => detach(path.join(outer, 'sub'), quiet), /inside another git repository/)
    assert.deepEqual(snapshot(outer), before)
  })

  it('refuses a folder that is not the harness', () => {
    const root = temp('detach-plain-')
    git(root, 'init', '-q', '--initial-branch=main')
    assert.throws(() => detach(root, quiet), /not the harness/)
  })

  it('refuses a clone with a second local branch', () => {
    const root = clone(origin())
    git(root, 'branch', 'mine')
    refused(root, /2 local branches/)
  })

  it('refuses a clone with an unpushed commit', () => {
    const root = clone(origin())
    put(root, 'work.txt', 'mine\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'local work')
    refused(root, /no remote-tracking branch/)
  })

  it('refuses a clone whose branch holds an unpushed commit behind a detached HEAD', () => {
    const root = clone(origin())
    put(root, 'work.txt', 'mine\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'local work')
    git(root, 'checkout', '-q', '--detach', 'origin/main')
    refused(root, /no remote-tracking branch/)
  })

  it('refuses a linked worktree of a clone', () => {
    const main = clone(origin())
    const linked = path.join(temp('detach-linked-'), 'wt')
    git(main, 'worktree', 'add', '-q', '--detach', linked)
    refused(linked, /\.git is not a directory/)
  })

  it('refuses a clone with a stash', () => {
    const root = clone(origin())
    put(root, 'README.md', 'changed\n')
    git(root, 'stash', 'push', '-q')
    refused(root, /stash/)
  })

  it('refuses a clone with a second worktree', () => {
    const root = clone(origin())
    const extra = path.join(temp('detach-worktree-'), 'wt')
    git(root, 'worktree', 'add', '-q', '--detach', extra)
    refused(root, /another worktree/)
  })
})

describe('detach as a command', () => {
  function run(root, ...args) {
    return spawnSync(process.execPath, [path.join(root, 'scripts', 'detach.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
    })
  }

  it('exits 1 and changes nothing on a refusal, with no bypass flag', () => {
    const root = clone(origin())
    put(root, 'notes.txt', 'mine\n')
    const before = snapshot(root)
    const refusedRun = run(root)
    assert.equal(refusedRun.status, 1)
    assert.match(refusedRun.stderr, /not clean/)
    assert.equal(run(root, '--force').status, 1)
    assert.deepEqual(snapshot(root), before)
  })

  it('--dry-run prints the removals and exits 0', () => {
    const root = clone(origin())
    const before = snapshot(root)
    const dry = run(root, '--dry-run')
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /would remove scripts\/detach\.mjs/)
    assert.deepEqual(snapshot(root), before)
  })

  it('detaches a clone, removes itself and points at the bootstrap', () => {
    const root = clone(origin())
    const done = run(root)
    assert.equal(done.status, 0, done.stderr)
    assert.match(done.stdout, /bootstrap-project/)
    assert.equal(existsSync(path.join(root, 'scripts', 'detach.mjs')), false)
    assert.notEqual(gitRun(root, 'rev-parse', '--verify', 'HEAD').status, 0)
  })
})

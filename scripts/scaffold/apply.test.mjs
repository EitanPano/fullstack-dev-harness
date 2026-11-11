import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import { applyTrees, decide, sameContent } from './apply.mjs'
import { ScaffoldError } from './request.mjs'

const b = (text) => (text === undefined ? undefined : Buffer.from(text))

describe('decide (the table)', () => {
  const d = (base, next, project) => decide(b(base), b(next), b(project))
  it('does nothing when BASE equals NEXT, whatever the project holds', () => {
    assert.equal(d('a', 'a', 'z').action, 'nothing')
    assert.equal(d(undefined, undefined, 'z').action, 'nothing')
  })
  it('added: writes when the project lacks it or already equals NEXT', () => {
    assert.equal(d(undefined, 'n', undefined).action, 'write')
    assert.equal(d(undefined, 'n', 'n').action, 'nothing')
  })
  it('added: conflicts when the project holds something else', () => {
    assert.deepEqual(d(undefined, 'n', 'x'), { action: 'add-conflict' })
  })
  it('removed: deletes when the project equals BASE', () => {
    assert.equal(d('a', undefined, 'a').action, 'delete')
    assert.equal(d('a', undefined, undefined).action, 'nothing')
    assert.equal(d('a', undefined, 'changed').action, 'removed-conflict')
  })
  it('modified: writes NEXT over an untouched file, conflicts over a deleted one, else merges', () => {
    assert.equal(d('a', 'n', 'a').action, 'write')
    assert.equal(d('a', 'n', undefined).action, 'deleted-conflict')
    assert.equal(d('a', 'n', 'x').action, 'merge')
    assert.equal(d('a', 'n', 'n').action, 'nothing')
  })
  it('compares text with CRLF and LF as equal', () => {
    assert.equal(sameContent(b('a\r\nb\r\n'), b('a\nb\n')), true)
    assert.equal(sameContent(Buffer.from([0, 13, 10]), Buffer.from([0, 10])), false)
    assert.equal(d('a\nb\n', 'n', 'a\r\nb\r\n').action, 'write')
  })
})

describe('applyTrees', () => {
  const roots = []
  let root, baseDir, nextDir, tmp
  const put = (dir, rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
  const run = (baseFiles, nextFiles, dryRun = false) =>
    applyTrees({ root, baseDir, nextDir, baseFiles, nextFiles, tmp, dryRun })
  const action = (entries, rel) => entries.find((e) => e.path === rel)?.action
  beforeEach(() => {
    const top = mkdtempSync(path.join(os.tmpdir(), 'scaffold-apply-'))
    roots.push(top)
    ;[root, baseDir, nextDir, tmp] = ['project', 'base', 'next', 'tmp'].map((n) => {
      mkdirSync(path.join(top, n))
      return path.join(top, n)
    })
  })
  after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

  it('writes added files and deletes removed ones that equal BASE', () => {
    put(baseDir, 'old.txt', 'old\n')
    put(root, 'old.txt', 'old\n')
    put(nextDir, 'new/deep.txt', 'new\n')
    const entries = run(['old.txt'], ['new/deep.txt'])
    assert.equal(read('new/deep.txt'), 'new\n')
    assert.equal(existsSync(path.join(root, 'old.txt')), false)
    assert.equal(action(entries, 'old.txt'), 'delete')
  })
  it('merges a modified file the project also changed', () => {
    put(baseDir, 'a.txt', '1\n2\n3\n4\n5\n')
    put(nextDir, 'a.txt', '1\n2\n3\n4\nfive\n')
    put(root, 'a.txt', 'one\n2\n3\n4\n5\n')
    const entries = run(['a.txt'], ['a.txt'])
    assert.equal(read('a.txt'), 'one\n2\n3\n4\nfive\n')
    assert.equal(action(entries, 'a.txt'), 'merge')
    assert.equal(entries.some((e) => e.conflict), false)
  })
  it('keeps CRLF in a merged project file', () => {
    put(baseDir, 'a.txt', '1\n2\n3\n4\n5\n')
    put(nextDir, 'a.txt', '1\n2\n3\n4\nfive\n')
    put(root, 'a.txt', 'one\r\n2\r\n3\r\n4\r\n5\r\n')
    run(['a.txt'], ['a.txt'])
    assert.equal(read('a.txt'), 'one\r\n2\r\n3\r\n4\r\nfive\r\n')
  })
  it('leaves markers for overlapping edits and lists the conflict', () => {
    put(baseDir, 'a.txt', 'x\n')
    put(nextDir, 'a.txt', 'next\n')
    put(root, 'a.txt', 'mine\n')
    const entries = run(['a.txt'], ['a.txt'])
    assert.match(read('a.txt'), /^<<<<<<< project\nmine\n=======\nnext\n>>>>>>> next\n$/)
    assert.equal(entries[0].conflict, 'merge conflict')
  })
  it('an added file that differs is a conflict against an empty base', () => {
    put(nextDir, 'n.txt', 'next\n')
    put(root, 'n.txt', 'mine\n')
    const entries = run([], ['n.txt'])
    assert.match(read('n.txt'), /<<<<<<< project\nmine\n=======\nnext\n>>>>>>> next/)
    assert.equal(entries[0].conflict, 'added by the part, different here')
  })
  it('keeps a file the part removed but the project changed, and writes nothing for a deleted one', () => {
    put(baseDir, 'r.txt', 'base\n')
    put(root, 'r.txt', 'mine\n')
    put(baseDir, 'm.txt', 'base\n')
    put(nextDir, 'm.txt', 'next\n')
    const entries = run(['r.txt', 'm.txt'], ['m.txt'])
    assert.equal(read('r.txt'), 'mine\n')
    assert.equal(existsSync(path.join(root, 'm.txt')), false)
    const cases = Object.fromEntries(entries.map((e) => [e.path, e.conflict]))
    assert.equal(cases['r.txt'], 'removed by the part, changed here')
    assert.equal(cases['m.txt'], 'deleted here, changed by the part')
  })
  it('never merges lockfiles: writes an added one only into a project without it', () => {
    put(baseDir, 'bun.lock', 'a\n')
    put(nextDir, 'bun.lock', 'b\n')
    put(root, 'bun.lock', 'mine\n')
    put(nextDir, 'backend/uv.lock', 'lock\n')
    put(nextDir, 'frontend/bun.lock', 'lock\n')
    put(root, 'frontend/bun.lock', 'mine\n')
    const entries = run(['bun.lock'], ['bun.lock', 'backend/uv.lock', 'frontend/bun.lock'])
    assert.equal(read('bun.lock'), 'mine\n')
    assert.equal(read('backend/uv.lock'), 'lock\n')
    assert.equal(read('frontend/bun.lock'), 'mine\n')
    assert.equal(action(entries, 'bun.lock'), 'lockfile-left')
    assert.equal(entries.some((e) => e.conflict), false)
  })
  it('appends only the missing fullstack-templates sections to the root .gitignore', () => {
    const h = (n) => `# --- fullstack-templates: ${n} ---`
    put(baseDir, '.gitignore', `${h('frontend')}\ndist/\n`)
    put(nextDir, '.gitignore', `${h('frontend')}\ndist/\n\n${h('backend')}\n.venv/\n__pycache__/\n`)
    put(root, '.gitignore', `mine\n${h('frontend')}\ndist/\n`)
    run(['.gitignore'], ['.gitignore'])
    assert.equal(read('.gitignore'), `mine\n${h('frontend')}\ndist/\n\n${h('backend')}\n.venv/\n__pycache__/\n`)
    const again = run(['.gitignore'], ['.gitignore'])
    assert.equal(action(again, '.gitignore'), 'nothing')
  })
  it('keeps the project generatedAt in the provenance merge', () => {
    const yaml = (stamp, extra) => `generatedAt: ${stamp}\nstack: null\n${extra}`
    put(baseDir, '.fullstack/catalog.yaml', yaml('T1', 'packages: a\n'))
    put(nextDir, '.fullstack/catalog.yaml', yaml('T2', 'packages: a\nmore: b\n'))
    put(root, '.fullstack/catalog.yaml', yaml('T0', 'packages: a\n'))
    const entries = run(['.fullstack/catalog.yaml'], ['.fullstack/catalog.yaml'])
    assert.equal(read('.fullstack/catalog.yaml'), yaml('T0', 'packages: a\nmore: b\n'))
    assert.equal(entries.some((e) => e.conflict), false)
  })
  it('a dry run reports the same actions and writes nothing', () => {
    put(baseDir, 'a.txt', 'x\n')
    put(nextDir, 'a.txt', 'next\n')
    put(root, 'a.txt', 'mine\n')
    put(nextDir, 'new.txt', 'n\n')
    const entries = run(['a.txt'], ['a.txt', 'new.txt'], true)
    assert.equal(read('a.txt'), 'mine\n')
    assert.equal(existsSync(path.join(root, 'new.txt')), false)
    assert.equal(action(entries, 'new.txt'), 'write')
    assert.equal(entries.find((e) => e.path === 'a.txt').conflict, 'merge conflict')
  })

  it('refuses a crafted path before writing anything', () => {
    put(nextDir, 'ok.txt', 'ok\n')
    for (const bad of ['../evil.txt', '/abs.txt', 'a\\b.txt', 'C:/x.txt']) {
      assert.throws(
        () => run([], ['ok.txt', bad]),
        (e) => e instanceof ScaffoldError && e.exit === 2 && /outside the project/.test(e.message),
      )
    }
    assert.equal(existsSync(path.join(root, 'ok.txt')), false)
    assert.equal(existsSync(path.join(path.dirname(root), 'evil.txt')), false)
  })
  it('on a write failure names what was written and how to restore the clean start', () => {
    put(nextDir, 'a.txt', 'a\n')
    put(nextDir, 'dir/x.txt', 'x\n')
    writeFileSync(path.join(root, 'dir'), 'a file where a folder is needed')
    assert.throws(
      () => run([], ['a.txt', 'dir/x.txt']),
      (e) =>
        e instanceof ScaffoldError &&
        e.exit === 3 &&
        /already written: a\.txt/.test(e.message) &&
        /git checkout -- \./.test(e.message) &&
        /untracked/.test(e.message),
    )
  })
  it('marks which conflicts hold markers', () => {
    put(baseDir, 'm.txt', 'x\n')
    put(nextDir, 'm.txt', 'next\n')
    put(root, 'm.txt', 'mine\n')
    put(baseDir, 'r.txt', 'base\n')
    put(root, 'r.txt', 'mine\n')
    const entries = run(['m.txt', 'r.txt'], ['m.txt'])
    const markers = Object.fromEntries(entries.map((e) => [e.path, e.markers]))
    assert.deepEqual(markers, { 'm.txt': true, 'r.txt': false })
  })
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { seedPackageDocs } from './package-doc.mjs'

const script = fileURLToPath(new URL('./package-doc.mjs', import.meta.url))
const made = []
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const entry = (dir, template, flags = '') =>
  `  ${dir}:\n    template: ${template}\n    flags: ${flags === '' ? '{}' : `{ ${flags} }`}\n`
const dirOf = (text) => /^ {2}(\S+):$/m.exec(text)[1]
const MARKER = /<!--\s*(no)?auth|auth-(start|end)/

function tempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'package-doc-'))
  made.push(root)
  return root
}

// A project root holding the provenance file and the packages' directories.
function project(packages, { dirs = true, nested = false } = {}) {
  // Nested, a path that leaves the root lands in a folder of the test's own.
  const root = nested ? path.join(tempRoot(), 'proj') : tempRoot()
  mkdirSync(path.join(root, '.fullstack'), { recursive: true })
  writeFileSync(path.join(root, '.fullstack', 'catalog.yaml'), `packages:\n${packages.join('')}`)
  if (dirs) {
    for (const text of packages) {
      const dir = dirOf(text)
      if (!dir.startsWith('..')) mkdirSync(path.join(root, dir), { recursive: true })
    }
  }
  return root
}
const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8')
const withAuth = () => [
  entry('backend', 'server/bun-express', 'auth: true'),
  entry('frontend', 'frontend/react'),
]

test('a server and a frontend get their files, markers intact', () => {
  const root = project(withAuth())
  const { written, skipped } = seedPackageDocs(root)
  assert.deepEqual(written.sort(), [
    'backend/.doc/architecture.md',
    'frontend/.doc/architecture.md',
    'frontend/.doc/design.md',
  ])
  assert.deepEqual(skipped, [])
  for (const rel of written) assert.match(read(root, rel), /<!-- FILL:/)
})

test('seeding twice writes nothing the second time', () => {
  const root = project(withAuth())
  seedPackageDocs(root)
  assert.deepEqual(seedPackageDocs(root).written, [])
})

test('an edited file keeps its bytes; a deleted file is written again alone', () => {
  const root = project(withAuth())
  seedPackageDocs(root)
  const edited = path.join(root, 'frontend/.doc/design.md')
  writeFileSync(edited, 'mine\n')
  rmSync(path.join(root, 'backend/.doc/architecture.md'))
  assert.deepEqual(seedPackageDocs(root).written, ['backend/.doc/architecture.md'])
  assert.equal(readFileSync(edited, 'utf8'), 'mine\n')
})

test('a second frontend gets its own files and the first stays byte-identical', () => {
  const root = project(withAuth())
  seedPackageDocs(root)
  writeFileSync(path.join(root, 'frontend/.doc/design.md'), 'project text\n')
  mkdirSync(path.join(root, 'admin'))
  writeFileSync(
    path.join(root, '.fullstack', 'catalog.yaml'),
    `packages:\n${[...withAuth(), entry('admin', 'frontend/vue')].join('')}`,
  )
  assert.deepEqual(seedPackageDocs(root).written.sort(), [
    'admin/.doc/architecture.md',
    'admin/.doc/design.md',
  ])
  assert.equal(read(root, 'frontend/.doc/design.md'), 'project text\n')
})

test('a dirs filter seeds only those packages, the older ones stay without a .doc', () => {
  const root = project([...withAuth(), entry('admin', 'frontend/vue')])
  const { written } = seedPackageDocs(root, { dirs: ['admin'] })
  assert.deepEqual(written.sort(), ['admin/.doc/architecture.md', 'admin/.doc/design.md'])
  assert.equal(existsSync(path.join(root, 'backend', '.doc')), false)
  assert.equal(existsSync(path.join(root, 'frontend', '.doc')), false)
  assert.deepEqual(seedPackageDocs(root, { dirs: [] }).written, [])
})

test('with accounts the auth block stays and no marker is left', () => {
  const root = project(withAuth())
  seedPackageDocs(root)
  const text = read(root, 'backend/.doc/architecture.md')
  assert.doesNotMatch(text, MARKER)
  assert.match(text, /JWT access token/)
  assert.doesNotMatch(text, /Auth: none/)
})

test('without accounts the server file says so and holds no marker', () => {
  const root = project([entry('backend', 'server/bun-express', 'auth: false')])
  seedPackageDocs(root)
  const text = read(root, 'backend/.doc/architecture.md')
  assert.doesNotMatch(text, MARKER)
  assert.match(text, /- Auth: none\./)
  assert.doesNotMatch(text, /JWT access token/)
})

test('a serverless package gets the serverless skeleton, with no auth text', () => {
  const root = project([entry('serverless/cloudflare', 'serverless/cloudflare')])
  const { written } = seedPackageDocs(root)
  assert.deepEqual(written, ['serverless/cloudflare/.doc/architecture.md'])
  const text = read(root, written[0])
  assert.doesNotMatch(text, MARKER)
  assert.doesNotMatch(text, /Auth: none|JWT access token/)
  assert.match(text, /<!-- FILL:/)
})

test('an sdk package gets the sdk skeleton, with no design file and no auth text', () => {
  const root = project([
    entry('backend', 'server/bun-express', 'auth: true'),
    entry('sdk-widget', 'sdk/browser'),
  ])
  const { written } = seedPackageDocs(root, { dirs: ['sdk-widget'] })
  assert.deepEqual(written, ['sdk-widget/.doc/architecture.md'])
  const text = read(root, written[0])
  assert.match(text, /^## Modules$/m)
  assert.match(text, /^## Public API$/m)
  assert.match(text, /<!-- FILL:/)
  assert.doesNotMatch(text, MARKER)
  assert.doesNotMatch(text, /^## Routes$/m)
})

test('a template kind with no skeleton is skipped without error', () => {
  const root = project([entry('tool', 'cli/thing'), entry('site', 'frontend/astro')])
  assert.deepEqual(seedPackageDocs(root).written.sort(), [
    'site/.doc/architecture.md',
    'site/.doc/design.md',
  ])
})

test('a recorded package whose directory is missing is skipped and reported, not created', () => {
  const root = project(withAuth(), { dirs: false })
  mkdirSync(path.join(root, 'frontend'))
  const { written, skipped } = seedPackageDocs(root)
  assert.deepEqual(skipped, ['backend'])
  assert.equal(existsSync(path.join(root, 'backend')), false)
  assert.ok(written.every((rel) => rel.startsWith('frontend/')))
})

test('a package directory outside the root is refused and nothing is written', () => {
  const root = project([...withAuth(), entry('../escape', 'frontend/react')], { nested: true })
  assert.throws(() => seedPackageDocs(root), /\.\.\/escape/)
  assert.equal(existsSync(path.join(root, 'frontend', '.doc')), false)
  assert.equal(existsSync(path.join(path.dirname(root), 'escape')), false)
})

test('a .doc folder that resolves outside the root through a link is refused', (t) => {
  const root = project(withAuth())
  const outside = tempRoot()
  try {
    symlinkSync(outside, path.join(root, 'frontend', '.doc'), 'junction')
  } catch {
    return t.skip('links are not allowed here')
  }
  assert.throws(() => seedPackageDocs(root), /frontend\/\.doc/)
  assert.deepEqual(readdirSync(outside), [])
})

test('the resolved server skeleton has no double blank line', () => {
  for (const flag of ['auth: true', 'auth: false']) {
    const root = project([entry('backend', 'server/bun-express', flag)])
    seedPackageDocs(root)
    assert.doesNotMatch(read(root, 'backend/.doc/architecture.md'), /\n\n\n/)
  }
})

test('without .fullstack/catalog.yaml the command fails with a message', () => {
  const root = tempRoot()
  assert.throws(() => seedPackageDocs(root), /\.fullstack\/catalog\.yaml/)
  const run = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /\.fullstack\/catalog\.yaml/)
})

test('the command prints what it wrote and skipped, then that nothing was missing', () => {
  const root = project(withAuth())
  const run = () => spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  assert.match(run().stdout, /wrote backend\/\.doc\/architecture\.md/)
  assert.match(run().stdout, /nothing missing/)
  rmSync(path.join(root, 'backend'), { recursive: true })
  assert.match(run().stdout, /skipped backend: no such directory/)
  assert.match(
    spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' }).stdout,
    /usage: node scripts\/package-doc\.mjs/,
  )
})

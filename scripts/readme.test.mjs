import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  PACKAGE_BLOCKS,
  extractConfiguration,
  parseEnvExample,
  renderConfiguration,
  renderPackageBlocks,
  replaceConfiguration,
  replacePackageBlocks,
} from './readme.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'readme.mjs')
const START = '<!-- configuration:start -->'
const END = '<!-- configuration:end -->'
const EXAMPLE = '.env.example'
const bases = []
const tests = []
const test = (name, run) => tests.push([name, run])

function repo(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'readme-'))
  bases.push(root)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  spawnSync('git', ['init', '-q'], { cwd: root })
  spawnSync('git', ['add', '-A'], { cwd: root })
  return root
}

const cli = (root, ...args) =>
  spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })

after(() => {
  for (const dir of bases) rmSync(dir, { recursive: true, force: true })
})

test('a comment block directly above a variable is its description, a header is not', () => {
  const text = '# File header.\n\n# Port the\n# API uses.\nPORT=4000\nNAME=x\n'
  assert.deepEqual(parseEnvExample(text), [
    { name: 'PORT', description: 'Port the API uses.', value: '4000', optional: false },
    { name: 'NAME', description: '', value: 'x', optional: false },
  ])
})

test('an empty value and a change-me placeholder have no default', () => {
  const vars = parseEnvExample('A=\nB=change-me-please\nC=ok\n')
  assert.deepEqual(
    vars.map((v) => v.value),
    [undefined, undefined, 'ok'],
  )
})

test('a commented assignment is an optional variable, other comments are prose', () => {
  const text =
    '# Header header.\n# Sets the header.\n# CLIENT_IP_HEADER=x-real-ip\n# NOTE=not a var\n# Set a=b here\nX=1\n'
  const vars = parseEnvExample(text)
  assert.equal(vars[0].name, 'CLIENT_IP_HEADER')
  assert.equal(vars[0].optional, true)
  assert.equal(vars[0].value, 'x-real-ip')
  assert.equal(vars[0].description, 'Header header. Sets the header.')
  assert.equal(vars[1].name, 'NOTE')
  assert.equal(vars[2].description, 'Set a=b here')
  assert.equal(parseEnvExample('# LONE\n# BARE=\n')[0].value, undefined)
})

test('CRLF input parses like LF', () => {
  assert.deepEqual(parseEnvExample('# d\r\nA=1\r\n'), parseEnvExample('# d\nA=1\n'))
})

test('the block renders rows with dashes, backticks and optional defaults', () => {
  const root = repo({
    [EXAMPLE]: '# One | two.\nA=1\nB=\nC=change-me-x\n# Maybe.\n# D=ex\n# E=\n',
  })
  const lines = renderConfiguration(root).split('\n')
  assert.deepEqual(lines, [
    START,
    '| Variable | Description | Default |',
    '| --- | --- | --- |',
    '| `A` | One \\| two. | `1` |',
    '| `B` |  | — |',
    '| `C` |  | — |',
    '| `D` | Maybe. | optional (example `ex`) |',
    '| `E` |  | optional |',
    END,
  ])
})

test('several files are sorted by path and prefixed with their directory', () => {
  const root = repo({
    [`frontend/${EXAMPLE}`]: '# Server URL.\nPORT=3000\n',
    [`backend/${EXAMPLE}`]: '# Port the API listens on.\nPORT=4000\n',
  })
  const rows = renderConfiguration(root).split('\n').slice(3, -1)
  assert.deepEqual(rows, [
    '| `PORT` | backend: Port the API listens on. | `4000` |',
    '| `PORT` | frontend: Server URL. | `3000` |',
  ])
})

test('an empty comment line adds no double space', () => {
  assert.equal(parseEnvExample('# a\n#\n# b\nX=1\n')[0].description, 'a b')
})

test('an example deleted but not staged leaves the table', () => {
  const root = repo({
    [`backend/${EXAMPLE}`]: 'A=1\n',
    [`frontend/${EXAMPLE}`]: 'B=2\n',
    'README.md': `${START}\nx\n${END}\n`,
  })
  spawnSync('git', ['-c', 'user.email=t@e.x', '-c', 'user.name=t', 'commit', '-qm', 'i'], {
    cwd: root,
  })
  rmSync(path.join(root, 'backend', EXAMPLE))
  const rows = renderConfiguration(root).split('\n').slice(3, -1)
  assert.deepEqual(rows, ['| `B` |  | `2` |'])
  assert.equal(cli(root, '--configuration').status, 0)
})

test('no example file renders the sentence', () => {
  const root = repo({ 'a.txt': 'x' })
  assert.equal(
    renderConfiguration(root),
    `${START}\nThis project reads no environment variables.\n${END}`,
  )
})

test('replaceConfiguration swaps the block and keeps CRLF', () => {
  const block = `${START}\nnew\n${END}`
  const text = `# T\r\n${START}\r\nold\r\nolder\r\n${END}\r\nafter\r\n`
  assert.equal(replaceConfiguration(text, block), `# T\r\n${START}\r\nnew\r\n${END}\r\nafter\r\n`)
  assert.equal(replaceConfiguration(`a\n${START}\nx\n${END}`, block), `a\n${block}`)
  assert.equal(extractConfiguration(`a\r\n${START}\r\nx\r\n${END}\r\nb`), `${START}\nx\n${END}`)
})

test('replaceConfiguration throws on missing, duplicated or reversed markers', () => {
  const block = `${START}\nn\n${END}`
  assert.throws(() => replaceConfiguration('nothing', block), /marker/)
  assert.throws(() => replaceConfiguration(`${START}\nx\n`, block), /marker/)
  assert.throws(() => replaceConfiguration(`${START}\n${END}\n${START}\n${END}`, block), /marker/)
  assert.throws(() => replaceConfiguration(`${END}\n${START}`, block), /order/)
})

test('the CLI rewrites only the block', () => {
  const root = repo({
    [EXAMPLE]: 'A=1\n',
    'README.md': `# T\n\n${START}\nstale\n${END}\n\nTail\n`,
  })
  const run = cli(root, '--configuration')
  assert.equal(run.status, 0, run.stderr)
  const text = readFileSync(path.join(root, 'README.md'), 'utf8')
  assert.ok(text.startsWith('# T\n\n'))
  assert.ok(text.endsWith('\n\nTail\n'))
  assert.ok(text.includes('| `A` |  | `1` |'))
  assert.equal(cli(root, '--configuration', '--root', root).status, 0)
})

test('the CLI fails with one line on a missing README or markers, usage on bad args', () => {
  const root = repo({ 'x.txt': '' })
  const noReadme = cli(root, '--configuration')
  assert.equal(noReadme.status, 1)
  assert.match(noReadme.stderr, /README\.md/)
  writeFileSync(path.join(root, 'README.md'), '# T\n')
  const noMarkers = cli(root, '--configuration')
  assert.equal(noMarkers.status, 1)
  assert.equal(noMarkers.stderr.trim().split('\n').length, 1)
  const bad = cli(root, '--nope')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /usage/)
  assert.equal(cli(root).status, 2)
})

// A catalog checkout holds only the template.yaml files the tool lists are read from.
const CATALOG_YAML = (pkgs) =>
  `deploy: split\npackages:\n${pkgs
    .map(
      ([dir, template, port]) =>
        `  ${dir}:\n    template: ${template}\n    commands:\n      install: bun install\n` +
        `      dev: bun run dev\n      check: bun run check\n    http:\n      port: ${port}\n`,
    )
    .join('')}`
const TEMPLATES = {
  'frontend/react/template.yaml': "tools:\n  - { name: bun, min: '1.4' }\n",
  'server/bun-express/template.yaml': "tools:\n  - { name: uv, min: '0.12' }\n",
}
const LOCK = JSON.stringify({
  repository: 'https://example.test/c',
  version: 'v1.0.0',
  commit: 'a'.repeat(40),
})
const pair = (name, body) => `<!-- ${name}:start -->\n${body}\n<!-- ${name}:end -->`
const blocksReadme = (extra = '') =>
  `# T\n\n${PACKAGE_BLOCKS.map((n) => pair(n, `old ${n}`)).join('\n\n')}\n\n` +
  `${START}\nstale\n${END}\n${extra}`

function project(pkgs, readme) {
  const catalog = mkdtempSync(path.join(tmpdir(), 'readme-cat-'))
  bases.push(catalog)
  for (const [file, text] of Object.entries({ 'index.yaml': 'schemaVersion: 1\n', ...TEMPLATES })) {
    mkdirSync(path.dirname(path.join(catalog, file)), { recursive: true })
    writeFileSync(path.join(catalog, file), text)
  }
  const root = repo({
    '.fullstack/catalog.yaml': CATALOG_YAML(pkgs),
    'catalog.lock': LOCK,
    'README.md': readme,
  })
  return { root, catalog }
}

test('renderPackageBlocks wraps every block in its own marker pair', () => {
  const { root, catalog } = project([['frontend', 'frontend/react', 3000]], '# T\n')
  const blocks = renderPackageBlocks(root, catalog, { name: 'demo' })
  assert.deepEqual(Object.keys(blocks), PACKAGE_BLOCKS)
  for (const name of PACKAGE_BLOCKS) {
    assert.ok(blocks[name].startsWith(`<!-- ${name}:start -->\n`), name)
    assert.ok(blocks[name].endsWith(`\n<!-- ${name}:end -->`), name)
  }
  assert.match(blocks.prerequisites, /- bun 1\.4\+/)
  assert.match(blocks.installation, /git clone <repository-url>\ncd demo\n# frontend\ncd frontend\nbun install/)
  assert.match(blocks['usage-notes'], /http:\/\/localhost:3000/)
  assert.doesNotMatch(blocks['usage-notes'], /[Cc]ompose/)
})

test('replacePackageBlocks swaps the text between the markers and nothing else', () => {
  const text = blocksReadme('Tail\n')
  const out = replacePackageBlocks(text, { usage: pair('usage', 'NEW') })
  assert.ok(out.includes(pair('usage', 'NEW')))
  assert.ok(!out.includes('old usage\n'))
  assert.ok(out.includes('old tests') && out.endsWith('Tail\n'))
  assert.equal(replacePackageBlocks(text.replace(/\n/g, '\r\n'), {}).includes('\r\n'), true)
})

test('replacePackageBlocks names the block whose markers are missing or doubled', () => {
  assert.throws(() => replacePackageBlocks('# T\n', { tests: 'x' }), /<!-- tests:start -->/)
  const twice = `${pair('tests', '')}\n${pair('tests', '')}`
  assert.throws(() => replacePackageBlocks(twice, { tests: 'x' }), /exactly one/)
})

test('--packages re-renders the blocks after a part is added, keeping the clone lines', () => {
  const { root, catalog } = project([['frontend', 'frontend/react', 3000]], '')
  const first = renderPackageBlocks(root, catalog, { name: 'demo' })
  writeFileSync(path.join(root, 'README.md'), `# T\n\n${Object.values(first).join('\n\n')}\n\nTail\n`)
  writeFileSync(
    path.join(root, '.fullstack', 'catalog.yaml'),
    CATALOG_YAML([
      ['frontend', 'frontend/react', 3000],
      ['backend', 'server/bun-express', 4000],
    ]),
  )
  const run = cli(root, '--packages', '--templates', catalog)
  assert.equal(run.status, 0, run.stderr)
  const text = readFileSync(path.join(root, 'README.md'), 'utf8')
  assert.match(text, /- uv 0\.12\+/)
  assert.match(text, /cd demo\n# frontend\ncd frontend\nbun install\ncd \.\.\n# backend\ncd backend/)
  assert.ok(text.endsWith('\n\nTail\n'))
  assert.equal(cli(root, '--packages', '--templates', catalog).status, 0)
  assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), text)
})

test('--packages with --configuration does both', () => {
  const { root, catalog } = project([['frontend', 'frontend/react', 3000]], blocksReadme())
  const run = cli(root, '--packages', '--configuration', '--templates', catalog)
  assert.equal(run.status, 0, run.stderr)
  const text = readFileSync(path.join(root, 'README.md'), 'utf8')
  assert.ok(!text.includes('old prerequisites') && !text.includes('stale'))
  assert.match(text, /This project reads no environment variables/)
})

test('--packages on a README without the markers fails clearly and writes nothing', () => {
  const { root, catalog } = project([['frontend', 'frontend/react', 3000]], '# T\n')
  const run = cli(root, '--packages', '--templates', catalog)
  assert.equal(run.status, 1)
  assert.match(run.stderr, /<!-- prerequisites:start -->/)
  assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), '# T\n')
})

test('--packages reports an unusable catalog lock as one line', () => {
  const { root, catalog } = project([['frontend', 'frontend/react', 3000]], blocksReadme())
  writeFileSync(path.join(root, 'catalog.lock'), '{}')
  const run = cli(root, '--packages', '--templates', catalog)
  assert.equal(run.status, 1)
  assert.match(run.stderr, /catalog\.lock/)
})

describe('readme', { concurrency: 6 }, () => {
  for (const [name, run] of tests) it(name, run)
})

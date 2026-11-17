import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { CACHE_DIR, VERSION, guidance } from './guidance.mjs'

// A fake runner stands in for bun: it records each call and, for `retrieve`, writes the guide to
// the file the script hands it, as the real child writes to its stdout.
function setup(reply = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'guidance-'))
  const calls = []
  const runner = (command, args, options) => {
    calls.push({ args: [command, args], options })
    const result = typeof reply === 'function' ? reply(args, options) : reply
    if (options.stdoutFile && result.guide !== undefined) writeFileSync(options.stdoutFile, result.guide)
    return { status: 0, stdout: '', stderr: '', ...result }
  }
  const out = []
  const err = []
  const run = (argv) =>
    guidance(argv, { root, runner, out: (l) => out.push(l), err: (l) => err.push(l) })
  return { root, calls, out, err, run, cache: path.join(root, ...CACHE_DIR.split('/')) }
}

test('forces telemetry off', () => {
  const t = setup({ stdout: '[]' })
  const previous = process.env.DISABLE_TELEMETRY
  process.env.DISABLE_TELEMETRY = '0'
  try {
    assert.equal(t.run(['search', 'confirm', 'dialog']), 0)
  } finally {
    if (previous === undefined) delete process.env.DISABLE_TELEMETRY
    else process.env.DISABLE_TELEMETRY = previous
  }
  assert.equal(t.calls[0].options.env.DISABLE_TELEMETRY, '1')
  assert.equal(t.calls[0].options.env.PATH ?? t.calls[0].options.env.Path, process.env.PATH ?? process.env.Path)
})

test('pins an exact version', () => {
  const t = setup({ stdout: '[]' })
  t.run(['search', 'confirm', 'dialog'])
  assert.match(VERSION, /^\d+\.\d+\.\d+$/)
  assert.deepEqual(t.calls[0].args, [
    'bun',
    ['x', `modern-web-guidance@${VERSION}`, 'search', 'confirm dialog'],
  ])
  assert.ok(!t.calls[0].args.flat().some((a) => a.includes('--skill-version')))
  assert.ok(!t.calls[0].args.flat().some((a) => /@(latest|next)|[\^~]/.test(a)))
})

test('search prints the child output as is', () => {
  const t = setup({ stdout: '[{"id":"dialog"}]\n' })
  assert.equal(t.run(['search', 'dialog']), 0)
  assert.equal(t.out.join(''), '[{"id":"dialog"}]\n')
})

test('refuses other sub-commands', () => {
  for (const argv of [[], ['install'], ['uninstall'], ['update'], ['list'], ['legacy-scan'], ['set-x', 'y']]) {
    const t = setup()
    assert.equal(t.run(argv), 2, argv.join(' '))
    assert.equal(t.err.length, 1)
    assert.match(t.err[0], /usage/)
    assert.equal(t.calls.length, 0)
  }
})

test('refuses an empty query or id list', () => {
  for (const argv of [['search'], ['retrieve']]) {
    const t = setup()
    assert.equal(t.run(argv), 2)
    assert.equal(t.calls.length, 0)
  }
})

test('refuses a path id', () => {
  for (const id of ['../x', 'a/b', 'C:\\x', 'A', 'x.md', '']) {
    const t = setup({ guide: 'g' })
    assert.equal(t.run(['retrieve', id]), 2, id)
    assert.equal(t.err.length, 1)
    assert.equal(t.calls.length, 0)
    assert.ok(!existsSync(t.cache))
  }
  const t = setup({ guide: 'g' })
  assert.equal(t.run(['retrieve', 'ok-id,../x']), 2)
  assert.equal(t.calls.length, 0)
})

test('writes inside the cache', () => {
  const t = setup({ guide: '# Dialog\nbody' })
  assert.equal(t.run(['retrieve', 'dialog,popover']), 0)
  assert.deepEqual(readdirSync(t.cache).sort(), ['dialog.md', 'popover.md'])
  assert.equal(readFileSync(path.join(t.cache, 'dialog.md'), 'utf8'), '# Dialog\nbody')
  assert.equal(t.calls[0].options.stdoutFile.startsWith(t.cache), true)
  assert.deepEqual(t.calls[0].args, ['bun', ['x', `modern-web-guidance@${VERSION}`, 'retrieve', 'dialog']])
  assert.deepEqual(t.out, [
    `.orchestrate/guidance/${VERSION}/dialog.md 13
`,
    `.orchestrate/guidance/${VERSION}/popover.md 13
`,
  ])
})

test('rewrites cross-references to the script', () => {
  const body =
    'see (via `npx -y modern-web-guidance@' + 'latest retrieve "a-b"`) and `bunx modern-web-guidance retrieve c`\r\n' +
    'also npx modern-web-guidance@1.0.1 retrieve d; keep modern-web-guidance search\n'
  const t = setup({ guide: body })
  assert.equal(t.run(['retrieve', 'dialog']), 0)
  const expected =
    'see (via `node scripts/guidance.mjs retrieve "a-b"`) and `node scripts/guidance.mjs retrieve c`\r\n' +
    'also node scripts/guidance.mjs retrieve d; keep modern-web-guidance search\n'
  const file = path.join(t.cache, 'dialog.md')
  assert.equal(readFileSync(file, 'utf8'), expected)
  assert.deepEqual(t.out, [`.orchestrate/guidance/${VERSION}/dialog.md ${Buffer.byteLength(expected)}
`])
})

test('reuses a cached guide', () => {
  const t = setup({ guide: 'x' })
  mkdirSync(t.cache, { recursive: true })
  writeFileSync(path.join(t.cache, 'dialog.md'), 'cached')
  assert.equal(t.run(['retrieve', 'dialog']), 0)
  assert.equal(t.calls.length, 0)
  assert.deepEqual(t.out, [`.orchestrate/guidance/${VERSION}/dialog.md 6
`])
})

test('does not trust an empty cached guide', () => {
  const t = setup({ guide: 'fresh' })
  mkdirSync(t.cache, { recursive: true })
  writeFileSync(path.join(t.cache, 'dialog.md'), '')
  assert.equal(t.run(['retrieve', 'dialog']), 0)
  assert.equal(t.calls.length, 1)
  assert.equal(readFileSync(path.join(t.cache, 'dialog.md'), 'utf8'), 'fresh')
})

test('fails in one line', () => {
  const cases = [
    [{ error: Object.assign(new Error('spawn bun ENOENT'), { code: 'ENOENT' }) }, /bun/],
    [
      { status: 1, stderr: 'Resolving dependencies\nerror: ConnectionRefused downloading package manifest modern-web-guidance\n' },
      /ConnectionRefused/,
    ],
    [
      {
        status: 1,
        stderr:
          'Resolved, downloaded and extracted [4]\nRetrieve failed for x: Error: No guide found for use case: x\n    at foo (file.js:1:1)\n    at bar (file.js:2:2)\n',
      },
      /No guide found for use case: x/,
    ],
    [{ error: Object.assign(new Error('spawnSync bun ETIMEDOUT'), { code: 'ETIMEDOUT' }) }, /timed out/],
    [{ status: 1, stderr: '' }, /exit/],
  ]
  for (const [reply, pattern] of cases) {
    for (const argv of [['search', 'q'], ['retrieve', 'x']]) {
      const t = setup({ ...reply, guide: reply.status === 1 ? 'partial' : undefined })
      assert.equal(t.run(argv), 1)
      assert.equal(t.err.length, 1)
      assert.match(t.err[0], /^guidance: [^\n]+$/)
      assert.match(t.err[0], pattern)
      assert.doesNotMatch(t.err[0], /\n|\s+at /)
      if (argv[0] === 'retrieve') {
        assert.ok(!existsSync(path.join(t.cache, 'x.md')))
        assert.deepEqual(existsSync(t.cache) ? readdirSync(t.cache) : [], [])
      }
    }
  }
})

test('removes the temp file when the child writes nothing', () => {
  const t = setup({ status: 0, guide: '' })
  assert.equal(t.run(['retrieve', 'x']), 1)
  assert.equal(t.err.length, 1)
  assert.deepEqual(readdirSync(t.cache), [])
})

test('refuses an id that starts with a hyphen', () => {
  const t = setup({ guide: 'usage' })
  assert.equal(t.run(['retrieve', '-h']), 2)
  assert.equal(t.calls.length, 0)
})

test('runs the child from the repository root', () => {
  const t = setup({ stdout: '[]' })
  assert.equal(t.run(['search', 'dialog']), 0)
  assert.equal(t.calls[0].options.cwd, t.root)
})

test('reports a file system failure in one line', () => {
  const t = setup({ guide: '# Dialog' })
  writeFileSync(path.join(t.root, '.orchestrate'), 'not a directory')
  assert.equal(t.run(['retrieve', 'dialog']), 1)
  assert.equal(t.err.length, 1)
  assert.match(t.err[0], /^guidance: [^\n]+$/)
})

test('prints the guides fetched before a failure', () => {
  const t = setup((args) => (args[3] === 'dialog' ? { guide: '# Dialog' } : { status: 1, stderr: 'error: no guide' }))
  assert.equal(t.run(['retrieve', 'dialog,missing']), 1)
  assert.deepEqual(t.out, [`${CACHE_DIR}/dialog.md 8\n`])
  assert.equal(t.err.length, 1)
})

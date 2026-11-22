import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./bootstrap.mjs', import.meta.url))

// Both folders sit under the OS temp dir, outside any git repository. The cache points at an
// empty folder so a regression that skips the preflight cannot reach a real catalog cache.
function runOutsideGit(extraArgs) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-root-'))
  const cache = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-cache-'))
  try {
    const result = spawnSync(
      process.execPath,
      [script, '--stack', 'x', '--name', 'y', '--root', root, ...extraArgs],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FULLSTACK_TEMPLATES_CACHE: cache,
          FULLSTACK_TEMPLATES_DIR: '',
          GIT_CEILING_DIRECTORIES: path.dirname(root),
        },
      },
    )
    return result
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(cache, { recursive: true, force: true })
  }
}

test('outside a git work tree it exits 1 with the preflight message before fetching', () => {
  const result = runOutsideGit([])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /not inside a git work tree/)
  assert.match(result.stderr, /git init/)
  assert.doesNotMatch(result.stdout, /Reading catalog\.lock|cloning/)
})

// --fetch writes no project, so it must work where the root is no git work tree. GIT_DIR points
// git at nothing, which makes every work tree check fail; the fixture catalog keeps it offline.
test('--fetch skips the preflight and prints the index of a local catalog', () => {
  const catalog = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-catalog-'))
  try {
    mkdirSync(path.join(catalog, 'tools'))
    writeFileSync(path.join(catalog, 'tools', 'package.json'), '{}\n')
    writeFileSync(path.join(catalog, 'index.yaml'), 'schemaVersion: 1\nstacks: []\n')
    const result = spawnSync(process.execPath, [script, '--fetch', '--templates', catalog], {
      encoding: 'utf8',
      env: { ...process.env, GIT_DIR: path.join(catalog, 'no-such-git-dir') },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /--- index\.yaml ---/)
    assert.doesNotMatch(result.stderr, /not inside a git work tree/)
  } finally {
    rmSync(catalog, { recursive: true, force: true })
  }
})

test('a --root that does not exist is reported as missing', () => {
  const missing = path.join(os.tmpdir(), `bootstrap-missing-root-${process.pid}`)
  const result = spawnSync(
    process.execPath,
    [script, '--stack', 'x', '--name', 'y', '--root', missing],
    { encoding: 'utf8', env: { ...process.env, FULLSTACK_TEMPLATES_DIR: '' } },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /does not exist/)
  assert.doesNotMatch(result.stderr, /not inside a git work tree/)
})

// A fake catalog whose generator records its argv and writes a provenance file, so the test
// sees exactly what bootstrap forwards without a real scaffold or the network.
function runWithFakeGenerator(
  extraArgs,
  primary = ['--stack', 'x'],
  provenance = 'packages:\n',
  stackYaml,
) {
  const catalog = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-catalog-'))
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-root-'))
  try {
    mkdirSync(path.join(catalog, 'tools'))
    writeFileSync(path.join(catalog, 'tools', 'package.json'), '{}\n')
    writeFileSync(path.join(catalog, 'index.yaml'), 'schemaVersion: 1\nstacks: []\n')
    if (stackYaml !== undefined) {
      mkdirSync(path.join(catalog, 'stacks', 'x'), { recursive: true })
      writeFileSync(path.join(catalog, 'stacks', 'x', 'stack.yaml'), stackYaml)
    }
    writeFileSync(
      path.join(catalog, 'tools', 'generate.ts'),
      [
        "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'",
        "import path from 'node:path'",
        'const argv = process.argv.slice(2)',
        "const out = argv[argv.indexOf('--out') + 1]",
        "mkdirSync(path.join(out, '.fullstack'), { recursive: true })",
        `writeFileSync(path.join(out, '.fullstack', 'catalog.yaml'), ${JSON.stringify(provenance)})`,
        "writeFileSync(path.join(out, 'argv.json'), JSON.stringify(argv))",
        "const seen = argv.indexOf('--answers')",
        "if (seen !== -1) writeFileSync(path.join(out, 'answers-seen.json'), readFileSync(argv[seen + 1]))",
        '',
      ].join('\n'),
    )
    spawnSync('git', ['init', '-q'], { cwd: root })
    const result = spawnSync(
      process.execPath,
      [script, ...primary, '--name', 'y', '--root', root, '--templates', catalog, ...extraArgs],
      {
        encoding: 'utf8',
        env: { ...process.env, FULLSTACK_TEMPLATES_DIR: '' },
      },
    )
    let forwarded
    try {
      forwarded = JSON.parse(readFileSync(path.join(root, 'argv.json'), 'utf8'))
    } catch {
      forwarded = undefined
    }
    let readme
    try {
      readme = readFileSync(path.join(root, 'README.md'), 'utf8')
    } catch {
      readme = undefined
    }
    let answers
    try {
      answers = JSON.parse(readFileSync(path.join(root, 'answers-seen.json'), 'utf8'))
    } catch {
      answers = undefined
    }
    return { result, forwarded, readme, answers }
  } finally {
    rmSync(catalog, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
}

test('the seven brand flags are forwarded to the generator unchanged', () => {
  const brand = [
    ['--display-name', 'Plant Care'],
    ['--brand-primary', '#2f6f4e'],
    ['--brand-neutral', '#64748b'],
    ['--radius', 'lg'],
    ['--font', 'inter'],
    ['--theme', 'dark'],
    ['--density', 'compact'],
  ]
  const { result, forwarded } = runWithFakeGenerator(brand.flat())
  assert.equal(result.status, 0, result.stderr)
  for (const [flag, value] of brand) {
    const at = forwarded.indexOf(flag)
    assert.notEqual(at, -1, `${flag} forwarded`)
    assert.equal(forwarded[at + 1], value)
  }
})

test('absent brand flags are not forwarded', () => {
  const { result, forwarded } = runWithFakeGenerator(['--radius', 'sm'])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(forwarded.includes('--radius'))
  for (const flag of [
    '--display-name',
    '--brand-primary',
    '--brand-neutral',
    '--font',
    '--theme',
    '--density',
  ]) {
    assert.equal(forwarded.includes(flag), false, `${flag} omitted`)
  }
})

test('an unknown argument is still refused', () => {
  const { result } = runWithFakeGenerator(['--brand-accent', '#fff'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unknown argument --brand-accent/)
})

test('a flag that only ends like a brand flag is refused', () => {
  const { result } = runWithFakeGenerator(['xxradius', 'lg'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unknown argument xxradius/)
})

test('a brand flag with no value is refused', () => {
  const { result } = runWithFakeGenerator(['--radius'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--radius/)
})

test('--help prints the usage and exits 0; an unknown argument still fails', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /usage: node scripts\/bootstrap\.mjs/)
  const bad = spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /unknown argument --nope/)
})

test('the main run replaces the README with the project one, no token left', () => {
  const { result, readme } = runWithFakeGenerator([])
  assert.equal(result.status, 0, result.stderr)
  assert.match(readme, /^# y$/m)
  assert.match(readme, /<!-- readme:about -->/)
  assert.match(readme, /<!-- configuration:start -->/)
  assert.doesNotMatch(readme, /{{/)
})

const TEMPLATE = ['--template', 'server/bun-express']

test('--template is forwarded to the generator instead of --stack', () => {
  const { result, forwarded } = runWithFakeGenerator([], TEMPLATE)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(forwarded[forwarded.indexOf('--template') + 1], 'server/bun-express')
  assert.equal(forwarded.includes('--stack'), false)
})

test('--stack is still forwarded as --stack', () => {
  const { forwarded } = runWithFakeGenerator([])
  assert.equal(forwarded[forwarded.indexOf('--stack') + 1], 'x')
  assert.equal(forwarded.includes('--template'), false)
})

test('exactly one of --stack and --template is required', () => {
  const both = runWithFakeGenerator(['--template', 'frontend/react'])
  assert.equal(both.result.status, 1)
  assert.match(both.result.stderr, /exactly one of --stack and --template/)
  const neither = runWithFakeGenerator([], [])
  assert.equal(neither.result.status, 1)
  assert.match(neither.result.stderr, /exactly one of --stack and --template/)
})

test('--deploy with --template is refused before anything runs', () => {
  const { result, forwarded } = runWithFakeGenerator(['--deploy', 'single'], TEMPLATE)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--deploy.*--template|--template.*--deploy/)
  assert.equal(forwarded, undefined)
})

test('the next steps name Compose only when the project has a docker-compose.yml', () => {
  const alone = runWithFakeGenerator([], TEMPLATE)
  assert.doesNotMatch(alone.result.stdout, /[Cc]ompose/)
  assert.match(alone.result.stdout, /Then:/)
})

test('a serverless project is told the frontend URL and nothing of Compose, deploy or Docker', () => {
  const record = [
    'stack: astro-cloudflare',
    'packages:',
    '  serverless/cloudflare:',
    '    template: serverless/cloudflare',
    '    http: { port: 8788, health: /api/health }',
    '  frontend:',
    '    template: frontend/astro',
    '    http: { port: 4321, health: / }',
    '    commands:',
    '      testE2e: bun run test:e2e',
    '',
  ].join('\n')
  const { result } = runWithFakeGenerator([], ['--stack', 'astro-cloudflare'], record)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /the frontend dev server is at http:\/\/localhost:4321\./)
  assert.doesNotMatch(result.stdout, /[Cc]ompose|Docker|deploy/)
})

test('--help lists --template', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
  assert.match(help.stdout, /--template <kind>\/<id>/)
})

function finishIn(setup) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-finish-'))
  try {
    spawnSync('git', ['init', '-q'], { cwd: root })
    setup(root)
    return spawnSync(process.execPath, [script, '--finish', '--root', root], { encoding: 'utf8' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('--finish refuses a tree without .fullstack/catalog.yaml', () => {
  const result = finishIn(() => {})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /catalog.yaml/)
})

test('--finish refuses a README that still holds a placeholder', () => {
  const result = finishIn((root) => {
    mkdirSync(path.join(root, '.fullstack'))
    writeFileSync(path.join(root, '.fullstack', 'catalog.yaml'), 'packages:\n')
    writeFileSync(path.join(root, 'README.md'), '<!-- readme:features -->\n')
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /README.md.*<!-- readme:features -->/)
})

test('--finish takes no other argument, and --help lists it', () => {
  const mixed = spawnSync(process.execPath, [script, '--finish', '--stack', 'x'], {
    encoding: 'utf8',
  })
  assert.equal(mixed.status, 1)
  assert.match(mixed.stderr, /--finish accepts only --root/)
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
  assert.match(help.stdout, /--finish/)
})

test('an undetached tree is refused before anything is fetched; --fetch and --help still run', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-undetached-'))
  const cache = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-cache-'))
  const catalog = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-catalog-'))
  try {
    spawnSync('git', ['init', '-q'], { cwd: root })
    mkdirSync(path.join(root, 'scripts'))
    writeFileSync(path.join(root, 'scripts', 'detach.mjs'), 'x\n')
    const env = { ...process.env, FULLSTACK_TEMPLATES_CACHE: cache, FULLSTACK_TEMPLATES_DIR: '' }
    const refused = spawnSync(
      process.execPath,
      [script, '--stack', 'x', '--name', 'y', '--root', root],
      { encoding: 'utf8', env },
    )
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /node scripts\/detach\.mjs/)
    assert.doesNotMatch(refused.stdout, /Reading catalog\.lock|cloning/)
    const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
    assert.equal(help.status, 0, help.stderr)
    mkdirSync(path.join(catalog, 'tools'))
    writeFileSync(path.join(catalog, 'tools', 'package.json'), '{}\n')
    writeFileSync(path.join(catalog, 'index.yaml'), 'schemaVersion: 1\nstacks: []\n')
    const fetched = spawnSync(process.execPath, [script, '--fetch', '--templates', catalog], {
      encoding: 'utf8',
      env,
    })
    assert.equal(fetched.status, 0, fetched.stderr)
    assert.match(fetched.stdout, /--- index\.yaml ---/)
  } finally {
    for (const dir of [root, cache, catalog]) rmSync(dir, { recursive: true, force: true })
  }
})

const STACK_FE = 'packages:\n  - template: server/fake\n    dir: backend\n  - template: frontend/fake\n    dir: frontend\n'
const STACK_API = 'packages:\n  - template: server/fake\n    dir: backend\n'
const TWO = [
  'packages:',
  '  site:',
  '    template: frontend/fake',
  '    http: { port: 5173 }',
  '  admin:',
  '    template: frontend/fake',
  '    http: { port: 5174 }',
  '',
].join('\n')

test('a new frontend needs a typed directory', () => {
  const untyped = runWithFakeGenerator([], ['--template', 'frontend/fake'])
  assert.equal(untyped.result.status, 1)
  assert.match(untyped.result.stderr, /--frontend <dir>=frontend\/fake/)
  assert.match(untyped.result.stderr, /site, platform, app, app-<tool>, admin/)
  assert.equal(untyped.forwarded, undefined)

  const missing = runWithFakeGenerator([], ['--stack', 'x'], 'packages:\n', STACK_FE)
  assert.equal(missing.result.status, 1)
  assert.match(missing.result.stderr, /frontend\/fake/)
  assert.match(missing.result.stderr, /--frontend/)
  assert.equal(missing.forwarded, undefined)

  const badDir = runWithFakeGenerator(['--frontend', 'web=frontend/fake'], [])
  assert.equal(badDir.result.status, 1)
  assert.match(badDir.result.stderr, /site, platform, app/)

  const alone = runWithFakeGenerator(['--frontend', 'site=frontend/fake'], [])
  assert.equal(alone.result.status, 0, alone.result.stderr)
  const at = alone.forwarded.indexOf('--template')
  assert.deepEqual(alone.forwarded.slice(at, at + 4), [
    '--template',
    'frontend/fake',
    '--dir',
    'site',
  ])
  assert.equal(alone.forwarded.includes('--frontend'), false)

  const record = 'stack: x\npackages:\n  backend:\n    template: server/fake\n  site:\n    template: frontend/fake\n    http: { port: 5173 }\n'
  const stacked = runWithFakeGenerator(['--frontend', 'site=frontend/fake'], ['--stack', 'x'], record, STACK_FE)
  assert.equal(stacked.result.status, 0, stacked.result.stderr)
  const from = stacked.forwarded.indexOf('--stack')
  assert.deepEqual(stacked.forwarded.slice(from, from + 4), [
    '--stack',
    'x',
    '--frontend',
    'site=frontend/fake',
  ])
  assert.match(stacked.result.stdout, /localhost:5173/)
})

test('a stack without a frontend takes none; one frontend only without a stack', () => {
  const none = runWithFakeGenerator(['--frontend', 'site=frontend/fake'], ['--stack', 'x'], 'packages:\n', STACK_API)
  assert.equal(none.result.status, 1)
  assert.match(none.result.stderr, /no frontend/)
  const api = runWithFakeGenerator([], ['--stack', 'x'], 'packages:\n', STACK_API)
  assert.equal(api.result.status, 0, api.result.stderr)
  const many = runWithFakeGenerator(
    ['--frontend', 'site=frontend/fake', '--frontend', 'admin=frontend/fake'],
    [],
  )
  assert.equal(many.result.status, 1)
  assert.match(many.result.stderr, /--stack/)
  const twice = runWithFakeGenerator(['--frontend', 'site=frontend/fake', '--frontend', 'site=frontend/fake'], [])
  assert.equal(twice.result.status, 1)
  assert.match(twice.result.stderr, /twice/)
  const both = runWithFakeGenerator(['--frontend', 'site=frontend/fake'], ['--template', 'server/fake'])
  assert.equal(both.result.status, 1)
})

test('several frontends are each listed with their port', () => {
  const { result } = runWithFakeGenerator(
    ['--frontend', 'site=frontend/fake', '--frontend', 'admin=frontend/fake'],
    ['--stack', 'x'],
    TWO,
    STACK_FE,
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /site.*http:\/\/localhost:5173/)
  assert.match(result.stdout, /admin.*http:\/\/localhost:5174/)
})

test('a per-package flag goes in the answers file, not on the command line', () => {
  const { result, forwarded, answers } = runWithFakeGenerator(
    ['--frontend', 'site=frontend/fake', '--flag', 'site:pwa=true', '--flag', 'auth=false'],
    ['--stack', 'x'],
    'packages:\n',
    STACK_FE,
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    forwarded.filter((_, i) => forwarded[i - 1] === '--flag'),
    ['auth=false'],
  )
  assert.deepEqual(answers.packages.site.flags, { pwa: true })
})

test('a per-package flag names a package of the request', () => {
  const unknown = runWithFakeGenerator(
    ['--frontend', 'site=frontend/fake', '--flag', 'admin:pwa=true'],
    ['--stack', 'x'],
    'packages:\n',
    STACK_FE,
  )
  assert.equal(unknown.result.status, 1)
  assert.match(unknown.result.stderr, /admin is not a package of stack x or a --frontend/)
  const member = runWithFakeGenerator(
    ['--frontend', 'site=frontend/fake', '--flag', 'backend:auth=true'],
    ['--stack', 'x'],
    'packages:\n',
    STACK_FE,
  )
  assert.equal(member.result.status, 0, member.result.stderr)
  assert.deepEqual(member.answers.packages.backend.flags, { auth: true })
  const lone = runWithFakeGenerator(['--flag', 'backend:auth=true'], ['--template', 'server/fake'])
  assert.equal(lone.result.status, 1)
  assert.match(lone.result.stderr, /--flag auth=<bool>/)
})

test('an answers file that holds no object is refused', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-answers-'))
  try {
    const file = path.join(dir, 'answers.json')
    for (const text of ['null', '[]', '"x"']) {
      writeFileSync(file, text)
      const { result } = runWithFakeGenerator(
        ['--frontend', 'site=frontend/fake', '--flag', 'site:pwa=true', '--answers', file],
        ['--stack', 'x'],
        'packages:\n',
        STACK_FE,
      )
      assert.equal(result.status, 1, text)
      assert.match(result.stderr, /--answers .* must hold a JSON object/)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a per-package flag merges into a copy of the given answers file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-answers-'))
  try {
    const file = path.join(dir, 'answers.json')
    const original = JSON.stringify({ projectName: 'keep', packages: { site: { flags: { x: 1 } } } })
    writeFileSync(file, original)
    const { result, forwarded, answers } = runWithFakeGenerator(
      ['--frontend', 'site=frontend/fake', '--flag', 'site:pwa=true', '--answers', file],
      ['--stack', 'x'],
      'packages:\n',
      STACK_FE,
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(file, 'utf8'), original)
    assert.notEqual(forwarded[forwarded.indexOf('--answers') + 1], file)
    assert.equal(answers.projectName, 'keep')
    assert.deepEqual(answers.packages.site.flags, { x: 1, pwa: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

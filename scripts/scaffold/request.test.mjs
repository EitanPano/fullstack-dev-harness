import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ScaffoldError,
  answersFor,
  baseArguments,
  checkRequest,
  compareProvenance,
  nextArguments,
  ownerOf,
  parseArgs,
  partsOf,
} from './request.mjs'

const frontend = {
  template: 'frontend/vue',
  version: '3.0.0',
  flags: { i18n: true, pwa: false },
  capabilities: {},
  commands: { install: 'bun install' },
}
const server = {
  template: 'server/bun-express',
  version: '2.4.3',
  flags: { auth: true },
  capabilities: {},
  commands: { install: 'bun install', contract: 'bun run openapi' },
}
const lone = (extra = {}) => ({
  stack: null,
  packages: { frontend },
  answers: { projectName: 'demo', brand: { displayName: 'Demo', primary: '#ea580c' } },
  ...extra,
})
const stacked = () => ({
  stack: 'vue-bun-express',
  deploy: 'split',
  packages: { backend: server, frontend },
  answers: { projectName: 'demo' },
})
const stackPackages = [
  { template: 'server/bun-express', dir: 'backend' },
  { template: 'frontend/vue', dir: 'frontend' },
]
const refuses = (fn, pattern) =>
  assert.throws(
    fn,
    (error) => error instanceof ScaffoldError && error.exit === 2 && pattern.test(error.message),
  )

describe('parseArgs', () => {
  it('reads the request and defaults the slug', () => {
    const o = parseArgs([
      '--stack',
      'vue-bun-express',
      '--flag',
      'auth=true',
      '--capability',
      'database=postgres',
      '--deploy',
      'single',
      '--dry-run',
    ])
    assert.equal(o.stack, 'vue-bun-express')
    assert.deepEqual(o.flags, [{ name: 'auth', value: true }])
    assert.deepEqual(o.capabilities, [{ kind: 'database', id: 'postgres' }])
    assert.equal(o.deploy, 'single')
    assert.equal(o.slug, 'scaffold')
    assert.equal(o.dryRun, true)
  })
  it('refuses a malformed pair, deploy value, unknown argument or missing value', () => {
    refuses(() => parseArgs(['--flag', 'auth=yes']), /true or false/)
    refuses(() => parseArgs(['--flag', 'auth']), /name=/)
    refuses(() => parseArgs(['--capability', 'database']), /kind=/)
    refuses(() => parseArgs(['--deploy', 'both']), /single or split/)
    refuses(() => parseArgs(['--nope']), /unknown argument/)
    refuses(() => parseArgs(['--stack']), /needs a value/)
  })
  it('accepts a slug of lowercase letters, digits and hyphens only', () => {
    assert.equal(parseArgs(['--slug', 'add-sync-2']).slug, 'add-sync-2')
    for (const bad of ['../x', 'A', 'a/b', 'a b', '-a', '', '.']) {
      refuses(() => parseArgs(['--slug', bad]), /slug/)
    }
  })
  it('refuses --complete together with a request', () => {
    refuses(() => parseArgs(['--complete', '--stack', 'x']), /--complete/)
    assert.equal(parseArgs(['--complete', '--slug', 's']).complete, true)
  })
})

describe('checkRequest', () => {
  const ok = (provenance, argv, stack = stackPackages) =>
    checkRequest(provenance, parseArgs(argv), stack)
  it('accepts a stack for a lone frontend whose template and dir it carries', () => {
    ok(lone(), ['--stack', 'vue-bun-express'])
  })
  it('refuses a stack when provenance already has one', () => {
    refuses(() => ok(stacked(), ['--stack', 'vue-bun-express']), /already has a stack/)
  })
  it('refuses a stack that lacks the package template at its dir', () => {
    refuses(
      () => ok(lone(), ['--stack', 'x'], [{ template: 'frontend/react', dir: 'frontend' }]),
      /does not carry frontend\/vue at frontend/,
    )
    refuses(
      () => ok(lone(), ['--stack', 'x'], [{ template: 'frontend/vue', dir: 'web' }]),
      /does not carry frontend\/vue at frontend/,
    )
  })
  it('refuses turning a flag off that an existing package has on', () => {
    refuses(() => ok(stacked(), ['--flag', 'auth=false']), /removes/)
    refuses(() => ok(lone(), ['--flag', 'i18n=false']), /removes/)
  })
  it('allows a flag for a package the stack adds, and turning a flag on', () => {
    ok(lone(), ['--stack', 'vue-bun-express', '--flag', 'auth=false'])
    ok(lone(), ['--flag', 'pwa=true'])
  })
  it('refuses a capability kind an existing package already has', () => {
    const p = stacked()
    p.packages.backend = { ...server, capabilities: { database: 'postgres' } }
    refuses(() => ok(p, ['--capability', 'database=mongodb']), /already has database/)
    ok(lone(), ['--stack', 'vue-bun-express', '--capability', 'database=postgres'])
  })
  it('refuses a capability when no server exists or comes with the request', () => {
    refuses(() => ok(lone(), ['--capability', 'database=postgres'], null), /no server/)
    ok(stacked(), ['--capability', 'database=postgres'], null)
    ok(lone(), ['--stack', 'x', '--capability', 'database=postgres'])
    refuses(
      () =>
        ok(lone(), ['--stack', 'x', '--capability', 'database=postgres'], [
          { template: 'frontend/vue', dir: 'frontend' },
        ]),
      /no server/,
    )
  })
  it('refuses --deploy without --stack, and an empty request', () => {
    refuses(() => ok(stacked(), ['--deploy', 'single']), /--deploy/)
    refuses(() => ok(lone(), []), /nothing to add/)
  })
})

describe('requests', () => {
  const io = { out: '/o', answers: '/a.json' }
  it('builds the answers file from provenance', () => {
    assert.deepEqual(answersFor(stacked()), {
      projectName: 'demo',
      deploy: 'split',
      packages: {
        backend: { flags: { auth: true }, capabilities: {} },
        frontend: { flags: { i18n: true, pwa: false }, capabilities: {} },
      },
    })
    assert.deepEqual(answersFor(lone()).brand, { displayName: 'Demo', primary: '#ea580c' })
    assert.equal('deploy' in answersFor(lone()), false)
  })
  it('BASE of a lone package is --template without --dir at the kind default', () => {
    assert.deepEqual(baseArguments(lone(), { ...io, catalogVersion: 'v1.10.0' }), [
      'tools/generate.ts',
      '--template',
      'frontend/vue',
      '--out',
      '/o',
      '--name',
      'demo',
      '--answers',
      '/a.json',
      '--catalog-version',
      'v1.10.0',
    ])
  })
  it('BASE passes --dir off the kind default, and --stack for a stack', () => {
    const p = lone({ packages: { web: frontend } })
    assert.deepEqual(baseArguments(p, io).slice(1, 5), [
      '--template',
      'frontend/vue',
      '--dir',
      'web',
    ])
    assert.deepEqual(baseArguments(stacked(), io).slice(1, 3), ['--stack', 'vue-bun-express'])
  })
  it('NEXT swaps in the stack and passes the shorthands and deploy through', () => {
    const o = parseArgs([
      '--stack',
      's',
      '--flag',
      'auth=false',
      '--capability',
      'database=postgres',
      '--deploy',
      'split',
    ])
    assert.deepEqual(nextArguments(lone(), o, io), [
      'tools/generate.ts',
      '--stack',
      's',
      '--out',
      '/o',
      '--name',
      'demo',
      '--answers',
      '/a.json',
      '--flag',
      'auth=false',
      '--capability',
      'database=postgres',
      '--deploy',
      'split',
    ])
  })
  it('NEXT of a stack project keeps the recorded stack when none is given', () => {
    const o = parseArgs(['--flag', 'x=true'])
    assert.deepEqual(nextArguments(stacked(), o, io).slice(1, 3), ['--stack', 'vue-bun-express'])
  })
})

const app = {
  template: 'fullstack/astro-cloudflare-pages',
  version: '1.0.0',
  flags: { auth: true, jobs: false, islands: false },
  capabilities: {},
  commands: { install: 'bun install', testE2e: 'bun run test:e2e' },
  lanes: {
    backend: ['functions/', 'shared/', 'package.json'],
    frontend: ['src/', 'public/', 'package.json'],
    qa: ['tests/'],
  },
}
const whole = (dir = 'app') => ({
  stack: 'astro-cloudflare-pages',
  providers: {},
  packages: { [dir]: app },
  answers: { projectName: 'demo' },
})

describe('a fullstack package', () => {
  const io = { out: '/o', answers: '/a.json' }
  it('has the default directory app: --dir only when it differs', () => {
    const lonely = whole()
    lonely.stack = null
    assert.deepEqual(baseArguments(lonely, io).slice(1, 3), [
      '--template',
      'fullstack/astro-cloudflare-pages',
    ])
    assert.equal(baseArguments(lonely, io).includes('--dir'), false)
    const moved = whole('site')
    moved.stack = null
    assert.deepEqual(baseArguments(moved, io).slice(3, 5), ['--dir', 'site'])
  })
  it('takes a flag request on the only package', () => {
    const p = whole()
    const o = parseArgs(['--flag', 'jobs=true'])
    checkRequest(p, o, undefined)
    assert.deepEqual(nextArguments(p, o, io).slice(1, 3), ['--stack', 'astro-cloudflare-pages'])
    assert.deepEqual(nextArguments(p, o, io).slice(-2), ['--flag', 'jobs=true'])
    refuses(() => checkRequest(p, parseArgs(['--flag', 'auth=false']), undefined), /removes/)
  })
  it('refuses adding a server or frontend part: the package is the whole application', () => {
    const lonely = whole()
    lonely.stack = null
    const twoParts = [
      { template: 'server/bun-express', dir: 'backend' },
      { template: 'frontend/react', dir: 'frontend' },
    ]
    refuses(() => checkRequest(lonely, parseArgs(['--stack', 'x']), twoParts), /whole application/)
    refuses(() => checkRequest(whole(), parseArgs(['--stack', 'x']), twoParts), /whole application/)
    refuses(
      () => checkRequest(whole(), parseArgs(['--capability', 'database=postgres']), undefined),
      /whole application/,
    )
  })
  it('names the lane roles that hold a conflicting path, the kind default without lanes', () => {
    const p = whole()
    assert.equal(ownerOf(p, 'app', 'app/functions/api/post.ts'), 'backend')
    assert.equal(ownerOf(p, 'app', 'app/src/pages/index.astro'), 'frontend')
    assert.equal(ownerOf(p, 'app', 'app/package.json'), 'backend and frontend')
    assert.equal(ownerOf(p, 'app', 'app/tests/e2e/a.spec.ts'), 'qa')
    assert.equal(ownerOf(p, 'app', 'app/README.md'), 'driver')
    assert.equal(ownerOf(stacked(), 'frontend', 'frontend/src/a.ts'), 'frontend')
    assert.equal(ownerOf(stacked(), 'backend', 'backend/src/a.ts'), 'backend')
    const bare = { packages: { app: { ...app, lanes: undefined } } }
    assert.equal(ownerOf(bare, 'app', 'app/src/a.ts'), 'backend')
  })
})

describe('compareProvenance and partsOf', () => {
  it('names new dirs, then true flags, then capabilities', () => {
    const o = parseArgs([
      '--stack',
      's',
      '--capability',
      'database=postgres',
      '--flag',
      'auth=true',
      '--flag',
      'x=false',
    ])
    assert.deepEqual(partsOf(lone(), stacked(), o), ['backend', 'auth', 'database=postgres'])
  })
  it('accepts an addition', () => {
    compareProvenance(lone(), stacked())
  })
  it('refuses when nothing changed', () => {
    refuses(() => compareProvenance(lone(), lone()), /adds nothing/)
  })
  it('refuses a changed template, a turned-off flag, a changed capability or deploy', () => {
    const next = stacked()
    next.packages.frontend = { ...frontend, template: 'frontend/react' }
    refuses(() => compareProvenance(lone(), next), /template/)
    const off = stacked()
    off.packages.frontend = { ...frontend, flags: { i18n: false, pwa: false } }
    refuses(() => compareProvenance(lone(), off), /flag i18n/)
    const base = stacked()
    base.packages.backend = { ...server, capabilities: { database: 'postgres' } }
    refuses(() => compareProvenance(base, stacked()), /capability database/)
    const other = stacked()
    other.deploy = 'single'
    refuses(() => compareProvenance(stacked(), other), /deploy/)
  })
  it('refuses a dropped package', () => {
    refuses(() => compareProvenance(stacked(), lone()), /package backend/)
  })
})

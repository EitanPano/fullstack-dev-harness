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

const cloudflare = {
  template: 'serverless/cloudflare',
  version: '1.0.0',
  flags: { jobs: false },
  capabilities: {},
  commands: { install: 'bun install', contract: 'bun run openapi' },
}
const astroFrontend = { ...frontend, template: 'frontend/astro', flags: { islands: false } }
const astroStack = [
  { template: 'serverless/cloudflare', dir: 'serverless/cloudflare' },
  { template: 'frontend/astro', dir: 'frontend' },
]
const astroLone = () => ({
  stack: null,
  packages: { frontend: astroFrontend },
  answers: { projectName: 'demo' },
})
const astroBoth = () => ({
  stack: 'astro-cloudflare',
  providers: {},
  packages: { 'serverless/cloudflare': cloudflare, frontend: astroFrontend },
  answers: { projectName: 'demo' },
})

describe('a serverless package in a nested directory', () => {
  const io = { out: '/o', answers: '/a.json' }
  it('is added by a stack request on a lone frontend', () => {
    const o = parseArgs(['--stack', 'astro-cloudflare'])
    checkRequest(astroLone(), o, astroStack)
    assert.deepEqual(nextArguments(astroLone(), o, io).slice(1, 3), ['--stack', 'astro-cloudflare'])
    assert.deepEqual(partsOf(astroLone(), astroBoth(), o), ['serverless/cloudflare'])
  })
  it('refuses --deploy with a stack that brings it: there is no deploy mode', () => {
    const o = parseArgs(['--stack', 'astro-cloudflare', '--deploy', 'single'])
    refuses(() => checkRequest(astroLone(), o, astroStack), /serverless.*no deploy mode/)
  })
  it('keeps --deploy for a stack of server and frontend', () => {
    checkRequest(lone(), parseArgs(['--stack', 'x', '--deploy', 'split']), stackPackages)
  })
  it('has the default directory serverless/<template id>: --dir only when it differs', () => {
    const only = {
      stack: null,
      packages: { 'serverless/cloudflare': cloudflare },
      answers: { projectName: 'demo' },
    }
    assert.equal(baseArguments(only, io).includes('--dir'), false)
    const moved = { ...only, packages: { api: cloudflare } }
    assert.deepEqual(baseArguments(moved, io).slice(3, 5), ['--dir', 'api'])
  })
  it('takes a flag request and a capability needs a server', () => {
    const p = astroBoth()
    checkRequest(p, parseArgs(['--flag', 'jobs=true']), undefined)
    refuses(() => checkRequest(p, parseArgs(['--stack', 'x']), stackPackages), /already has a stack/)
  })
  it('is owned by the backend, its frontend sibling by the frontend', () => {
    const p = astroBoth()
    assert.equal(ownerOf(p, 'serverless/cloudflare'), 'backend')
    assert.equal(ownerOf(p, 'frontend'), 'frontend')
    assert.equal(ownerOf(stacked(), 'frontend', 'frontend/src/a.ts'), 'frontend')
    assert.equal(ownerOf(stacked(), 'backend', 'backend/src/a.ts'), 'backend')
    assert.equal(ownerOf(p, 'nope'), 'driver')
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

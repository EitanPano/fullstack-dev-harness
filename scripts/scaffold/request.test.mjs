import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ScaffoldError,
  answersFor,
  baseArguments,
  catalogHint,
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

const site = { ...astroFrontend, flags: { islands: false } }
const astroSite = () => ({
  stack: null,
  packages: { site },
  answers: { projectName: 'demo' },
})
const cfSite = () => ({
  stack: 'astro-cloudflare',
  packages: { 'serverless/cloudflare': cloudflare, site },
  answers: { projectName: 'demo' },
})
const cfTwo = () => ({
  stack: 'astro-cloudflare',
  packages: { 'serverless/cloudflare': cloudflare, site, admin: astroFrontend },
  answers: { projectName: 'demo' },
})
const ioAll = { out: '/o', answers: '/a.json' }

describe('parseArgs: frontends and per-package flags', () => {
  it('reads repeated --frontend pairs in order', () => {
    const o = parseArgs([
      '--frontend',
      'admin=frontend/astro',
      '--frontend',
      'app-billing=frontend/vue',
    ])
    assert.deepEqual(o.frontends, [
      { dir: 'admin', template: 'frontend/astro' },
      { dir: 'app-billing', template: 'frontend/vue' },
    ])
    assert.deepEqual(parseArgs([]).frontends, [])
  })
  it('refuses a malformed, untyped, non-frontend or repeated --frontend', () => {
    refuses(() => parseArgs(['--frontend', 'admin']), /dir>=<template/)
    refuses(() => parseArgs(['--frontend', '=frontend/astro']), /dir>=<template/)
    refuses(() => parseArgs(['--frontend', 'a=b=c']), /dir>=<template/)
    refuses(() => parseArgs(['--frontend', 'admin=server/bun-express']), /frontend template/)
    refuses(() => parseArgs(['--frontend', 'admin=frontend/../x']), /frontend template/)
    refuses(() => parseArgs(['--frontend', 'admin=frontend/a&b']), /frontend template/)
    refuses(() => parseArgs(['--frontend', 'web=frontend/astro']), /site, platform, app/)
    refuses(() => parseArgs(['--frontend', 'frontend=frontend/astro']), /site, platform, app/)
    refuses(
      () => parseArgs(['--frontend', 'admin=frontend/astro', '--frontend', 'admin=frontend/vue']),
      /twice/,
    )
  })
  it('reads the plain and the per-package flag form', () => {
    const o = parseArgs([
      '--flag',
      'auth=true',
      '--flag',
      'admin:pwa=true',
      '--flag',
      'serverless/cloudflare:jobs=false',
    ])
    assert.deepEqual(o.flags, [
      { name: 'auth', value: true },
      { dir: 'admin', name: 'pwa', value: true },
      { dir: 'serverless/cloudflare', name: 'jobs', value: false },
    ])
    refuses(() => parseArgs(['--flag', 'admin:pwa=yes']), /true or false/)
    refuses(() => parseArgs(['--flag', ':pwa=true']), /name=/)
    refuses(() => parseArgs(['--flag', 'admin:=true']), /name=/)
  })
  it('refuses --complete with --frontend', () => {
    refuses(() => parseArgs(['--complete', '--frontend', 'admin=frontend/astro']), /--complete/)
  })
})

describe('checkRequest: several frontends', () => {
  const ok = (provenance, argv, stack) => checkRequest(provenance, parseArgs(argv), stack)
  const ADMIN = ['--frontend', 'admin=frontend/astro']
  it('accepts a second frontend beside a serverless API, and app-<tool>', () => {
    ok(astroBoth(), ADMIN)
    ok(cfSite(), ['--frontend', 'app-billing=frontend/astro'])
  })
  it('refuses --frontend with no stack', () => {
    refuses(() => ok(astroLone(), ADMIN), /--stack/)
    refuses(() => ok(lone(), ['--frontend', 'admin=frontend/vue']), /--stack/)
  })
  it('refuses a taken, nested or enclosing directory', () => {
    refuses(() => ok(cfSite(), ['--frontend', 'site=frontend/astro']), /already a package/)
    const inner = { ...cfSite(), packages: { ...cfSite().packages, 'admin/api': cloudflare } }
    refuses(() => ok(inner, ADMIN), /nested/)
    const outer = { ...cfSite(), packages: { ...cfSite().packages, 'app/x': cloudflare } }
    refuses(() => ok(outer, ['--frontend', 'app=frontend/astro']), /nested/)
  })
  it('refuses a second frontend beside a server, with the reason', () => {
    refuses(() => ok(stacked(), ['--frontend', 'admin=frontend/vue']), /single.*one build/)
    const two = ['--stack', 'x', '--frontend', 'site=frontend/vue', '--frontend', 'admin=frontend/vue']
    refuses(() => ok(lone(), two, stackPackages), /single.*one build/)
    const api = { stack: null, packages: { backend: server }, answers: { projectName: 'demo' } }
    ok(api, ['--stack', 'x', '--frontend', 'site=frontend/vue'], stackPackages)
  })
  it('lets a stack join a lone frontend at a typed directory', () => {
    ok(astroSite(), ['--stack', 'astro-cloudflare'], astroStack)
    refuses(
      () => ok(astroLone(), ['--stack', 'x'], [{ template: 'frontend/react', dir: 'frontend' }]),
      /does not carry frontend\/astro at frontend/,
    )
    const web = { stack: null, packages: { web: astroFrontend }, answers: { projectName: 'demo' } }
    refuses(() => ok(web, ['--stack', 'astro-cloudflare'], astroStack), /does not carry/)
  })
  it('takes only frontend templates the stack lists', () => {
    const request = ['--stack', 'astro-cloudflare', '--frontend', 'site=frontend/astro']
    ok(astroLone(), request, astroStack)
    refuses(
      () => ok(astroLone(), request.slice(0, 2).concat('--frontend', 'site=frontend/vue'), astroStack),
      /stack astro-cloudflare lists no frontend\/vue/,
    )
  })
  it('limits a per-package flag to a package the request holds', () => {
    ok(cfSite(), ['--flag', 'site:islands=true'])
    ok(cfSite(), [...ADMIN, '--flag', 'admin:islands=true'])
    const jobs = ['--stack', 'astro-cloudflare', '--flag', 'serverless/cloudflare:jobs=true']
    ok(astroLone(), jobs, astroStack)
    refuses(() => ok(cfSite(), ['--flag', 'admin:islands=true']), /admin.*not a package/)
  })
  it('refuses turning off a per-package flag the package has on, for that dir only', () => {
    const p = cfTwo()
    p.packages.admin = { ...astroFrontend, flags: { islands: true } }
    refuses(() => ok(p, ['--flag', 'admin:islands=false']), /removes what admin has on/)
    ok(p, ['--flag', 'site:islands=false'])
  })
})

describe('generator requests for several frontends', () => {
  it("a project recorded at frontend/ keeps today's BASE and NEXT arguments", () => {
    assert.equal(baseArguments(astroBoth(), ioAll).includes('--frontend'), false)
    const o = parseArgs(['--flag', 'jobs=true'])
    assert.equal(nextArguments(astroBoth(), o, ioAll).includes('--frontend'), false)
    const s = parseArgs(['--stack', 'astro-cloudflare'])
    const next = nextArguments(astroLone(), s, ioAll)
    assert.deepEqual(next.slice(1, 3), ['--stack', 'astro-cloudflare'])
    assert.equal(next.includes('--frontend'), false)
  })
  it('BASE lists every recorded frontend, in order, right after the stack', () => {
    assert.deepEqual(baseArguments(cfTwo(), ioAll).slice(1, 7), [
      '--stack',
      'astro-cloudflare',
      '--frontend',
      'site=frontend/astro',
      '--frontend',
      'admin=frontend/astro',
    ])
    assert.deepEqual(baseArguments(cfSite(), ioAll).slice(1, 5), [
      '--stack',
      'astro-cloudflare',
      '--frontend',
      'site=frontend/astro',
    ])
  })
  it('a lone frontend at a typed directory stays --template and --dir', () => {
    assert.deepEqual(baseArguments(astroSite(), ioAll).slice(1, 5), [
      '--template',
      'frontend/astro',
      '--dir',
      'site',
    ])
  })
  it('a stack joining a lone frontend at site passes it through', () => {
    const o = parseArgs(['--stack', 'astro-cloudflare'])
    assert.deepEqual(nextArguments(astroSite(), o, ioAll).slice(1, 5), [
      '--stack',
      'astro-cloudflare',
      '--frontend',
      'site=frontend/astro',
    ])
  })
  it('NEXT adds the new frontend after the recorded ones', () => {
    const o = parseArgs(['--frontend', 'admin=frontend/astro'])
    assert.deepEqual(nextArguments(cfSite(), o, ioAll).slice(1, 7), [
      '--stack',
      'astro-cloudflare',
      '--frontend',
      'site=frontend/astro',
      '--frontend',
      'admin=frontend/astro',
    ])
    assert.deepEqual(nextArguments(astroBoth(), o, ioAll).slice(3, 7), [
      '--frontend',
      'frontend=frontend/astro',
      '--frontend',
      'admin=frontend/astro',
    ])
  })
  it('per-package flags stay off the command line and go in the NEXT answers only', () => {
    const o = parseArgs([
      '--frontend',
      'admin=frontend/astro',
      '--flag',
      'admin:islands=true',
      '--flag',
      'jobs=true',
    ])
    const args = nextArguments(cfSite(), o, ioAll)
    assert.deepEqual(
      args.filter((_, i) => args[i - 1] === '--flag'),
      ['jobs=true'],
    )
    assert.equal(args.some((a) => /islands/.test(a)), false)
    assert.deepEqual(answersFor(cfSite(), o).packages.admin, {
      flags: { islands: true },
      capabilities: {},
    })
    assert.equal('admin' in answersFor(cfSite()).packages, false)
    const on = parseArgs(['--flag', 'site:islands=true'])
    assert.deepEqual(answersFor(cfSite(), on).packages.site.flags, { islands: true })
  })
})

describe('partsOf, compareProvenance and ownerOf with a new frontend', () => {
  it('names the new directory and a per-package flag turned on', () => {
    const o = parseArgs([
      '--frontend',
      'admin=frontend/astro',
      '--flag',
      'admin:islands=true',
      '--flag',
      'site:islands=false',
    ])
    assert.deepEqual(partsOf(cfSite(), cfTwo(), o), ['admin', 'admin:islands'])
  })
  it("accepts a NEXT that adds a frontend; the new directory is the frontend's", () => {
    compareProvenance(cfSite(), cfTwo())
    assert.equal(ownerOf(cfTwo(), 'admin'), 'frontend')
    assert.equal(ownerOf(cfTwo(), 'site'), 'frontend')
  })
})

describe('catalogHint', () => {
  it('names v1.15.0 when the generator did not know --frontend', () => {
    const args = ['tools/generate.ts', '--stack', 's', '--frontend', 'admin=frontend/astro']
    assert.match(catalogHint(args, 'generate: unknown argument "--frontend"'), /v1\.15\.0/)
    assert.equal(catalogHint(args, 'some other failure'), '')
    assert.equal(catalogHint(['tools/generate.ts'], 'unknown argument "--frontend"'), '')
  })
})

const sdkPackage = {
  template: 'sdk/browser',
  version: '1.0.0',
  flags: {},
  capabilities: {},
  commands: { install: 'bun install' },
}
const withSdk = () => ({
  stack: 'vue-bun-express',
  deploy: 'split',
  packages: { backend: server, frontend, 'sdk-widget': sdkPackage },
  answers: { projectName: 'demo' },
})

describe('parseArgs: --sdk', () => {
  it('reads a <dir>=<template> pair', () => {
    const o = parseArgs(['--stack', 's', '--sdk', 'sdk-widget=sdk/browser'])
    assert.deepEqual(o.sdks, [{ dir: 'sdk-widget', template: 'sdk/browser' }])
    assert.deepEqual(parseArgs([]).sdks, [])
  })
  it('refuses a malformed pair, a non-sdk template, a wrong directory or a repeat', () => {
    const bad = (value, pattern) => refuses(() => parseArgs(['--sdk', value]), pattern)
    bad('sdk-widget', /--sdk needs <dir>=<template>, e\.g\. sdk-widget=sdk\/browser/)
    bad('sdk-widget=sdk/browser=x', /--sdk needs/)
    bad('sdk-widget=frontend/vue', /not an sdk template/)
    bad('sdk-widget=sdk/Browser', /not an sdk template/)
    bad('widget=sdk/browser', /an sdk directory is sdk-<name>/)
    bad('sdk-=sdk/browser', /an sdk directory is sdk-<name>/)
    refuses(
      () => parseArgs(['--sdk', 'sdk-a=sdk/browser', '--sdk', 'sdk-a=sdk/browser']),
      /names sdk-a twice/,
    )
  })
  it('refuses --complete with --sdk, and shows --sdk in the usage', () => {
    refuses(() => parseArgs(['--complete', '--sdk', 'sdk-a=sdk/browser']), /--complete takes only/)
    refuses(() => parseArgs(['--nope']), /--sdk <dir>=<template>/)
  })
})

describe('checkRequest: an SDK', () => {
  const ok = (provenance, argv, stack) => checkRequest(provenance, parseArgs(argv), stack)
  const SDK = ['--sdk', 'sdk-widget=sdk/browser']
  it('accepts an SDK alone on a project with a stack', () => {
    ok(stacked(), SDK)
  })
  it('accepts an SDK with a stack, though the stack lists none', () => {
    const api = { stack: null, packages: { backend: server }, answers: { projectName: 'demo' } }
    ok(api, ['--stack', 'x', ...SDK], stackPackages)
  })
  it('refuses an SDK with no stack, saying it needs the stack API', () => {
    refuses(() => ok(lone(), SDK), /needs a stack.*API/)
  })
  it('refuses a second SDK: the project holds one, or the request names two', () => {
    refuses(() => ok(withSdk(), ['--sdk', 'sdk-other=sdk/browser']), /one SDK per project/)
    const two = [...SDK, '--sdk', 'sdk-other=sdk/browser']
    refuses(() => ok(stacked(), two), /one SDK per project/)
  })
  it('refuses a taken, nested or enclosing directory', () => {
    const taken = { ...stacked(), packages: { ...stacked().packages, 'sdk-widget': server } }
    refuses(() => ok(taken, SDK), /already a package/)
    const inner = { ...stacked(), packages: { ...stacked().packages, 'sdk-widget/x': server } }
    refuses(() => ok(inner, SDK), /nested/)
  })
  it('does not count an SDK as a frontend beside a server', () => {
    ok(stacked(), SDK)
    refuses(() => ok(stacked(), ['--frontend', 'admin=frontend/vue']), /single.*one build/)
    ok(withSdk(), ['--flag', 'auth=true'])
  })
  it('lets a per-package flag name the SDK directory', () => {
    ok(stacked(), [...SDK, '--flag', 'sdk-widget:debug=true'])
    refuses(() => ok(stacked(), ['--flag', 'sdk-widget:debug=true']), /not a package/)
  })
})

describe('generator requests with an SDK', () => {
  it('a project without an SDK keeps its argument lists', () => {
    assert.deepEqual(baseArguments(stacked(), ioAll).includes('--sdk'), false)
    const o = parseArgs(['--flag', 'auth=true'])
    assert.equal(nextArguments(stacked(), o, ioAll).includes('--sdk'), false)
  })
  it('BASE passes a recorded SDK after the stack and frontends', () => {
    const args = baseArguments(withSdk(), ioAll)
    assert.deepEqual(args.slice(1, 5), ['--stack', 'vue-bun-express', '--sdk', 'sdk-widget=sdk/browser'])
    assert.equal(args.includes('--frontend'), false)
  })
  it('NEXT adds the requested SDK and keeps a recorded one', () => {
    const o = parseArgs(['--sdk', 'sdk-widget=sdk/browser'])
    assert.deepEqual(nextArguments(stacked(), o, ioAll).slice(1, 5), [
      '--stack',
      'vue-bun-express',
      '--sdk',
      'sdk-widget=sdk/browser',
    ])
    const flag = parseArgs(['--flag', 'auth=true'])
    assert.equal(nextArguments(withSdk(), flag, ioAll).slice(3, 5).join(' '), '--sdk sdk-widget=sdk/browser')
  })
  it('NEXT refuses an SDK request with no stack', () => {
    const o = parseArgs(['--sdk', 'sdk-widget=sdk/browser'])
    assert.throws(() => nextArguments(lone(), o, ioAll), /--sdk needs a stack/)
  })
  it("an SDK package is the frontend agent's; a server stays the backend's", () => {
    assert.equal(ownerOf(withSdk(), 'sdk-widget'), 'frontend')
    assert.equal(ownerOf(withSdk(), 'backend'), 'backend')
  })
  it('accepts a NEXT that adds an SDK and names it a part', () => {
    compareProvenance(stacked(), withSdk())
    assert.deepEqual(partsOf(stacked(), withSdk(), parseArgs([])), ['sdk-widget'])
  })
})

describe('catalogHint for --sdk', () => {
  it('names v1.18.0 when the generator did not know --sdk', () => {
    const args = ['tools/generate.ts', '--stack', 's', '--sdk', 'sdk-widget=sdk/browser']
    assert.match(catalogHint(args, 'generate: unknown argument "--sdk"'), /v1\.18\.0 or later to take --sdk/)
    assert.equal(catalogHint(args, 'some other failure'), '')
    assert.equal(catalogHint(['tools/generate.ts'], 'unknown argument "--sdk"'), '')
  })
})

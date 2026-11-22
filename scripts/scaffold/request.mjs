// Reads a scaffold request, checks it only adds, and turns provenance into generator requests.
// Pure functions plus one Bun child process for YAML; the harness stays dependency-free.
import { spawnSync } from 'node:child_process'
import { resolveCommand } from '../catalog.mjs'
import { FRONTEND_DIRS, isFrontendDir, kindOf } from '../provenance.mjs'

export class ScaffoldError extends Error {
  constructor(message, exit = 2) {
    super(message)
    this.name = 'ScaffoldError'
    this.exit = exit
  }
}

export const USAGE =
  'usage: node scripts/scaffold.mjs [--stack <id>] [--frontend <dir>=<template>]…\n' +
  '         [--flag [<dir>:]<name>=<bool>]… [--capability <kind>=<id>]…\n' +
  '         [--deploy single|split] [--slug <slug>] [--templates <path>] [--root <dir>] ' +
  '[--dry-run]\n' +
  '       node scripts/scaffold.mjs --complete [--slug <slug>] [--templates <path>] ' +
  '[--root <dir>]\n' +
  '       node scripts/scaffold.mjs --help'

// A serverless package lives in a nested directory named for its template: `serverless/cloudflare`.
const defaultDir = (template) =>
  kindOf(template) === 'serverless'
    ? template
    : { frontend: 'frontend', server: 'backend' }[kindOf(template)]

// Bun parses the YAML (a line scan cannot carry free text safely); the path travels as an
// argument, never through a shell.
export function readYaml(file) {
  const code =
    'const t=await Bun.file(process.argv[1]).text();console.log(JSON.stringify(Bun.YAML.parse(t)))'
  const bun = resolveCommand('bun')
  const run = spawnSync(bun.file, [...bun.prefix, '-e', code, file], {
    shell: false,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (run.status !== 0) {
    const why = run.error?.message ?? (run.stderr ?? '').trim().split('\n')[0]
    throw new ScaffoldError(`cannot read ${file} with bun: ${why}`, 3)
  }
  return JSON.parse(run.stdout)
}

// `--frontend <dir>=<template>`: the directory is one of the types, the template a frontend.
export function parseFrontend(text) {
  const [dir, template, ...rest] = text.split('=')
  if (!dir || !template || rest.length > 0) {
    throw new ScaffoldError('--frontend needs <dir>=<template>, e.g. site=frontend/astro')
  }
  if (kindOf(template) !== 'frontend' || !template.includes('/')) {
    throw new ScaffoldError(`--frontend ${dir}: ${template} is not a frontend template`)
  }
  if (!isFrontendDir(dir)) {
    throw new ScaffoldError(`--frontend ${dir}: a frontend directory is one of ${FRONTEND_DIRS}`)
  }
  return { dir, template }
}

// `--flag [<dir>:]<name>=<bool>`; `dir` is set only for the per-package form.
export function parseFlag(text) {
  const [left, v, ...rest] = text.split('=')
  const colon = left.indexOf(':')
  const dir = colon === -1 ? undefined : left.slice(0, colon)
  const name = colon === -1 ? left : left.slice(colon + 1)
  if (!name || dir === '' || v === undefined || rest.length > 0) {
    throw new ScaffoldError('--flag needs name=true or name=false')
  }
  if (v !== 'true' && v !== 'false') throw new ScaffoldError(`flag ${name} must be true or false`)
  return dir === undefined ? { name, value: v === 'true' } : { dir, name, value: v === 'true' }
}

export function parseArgs(argv) {
  const o = {
    flags: [],
    frontends: [],
    capabilities: [],
    slug: 'scaffold',
    dryRun: false,
    complete: false,
  }
  const value = (name, i) => {
    const next = argv[i]
    if (next === undefined || next.startsWith('--')) {
      throw new ScaffoldError(`${name} needs a value\n${USAGE}`)
    }
    return next
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help') o.help = true
    else if (arg === '--dry-run') o.dryRun = true
    else if (arg === '--complete') o.complete = true
    else if (arg === '--stack') o.stack = value(arg, ++i)
    else if (arg === '--slug') {
      o.slug = value(arg, ++i)
      // The slug becomes a folder under .orchestrate/.
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug)) {
        throw new ScaffoldError('--slug takes lowercase letters, digits and hyphens')
      }
    }
    else if (arg === '--templates') o.templates = value(arg, ++i)
    else if (arg === '--root') o.root = value(arg, ++i)
    else if (arg === '--deploy') {
      o.deploy = value(arg, ++i)
      if (!['single', 'split'].includes(o.deploy)) {
        throw new ScaffoldError('--deploy must be single or split')
      }
    } else if (arg === '--flag') o.flags.push(parseFlag(value(arg, ++i)))
    else if (arg === '--frontend') {
      const frontend = parseFrontend(value(arg, ++i))
      if (o.frontends.some((f) => f.dir === frontend.dir)) {
        throw new ScaffoldError(`--frontend names ${frontend.dir} twice`)
      }
      o.frontends.push(frontend)
    } else if (arg === '--capability') {
      const [kind, id, ...rest] = value(arg, ++i).split('=')
      if (!kind || !id || rest.length > 0) throw new ScaffoldError('--capability needs kind=id')
      o.capabilities.push({ kind, id })
    } else throw new ScaffoldError(`unknown argument ${arg}\n${USAGE}`)
  }
  const request =
    o.stack || o.deploy || o.flags.length || o.frontends.length || o.capabilities.length
  if (o.complete && (request || o.dryRun)) {
    throw new ScaffoldError('--complete takes only --slug, --root and --templates')
  }
  return o
}

const isServer = (template) => ['server', 'serverless'].includes(kindOf(template))
const isFrontend = (template) => kindOf(template) === 'frontend'
const entries = (provenance) => Object.entries(provenance.packages ?? {})
const nests = (a, b) => a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

// The request may only add. `stackPackages` is the chosen stack's `packages:` list, or undefined.
export function checkRequest(provenance, options, stackPackages) {
  const existing = entries(provenance)
  const added = options.frontends ?? []
  const members = stackPackages ?? []
  if (options.deploy !== undefined && options.stack === undefined) {
    throw new ScaffoldError('--deploy needs --stack: a lone package has no deploy mode')
  }
  // The generator refuses a deploy mode for a stack with a serverless API; so does the request.
  const brings = members.some((s) => kindOf(s.template) === 'serverless')
  if (options.deploy !== undefined && brings) {
    throw new ScaffoldError(
      `--deploy does not apply to stack ${options.stack}: its serverless API has no deploy mode`,
    )
  }
  if (options.stack !== undefined) {
    if (provenance.stack) {
      throw new ScaffoldError(`the project already has a stack (${provenance.stack})`)
    }
    for (const [dir, pkg] of existing) {
      // A frontend may also join the stack's frontend from a typed directory of its own.
      const joins =
        members.some((s) => s.template === pkg.template && s.dir === dir) ||
        (isFrontend(pkg.template) &&
          isFrontendDir(dir) &&
          members.some((s) => s.template === pkg.template))
      if (!joins) {
        throw new ScaffoldError(
          `stack ${options.stack} does not carry ${pkg.template} at ${dir}; ` +
            'a stack may only add packages',
        )
      }
    }
  }
  if (added.length > 0 && !provenance.stack && options.stack === undefined) {
    throw new ScaffoldError(
      '--frontend needs a stack that serves the frontends: the project has none; add --stack',
    )
  }
  const taken = [
    ...existing.map(([dir]) => dir),
    ...members.filter((s) => !isFrontend(s.template)).map((s) => s.dir),
  ]
  for (const { dir, template } of added) {
    if (existing.some(([d]) => d === dir)) {
      throw new ScaffoldError(`--frontend ${dir}: ${dir} is already a package`)
    }
    if (taken.some((other) => nests(dir, other))) {
      throw new ScaffoldError(`--frontend ${dir}: ${dir} is nested in or around another package`)
    }
    if (options.stack !== undefined && !members.some((s) => s.template === template)) {
      throw new ScaffoldError(`stack ${options.stack} lists no ${template}`)
    }
  }
  // `single` serves one build, so a server package takes one frontend; a serverless API takes
  // several.
  const hasApi =
    existing.some(([, pkg]) => kindOf(pkg.template) === 'server') ||
    members.some((s) => kindOf(s.template) === 'server')
  const have = existing.filter(([, pkg]) => isFrontend(pkg.template)).length + added.length
  const total = have === 0 ? members.filter((s) => isFrontend(s.template)).length : have
  if (hasApi && total > 1) {
    throw new ScaffoldError(
      'a second frontend beside a server package is refused: deploy single serves one build; ' +
        'several frontends need a serverless API',
    )
  }
  // A per-package flag names a package the project has or the request adds.
  const known = new Set([
    ...existing.map(([dir]) => dir),
    ...added.map((f) => f.dir),
    ...members.filter((s) => added.length === 0 || !isFrontend(s.template)).map((s) => s.dir),
  ])
  for (const { dir, name, value } of options.flags) {
    if (dir !== undefined && !known.has(dir)) {
      throw new ScaffoldError(
        `--flag ${dir}:${name}: ${dir} is not a package of the project or the request`,
      )
    }
    const owner = existing.find(
      ([d, pkg]) => (dir === undefined || d === dir) && pkg.flags?.[name] === true,
    )
    if (owner !== undefined && value === false) {
      throw new ScaffoldError(`--flag ${name}=false removes what ${owner[0]} has on`)
    }
  }
  // A capability belongs to a server, which the project has or the stack brings. An unknown flag
  // or capability id is left to the generator, which owns the template manifests.
  const hasServer =
    existing.some(([, pkg]) => isServer(pkg.template)) || members.some((s) => isServer(s.template))
  if (options.capabilities.length > 0 && !hasServer) {
    throw new ScaffoldError('--capability needs a server: the project has no server; add --stack')
  }
  for (const { kind } of options.capabilities) {
    const owner = existing.find(([, pkg]) => pkg.capabilities?.[kind] != null)
    if (owner !== undefined) {
      throw new ScaffoldError(`${owner[0]} already has ${kind} (${owner[1].capabilities[kind]})`)
    }
  }
  if (
    options.stack === undefined &&
    options.flags.length === 0 &&
    options.capabilities.length === 0 &&
    added.length === 0
  ) {
    throw new ScaffoldError('nothing to add: pass --stack, --frontend, --flag or --capability')
  }
}

// `options` is given for NEXT: a per-package flag goes in the answers file, never on the
// command line.
export function answersFor(provenance, options) {
  const answers = { projectName: provenance.answers?.projectName }
  if (provenance.deploy != null) answers.deploy = provenance.deploy
  if (provenance.answers?.brand != null) answers.brand = provenance.answers.brand
  answers.packages = {}
  for (const [dir, pkg] of entries(provenance)) {
    answers.packages[dir] = { flags: pkg.flags ?? {}, capabilities: pkg.capabilities ?? {} }
  }
  for (const { dir, name, value } of options?.flags ?? []) {
    if (dir === undefined) continue
    const pkg = (answers.packages[dir] ??= { flags: {}, capabilities: {} })
    pkg.flags = { ...pkg.flags, [name]: value }
  }
  return answers
}

function loneTemplateArguments(provenance) {
  const list = entries(provenance)
  if (list.length !== 1) throw new ScaffoldError('provenance has no stack and not one package', 3)
  const [dir, pkg] = list[0]
  const args = ['--template', pkg.template]
  if (dir !== defaultDir(pkg.template)) args.push('--dir', dir)
  return args
}

const frontendsOf = (provenance) =>
  entries(provenance)
    .filter(([, pkg]) => isFrontend(pkg.template))
    .map(([dir, pkg]) => ({ dir, template: pkg.template }))

// The generator builds a stack's own frontend at `frontend`; any other list is spelled out.
function frontendArguments(list) {
  if (list.length === 0 || (list.length === 1 && list[0].dir === defaultDir(list[0].template))) {
    return []
  }
  return list.flatMap(({ dir, template }) => ['--frontend', `${dir}=${template}`])
}

function common(provenance, { out, answers, catalogVersion }) {
  const name = provenance.answers?.projectName
  if (!name) throw new ScaffoldError('provenance has no answers.projectName', 3)
  const list = ['--out', out, '--name', name, '--answers', answers]
  if (catalogVersion !== undefined) list.push('--catalog-version', catalogVersion)
  return list
}

export function baseArguments(provenance, io) {
  const head = provenance.stack
    ? ['--stack', provenance.stack, ...frontendArguments(frontendsOf(provenance))]
    : loneTemplateArguments(provenance)
  return ['tools/generate.ts', ...head, ...common(provenance, io)]
}

export function nextArguments(provenance, options, io) {
  const stack = options.stack ?? provenance.stack
  const added = options.frontends ?? []
  if (!stack && added.length > 0) throw new ScaffoldError('--frontend needs a stack', 3)
  const head = stack
    ? ['--stack', stack, ...frontendArguments([...frontendsOf(provenance), ...added])]
    : loneTemplateArguments(provenance)
  // The catalog version goes after the shorthands, so it is added here and not by `common`.
  const tail = common(provenance, { ...io, catalogVersion: undefined })
  const list = ['tools/generate.ts', ...head, ...tail]
  for (const { dir, name, value } of options.flags) {
    if (dir === undefined) list.push('--flag', `${name}=${value}`)
  }
  for (const { kind, id } of options.capabilities) list.push('--capability', `${kind}=${id}`)
  if (options.deploy !== undefined) list.push('--deploy', options.deploy)
  if (io.catalogVersion !== undefined) list.push('--catalog-version', io.catalogVersion)
  return list
}

const same = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})

// Everything BASE has must survive in NEXT, and NEXT must hold something new.
export function compareProvenance(base, next) {
  let added = false
  for (const [dir, pkg] of entries(base)) {
    const after = next.packages?.[dir]
    if (after === undefined) throw new ScaffoldError(`NEXT drops package ${dir}`)
    if (after.template !== pkg.template) {
      throw new ScaffoldError(`NEXT changes the template of ${dir}`)
    }
    for (const [flag, on] of Object.entries(pkg.flags ?? {})) {
      if (on === true && after.flags?.[flag] !== true) {
        throw new ScaffoldError(`NEXT turns off flag ${flag} of ${dir}`)
      }
      if (after.flags?.[flag] !== on) added = true
    }
    for (const [kind, id] of Object.entries(pkg.capabilities ?? {})) {
      if (after.capabilities?.[kind] !== id) {
        throw new ScaffoldError(`NEXT changes capability ${kind} of ${dir}`)
      }
    }
    if (!same(pkg.capabilities, after.capabilities) || !same(pkg.flags, after.flags)) added = true
  }
  if (base.deploy != null && next.deploy !== base.deploy) {
    throw new ScaffoldError(`NEXT changes the deploy mode (${base.deploy} to ${next.deploy})`)
  }
  if (base.deploy == null && next.deploy != null) added = true
  if (entries(next).length > entries(base).length) added = true
  if (!added) throw new ScaffoldError('the request adds nothing: NEXT equals the project')
}

export function partsOf(base, next, options) {
  const parts = entries(next)
    .map(([dir]) => dir)
    .filter((dir) => base.packages?.[dir] === undefined)
  for (const { dir, name, value } of options.flags) {
    const part = dir === undefined ? name : `${dir}:${name}`
    if (value && !parts.includes(part)) parts.push(part)
  }
  for (const { kind, id } of options.capabilities) parts.push(`${kind}=${id}`)
  return parts
}

// The role that owns a conflicting file: a frontend package is the frontend's, a server or
// serverless package the backend's. Root files and unknown packages are the driver's.
export function ownerOf(provenance, dir) {
  const template = provenance.packages?.[dir]?.template
  if (template === undefined) return 'driver'
  return kindOf(template) === 'frontend' ? 'frontend' : 'backend'
}

// An older catalog's generator does not know --frontend; say which catalog does.
export function catalogHint(args, stderr) {
  return args.includes('--frontend') && /unknown argument "--frontend"/.test(stderr)
    ? 'the catalog must be v1.15.0 or later to take --frontend'
    : ''
}

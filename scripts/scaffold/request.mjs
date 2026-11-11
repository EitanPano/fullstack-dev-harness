// Reads a scaffold request, checks it only adds, and turns provenance into generator requests.
// Pure functions plus one Bun child process for YAML; the harness stays dependency-free.
import { spawnSync } from 'node:child_process'
import { resolveCommand } from '../catalog.mjs'

export class ScaffoldError extends Error {
  constructor(message, exit = 2) {
    super(message)
    this.name = 'ScaffoldError'
    this.exit = exit
  }
}

export const USAGE =
  'usage: node scripts/scaffold.mjs [--stack <id>] [--flag <name>=<bool>]… ' +
  '[--capability <kind>=<id>]…\n' +
  '         [--deploy single|split] [--slug <slug>] [--templates <path>] [--root <dir>] ' +
  '[--dry-run]\n' +
  '       node scripts/scaffold.mjs --complete [--slug <slug>] [--templates <path>] ' +
  '[--root <dir>]\n' +
  '       node scripts/scaffold.mjs --help'

const DEFAULT_DIR = { frontend: 'frontend', server: 'backend' }
const kindOf = (template) => template.split('/')[0]

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

export function parseArgs(argv) {
  const o = { flags: [], capabilities: [], slug: 'scaffold', dryRun: false, complete: false }
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
    } else if (arg === '--flag') {
      const [name, v, ...rest] = value(arg, ++i).split('=')
      if (!name || v === undefined || rest.length > 0) {
        throw new ScaffoldError('--flag needs name=true or name=false')
      }
      if (v !== 'true' && v !== 'false') {
        throw new ScaffoldError(`flag ${name} must be true or false`)
      }
      o.flags.push({ name, value: v === 'true' })
    } else if (arg === '--capability') {
      const [kind, id, ...rest] = value(arg, ++i).split('=')
      if (!kind || !id || rest.length > 0) throw new ScaffoldError('--capability needs kind=id')
      o.capabilities.push({ kind, id })
    } else throw new ScaffoldError(`unknown argument ${arg}\n${USAGE}`)
  }
  if (o.complete && (o.stack || o.deploy || o.flags.length || o.capabilities.length || o.dryRun)) {
    throw new ScaffoldError('--complete takes only --slug, --root and --templates')
  }
  return o
}

const entries = (provenance) => Object.entries(provenance.packages ?? {})

// The request may only add. `stackPackages` is the chosen stack's `packages:` list, or undefined.
export function checkRequest(provenance, options, stackPackages) {
  const existing = entries(provenance)
  if (options.deploy !== undefined && options.stack === undefined) {
    throw new ScaffoldError('--deploy needs --stack: a lone package has no deploy mode')
  }
  if (options.stack !== undefined) {
    if (provenance.stack) {
      throw new ScaffoldError(`the project already has a stack (${provenance.stack})`)
    }
    for (const [dir, pkg] of existing) {
      if (!stackPackages?.some((s) => s.template === pkg.template && s.dir === dir)) {
        throw new ScaffoldError(
          `stack ${options.stack} does not carry ${pkg.template} at ${dir}; ` +
            'a stack may only add packages',
        )
      }
    }
  }
  for (const { name, value } of options.flags) {
    const owner = existing.find(([, pkg]) => pkg.flags?.[name] === true)
    if (owner !== undefined && value === false) {
      throw new ScaffoldError(`--flag ${name}=false removes what ${owner[0]} has on`)
    }
  }
  // A capability belongs to a server, which the project has or the stack brings. An unknown flag
  // or capability id is left to the generator, which owns the template manifests.
  const hasServer =
    existing.some(([, pkg]) => kindOf(pkg.template) === 'server') ||
    (stackPackages ?? []).some((s) => kindOf(s.template) === 'server')
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
    options.capabilities.length === 0
  ) {
    throw new ScaffoldError('nothing to add: pass --stack, --flag or --capability')
  }
}

export function answersFor(provenance) {
  const answers = { projectName: provenance.answers?.projectName }
  if (provenance.deploy != null) answers.deploy = provenance.deploy
  if (provenance.answers?.brand != null) answers.brand = provenance.answers.brand
  answers.packages = {}
  for (const [dir, pkg] of entries(provenance)) {
    answers.packages[dir] = { flags: pkg.flags ?? {}, capabilities: pkg.capabilities ?? {} }
  }
  return answers
}

function loneTemplateArguments(provenance) {
  const list = entries(provenance)
  if (list.length !== 1) throw new ScaffoldError('provenance has no stack and not one package', 3)
  const [dir, pkg] = list[0]
  const args = ['--template', pkg.template]
  if (dir !== DEFAULT_DIR[kindOf(pkg.template)]) args.push('--dir', dir)
  return args
}

function common(provenance, { out, answers, catalogVersion }) {
  const name = provenance.answers?.projectName
  if (!name) throw new ScaffoldError('provenance has no answers.projectName', 3)
  const list = ['--out', out, '--name', name, '--answers', answers]
  if (catalogVersion !== undefined) list.push('--catalog-version', catalogVersion)
  return list
}

export function baseArguments(provenance, io) {
  const head = provenance.stack ? ['--stack', provenance.stack] : loneTemplateArguments(provenance)
  return ['tools/generate.ts', ...head, ...common(provenance, io)]
}

export function nextArguments(provenance, options, io) {
  const stack = options.stack ?? provenance.stack
  const head = stack ? ['--stack', stack] : loneTemplateArguments(provenance)
  // The catalog version goes after the shorthands, so it is added here and not by `common`.
  const tail = common(provenance, { ...io, catalogVersion: undefined })
  const list = ['tools/generate.ts', ...head, ...tail]
  for (const { name, value } of options.flags) list.push('--flag', `${name}=${value}`)
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
  for (const { name, value } of options.flags) {
    if (value && !parts.includes(name)) parts.push(name)
  }
  for (const { kind, id } of options.capabilities) parts.push(`${kind}=${id}`)
  return parts
}

export function ownerOf(provenance, dir) {
  const template = provenance.packages?.[dir]?.template
  if (template === undefined) return 'driver'
  return kindOf(template) === 'frontend' ? 'frontend' : 'backend'
}

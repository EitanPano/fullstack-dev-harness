#!/usr/bin/env node
// Scaffolds a new project by driving the generator of the template catalog (the public
// `fullstack-templates` repository). The harness owns no templates: `catalog.lock` pins the
// catalog's tag and commit, this script fetches that tag into a cache outside the working tree
// (or uses a local checkout), runs the catalog's generator and checks the provenance file it
// writes. Run once, from anywhere:
//
//   node scripts/bootstrap.mjs --fetch [--templates <path>]
//   node scripts/bootstrap.mjs (--stack <id> | --template <kind>/<id>) --name <name>
//     [--flag k=v]… [--capability k=v]… [--answers <file>] [--templates <path>]
//     [--root <dir>] [--skip-install] [--deploy single|split (with --stack only)]
//     [--display-name <text>] [--brand-primary <hex>]
//     [--brand-neutral <hex>] [--radius sm|md|lg] [--font system|inter]
//     [--theme system|light|dark] [--density comfortable|compact]
//   node scripts/bootstrap.mjs --finish [--root <dir>]
//
// Steps: prerequisites → git work tree check (skipped for `--fetch`) → read the lock → locate the
// catalog (cache clone checked against the locked commit, or a local override) → check the
// catalog's schemaVersion → install the catalog tools → (`--fetch` prints the index and stops) →
// refuse a second run → generate → verify `.fullstack/catalog.yaml` → clear the harness's own
// history → write the project README. `--finish` is the last step before the commit: it records
// the harness version and removes the harness-development files.
// `--template <kind>/<id>` generates one package alone, where a stack is several.
// `--skip-install` maps to the generator's `--skip-post-generate`. Environment:
// FULLSTACK_TEMPLATES_DIR (same as `--templates`, the flag wins) and FULLSTACK_TEMPLATES_CACHE
// (cache root, default ~/.cache/fullstack-templates).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  CatalogError,
  checkSchemaVersion,
  defaultCacheRoot,
  isDirectory,
  locateCachedCatalog,
  locateLocalCatalog,
  readLock,
  resolveCommand,
  runSpawn,
} from './catalog.mjs'
import {
  MIN_BUN,
  MIN_NODE,
  authFlagFrom,
  clearHarnessHistory,
  finishProject,
  writeProjectReadme,
} from './history.mjs'
import { readProvenance } from './provenance.mjs'

const README_TEMPLATE = ['.claude', 'skills', 'bootstrap-project', 'readme-template.md']

// Brand options: forwarded unchanged and only when given. The generator validates them.
const BRAND_FLAGS = [
  'display-name',
  'brand-primary',
  'brand-neutral',
  'radius',
  'font',
  'theme',
  'density',
]

const USAGE =
  'usage: node scripts/bootstrap.mjs --fetch [--templates <path>]\n' +
  '       node scripts/bootstrap.mjs (--stack <id> | --template <kind>/<id>) --name <name>\n' +
  '         [--flag k=v]… [--capability k=v]… [--answers <file>] [--templates <path>]\n' +
  '         [--root <dir>] [--skip-install] [--deploy single|split (with --stack only)]\n' +
  '         [--display-name <text>] [--brand-primary <hex>]\n' +
  '         [--brand-neutral <hex>] [--radius sm|md|lg] [--font system|inter]\n' +
  '         [--theme system|light|dark] [--density comfortable|compact]\n' +
  '       node scripts/bootstrap.mjs --finish [--root <dir>]\n' +
  '       node scripts/bootstrap.mjs --help'

const args = parseArgs(process.argv.slice(2))
const harnessRoot = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(args.root ?? harnessRoot)
const override = args.templates ?? process.env.FULLSTACK_TEMPLATES_DIR
const cacheRoot = defaultCacheRoot()

main()

function main() {
  if (args.finish) return finish()
  step('Checking prerequisites')
  checkPrerequisites()
  if (!args.fetch) checkGitWorkTree()

  step('Reading catalog.lock')
  const lock = catalogStep(() => readLock(harnessRoot))

  step('Locating the template catalog')
  const fromCache = override === undefined || override === ''
  const catalog = catalogStep(() =>
    fromCache ? locateCachedCatalog(lock, cacheRoot) : locateLocalCatalog(override),
  )

  step('Checking the catalog schema version')
  catalogStep(() => checkSchemaVersion(catalog))

  const tools = path.join(catalog, 'tools')
  if (!fromCache && !isDirectory(tools)) fail(`${catalog} is not a catalog checkout (no tools/)`)

  step('Installing the catalog tools')
  const install = runSpawn('bun', ['install', '--frozen-lockfile'], tools)
  if (install.status !== 0) {
    fail(`bun install failed in the catalog tools${install.reason}; it needs the network`)
  }

  if (args.fetch) {
    console.log(`catalog: ${catalog}`)
    console.log('--- index.yaml ---')
    process.stdout.write(readFileSync(path.join(catalog, 'index.yaml'), 'utf8'))
    return
  }

  const provenance = path.join(root, '.fullstack', 'catalog.yaml')
  step('Checking this is a fresh project')
  if (existsSync(provenance)) {
    fail(
      'this project was already generated (.fullstack/catalog.yaml exists); ' +
        'the bootstrap runs once',
    )
  }

  const what = args.stack === undefined ? `"${args.template}" template` : `"${args.stack}" stack`
  step(`Generating the ${what} as "${args.name}"`)
  const generated = runSpawn(
    'bun',
    generatorArguments(fromCache ? lock.version : undefined),
    catalog,
  )
  if (generated.status !== 0) {
    fail(`the generator failed${generated.reason}; nothing was moved into place`)
  }

  step('Verifying .fullstack/catalog.yaml')
  if (!existsSync(provenance) || statSync(provenance).size === 0) {
    fail('the generator did not write a non-empty .fullstack/catalog.yaml')
  }

  step("Clearing the harness's own history")
  let cleared
  try {
    cleared = clearHarnessHistory(root, { auth: authFlagFrom(provenance) })
  } catch (error) {
    fail(
      `clearing the harness's own history failed: ${error.message}. The scaffold is in place; ` +
        'fix the marker, then run `node scripts/history.mjs <root> [--auth=false]`',
    )
  }
  for (const file of cleared.removedPlans) console.log(`  removed ${file}`)
  for (const file of cleared.keptPlans) console.log(`  kept (not tracked or modified) ${file}`)
  for (const file of cleared.docs) console.log(`  resolved the auth markers in ${file}`)
  if (cleared.removedPlans.length + cleared.keptPlans.length + cleared.docs.length === 0) {
    console.log('  nothing to clear')
  }

  step('Writing README.md')
  try {
    writeProjectReadme(root, args.name, path.join(harnessRoot, ...README_TEMPLATE), catalog)
  } catch (error) {
    fail(`writing README.md failed: ${error.message}`)
  }
  console.log('  wrote README.md (replace the readme: markers, then run --finish)')

  printNextSteps()
}

// The catalog module throws; the bootstrap turns that into its one failure path.
function catalogStep(run) {
  try {
    return run()
  } catch (error) {
    if (error instanceof CatalogError) return fail(error.message)
    throw error
  }
}

function finish() {
  step('Finishing the project')
  let done
  try {
    done = finishProject(root)
  } catch (error) {
    fail(error.message)
  }
  for (const action of done.actions) console.log(`  ${action}`)
  for (const warning of done.warnings) console.warn(`  warning: ${warning}`)
}

function checkPrerequisites() {
  const node = Number(process.versions.node.split('.')[0])
  if (node < MIN_NODE) {
    fail(`Node ${MIN_NODE} or newer is required (found ${process.versions.node})`)
  }

  const bunCommand = resolveCommand('bun')
  const bun = spawnSync(bunCommand.file, [...bunCommand.prefix, '--version'], { encoding: 'utf8' })
  if (bun.status !== 0) {
    const cause = bun.error === undefined ? '' : ` (${bun.error.message})`
    fail(`bun is not on PATH${cause}; install it from https://bun.sh`)
  }
  const [major = 0, minor = 0] = bun.stdout.trim().split('.').map(Number)
  if (major < MIN_BUN[0] || (major === MIN_BUN[0] && minor < MIN_BUN[1])) {
    fail(`Bun ${MIN_BUN.join('.')} or newer is required (found ${bun.stdout.trim()})`)
  }

  const git = spawnSync('git', ['--version'], { encoding: 'utf8' })
  if (git.status !== 0) fail('git is not on PATH')

  const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' })
  if (docker.status !== 0) {
    console.warn(
      '  warning: docker is not on PATH; the compose stack and any database service need it',
    )
  }
}

// The scaffold commit and the verify gate need a repository; fail before any fetch. `--fetch`
// writes no project, so it skips this check.
function checkGitWorkTree() {
  if (!isDirectory(root)) fail(`--root ${root} does not exist`)
  const inside = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  })
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    fail(
      `${root} is not inside a git work tree; run \`git init\` there first ` +
        '(the scaffold commit becomes the root commit)',
    )
  }
}

// The generator resolves --out against its own cwd (the catalog), so every path is absolute.
// A local override records its own identity, so only the cache path passes the version.
function generatorArguments(catalogVersion) {
  const list = ['tools/generate.ts']
  if (args.stack !== undefined) list.push('--stack', args.stack)
  else list.push('--template', args.template)
  list.push('--out', root, '--name', args.name)
  for (const flag of args.flags) list.push('--flag', flag)
  for (const capability of args.capabilities) list.push('--capability', capability)
  if (args.answers !== undefined) list.push('--answers', path.resolve(args.answers))
  if (catalogVersion !== undefined) list.push('--catalog-version', catalogVersion)
  if (args.deploy !== undefined) list.push('--deploy', args.deploy)
  for (const name of BRAND_FLAGS) {
    if (args.brand[name] !== undefined) list.push('--' + name, args.brand[name])
  }
  if (args.skipInstall) list.push('--skip-post-generate')
  return list
}

function printNextSteps() {
  // A single package has no Compose file, and nothing below may send the reader to Docker.
  const hasCompose = existsSync(path.join(root, 'docker-compose.yml'))
  console.log('\nThen:')
  if (args.skipInstall) {
    console.log(
      "  Skipped install, contract and format (--skip-install): run each package's install and " +
        'contract commands from .fullstack/catalog.yaml.',
    )
  }
  console.log(
    "  .fullstack/catalog.yaml lists each package's commands (install, check, test, contract, " +
      'and testE2e, migrate and testDb where the package declares them) and ports.',
  )
  console.log("  Run every package's check command.")
  if (hasCompose && (args.capabilities.length > 0 || args.answers !== undefined)) {
    const when =
      args.capabilities.length > 0
        ? 'With a provider (a capability was passed)'
        : 'With a provider (if the answers chose one)'
    console.log(`  ${when}: after the check commands, run`)
    console.log(
      '    docker compose up -d --wait <service>   (the service name is in docker-compose.yml),',
    )
    console.log("    then the server package's migrate and testDb (see .fullstack/catalog.yaml).")
  }
  const withProvider = args.capabilities.length > 0 || args.answers !== undefined
  printDeploySteps(
    readProvenance(path.join(root, '.fullstack', 'catalog.yaml')),
    withProvider,
    hasCompose,
  )
  console.log('  Where a package declares testE2e, install its browser')
  console.log('    (its AGENTS.md › Tests says how) and run it.')
  console.log(
    '  Fill .doc/ and add the first line to .plan/000-backlog.md (the bootstrap-project skill).',
  )
  console.log('  Commit on chore/bootstrap once the gates are green.')
}

function printDeploySteps({ deploy, packages }, withProvider, hasCompose) {
  const frontend = packages.find((pkg) => pkg.template.startsWith('frontend/'))
  const server = packages.find((pkg) => pkg.template.startsWith('server/'))
  if (frontend?.port !== undefined) {
    console.log(`  Once started, the frontend dev server is at http://localhost:${frontend.port}.`)
  }
  if (!hasCompose) return
  const compose = 'docker compose --profile app up --build'
  if (deploy === 'single') {
    const url = server?.port === undefined ? '' : ` (http://localhost:${server.port})`
    console.log(
      `  ${compose} runs one app container: the server serves the built frontend and the API on ` +
        `the server's port${url}; there is no frontend container.`,
    )
    console.log('    It needs Docker Compose 2.35.0 or newer (check: docker compose version).')
  } else if (frontend?.port !== undefined) {
    console.log(
      `  ${compose} runs one container per package; reach the app through port ${frontend.port}.`,
    )
  } else if (server?.port !== undefined) {
    console.log(`  ${compose} runs the server container (port ${server.port}).`)
  } else {
    console.log(`  ${compose} runs one container per package.`)
  }
  console.log('    The server refuses to start in production without its secrets: export the ones')
  console.log("    listed in the server's .env.example in your shell first (placeholders are fine")
  console.log('    for a local proof; never put them in a file).')
  if (withProvider) {
    console.log('    With a database, also export its DATABASE_URL; a <dir>-migrate one-shot')
    console.log('    service (docker-compose.yml) runs the migrations before the server starts.')
  }
  console.log('    Reusing a Compose project name reuses its volumes: pass a fresh -p <name> for a')
  console.log('    clean proof.')
  console.log('    Stop it with: docker compose --profile app down')
}

function parseArgs(argv) {
  const parsed = {
    fetch: false,
    finish: false,
    skipInstall: false,
    flags: [],
    capabilities: [],
    brand: {},
  }
  const value = (name, i) => {
    const next = argv[i]
    if (next === undefined || next.startsWith('--')) die(`${name} needs a value`)
    return next
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help') {
      console.log(USAGE)
      process.exit(0)
    } else if (arg === '--fetch') parsed.fetch = true
    else if (arg === '--finish') parsed.finish = true
    else if (arg === '--skip-install') parsed.skipInstall = true
    else if (arg === '--stack') parsed.stack = value(arg, ++i)
    else if (arg === '--template') parsed.template = value(arg, ++i)
    else if (arg === '--name') parsed.name = value(arg, ++i)
    else if (arg === '--flag') parsed.flags.push(value(arg, ++i))
    else if (arg === '--capability') parsed.capabilities.push(value(arg, ++i))
    else if (arg === '--deploy') parsed.deploy = value(arg, ++i)
    else if (arg === '--answers') parsed.answers = value(arg, ++i)
    else if (arg === '--templates') parsed.templates = value(arg, ++i)
    else if (arg === '--root') parsed.root = value(arg, ++i)
    else if (arg.startsWith('--') && BRAND_FLAGS.includes(arg.slice(2))) parsed.brand[arg.slice(2)] = value(arg, ++i)
    else if (arg === '--auth') die('--auth is gone; use --flag auth=false')
    else die(`unknown argument ${arg}`)
  }
  if (parsed.fetch) {
    const others = Object.keys(parsed).filter(
      (key) =>
        !['fetch', 'templates', 'flags', 'capabilities', 'brand'].includes(key) &&
        parsed[key] !== false &&
        parsed[key] !== undefined,
    )
    if (
      others.length > 0 ||
      parsed.flags.length > 0 ||
      parsed.capabilities.length > 0 ||
      Object.keys(parsed.brand).length > 0
    ) {
      die('--fetch accepts only --templates')
    }
  } else if (parsed.finish) {
    const allowed = ['finish', 'root', 'flags', 'capabilities', 'brand']
    const others = Object.keys(parsed).filter(
      (key) => !allowed.includes(key) && parsed[key] !== false && parsed[key] !== undefined,
    )
    const extra =
      parsed.flags.length + parsed.capabilities.length + Object.keys(parsed.brand).length
    if (others.length > 0 || extra > 0) die('--finish accepts only --root')
  } else if ((parsed.stack === undefined) === (parsed.template === undefined)) {
    die(`exactly one of --stack and --template is required\n${USAGE}`)
  } else if (parsed.name === undefined) {
    die(`--name is required\n${USAGE}`)
  } else if (parsed.template !== undefined && parsed.deploy !== undefined) {
    die('--deploy applies to a stack; a --template package has no deploy mode')
  }
  return parsed
}

function step(message) {
  console.log(`\n==> ${message}`)
}

// An argument error happens before anything is fetched or written.
function die(message) {
  console.error(`bootstrap: ${message}`)
  process.exit(1)
}

function fail(message) {
  console.error(`bootstrap: ${message}`)
  process.exit(1)
}

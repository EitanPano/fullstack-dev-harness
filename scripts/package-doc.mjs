// Writes each package's `.doc/` skeleton when the package is created, never again: a written
// file belongs to the project. By hand, from the project root: `node scripts/package-doc.mjs`.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveAuthMarkers } from './auth-markers.mjs'
import { authFlagFrom, kindOf, readProvenance } from './provenance.mjs'
import { assertConfined, assertRealConfined } from './scaffold/confine.mjs'
import { isMain } from './verify/main.mjs'

const SKELETONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'package-doc')
const USAGE = 'usage: node scripts/package-doc.mjs [--root <dir>]'
// Template kind -> the files a package of that kind gets: [file in .doc/, skeleton].
const FILES = {
  frontend: [
    ['architecture.md', 'architecture-frontend.md'],
    ['design.md', 'design.md'],
  ],
  server: [['architecture.md', 'architecture-server.md']],
  serverless: [['architecture.md', 'architecture-serverless.md']],
  sdk: [['architecture.md', 'architecture-sdk.md']],
}

const isDirectory = (dir) => existsSync(dir) && statSync(dir).isDirectory()

// Writes the files each package lacks. `dirs` limits it to those package directories (a scaffold
// seeds only what it added). Only the server skeleton holds auth markers; they are resolved on
// the way in with the project-wide auth value the bootstrap uses (any package flags it on).
// Returns the project-relative paths written and the directories skipped because they are gone.
export function seedPackageDocs(root, { dirs } = {}) {
  const catalog = path.join(root, '.fullstack', 'catalog.yaml')
  if (!existsSync(catalog)) {
    throw new Error('.fullstack/catalog.yaml is missing: this is not a bootstrapped project')
  }
  const auth = authFlagFrom(catalog)
  const packages = readProvenance(catalog).packages
  // Every recorded directory is checked before anything is written, so a bad one writes nothing.
  assertConfined(
    root,
    packages.map((pkg) => pkg.dir),
    'package directory',
  )
  assertRealConfined(
    root,
    packages.map((pkg) => `${pkg.dir}/.doc`),
    'package .doc directory',
  )
  const written = []
  const skipped = []
  for (const pkg of packages) {
    const kind = kindOf(pkg.template)
    if (FILES[kind] === undefined || (dirs !== undefined && !dirs.includes(pkg.dir))) continue
    if (!isDirectory(path.join(root, pkg.dir))) {
      skipped.push(pkg.dir)
      continue
    }
    for (const [name, skeleton] of FILES[kind]) {
      const rel = `${pkg.dir}/.doc/${name}`
      const target = path.join(root, rel)
      if (existsSync(target)) continue
      let text = readFileSync(path.join(SKELETONS, skeleton), 'utf8')
      if (kind === 'server') text = resolveAuthMarkers(text, auth)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, text)
      written.push(rel)
    }
  }
  return { written, skipped }
}

if (isMain(import.meta.url, process.argv[1])) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(USAGE)
  } else {
    const at = args.indexOf('--root')
    try {
      if (args.length > 0 && (at === -1 || args.length !== 2)) throw new Error(USAGE)
      const { written, skipped } = seedPackageDocs(
        at === -1 ? process.cwd() : path.resolve(args[at + 1]),
      )
      for (const rel of written) console.log(`  wrote ${rel}`)
      for (const dir of skipped) console.log(`  skipped ${dir}: no such directory`)
      if (written.length === 0) console.log('  nothing missing: every package has its .doc files')
    } catch (error) {
      console.error(error.message)
      process.exit(1)
    }
  }
}

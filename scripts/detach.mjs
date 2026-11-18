#!/usr/bin/env node
// Step 1 of starting a project: removes what only develops the harness (its plans, tests and
// contributor files) and, in a clone, the harness's commits. It commits nothing and needs no
// brief, catalog or network. Run once, in the new folder:
//
//   node scripts/detach.mjs [--dry-run]
//
// A repository made from the template has no harness commits: its git is left alone and the
// removals stay as uncommitted deletions. A clone gets a fresh, empty repository on `main`,
// after guards that prove nothing local is lost. There is no way around a guard.
import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { filesIn, groupsOf, loadManifest, setupFiles } from './manifest.mjs'

export class DetachRefusal extends Error {}

const USAGE = 'usage: node scripts/detach.mjs [--dry-run]'

// No fsmonitor daemon (a system config can turn it on): detach would start one for a repository
// it is about to replace.
function git(root, args) {
  return spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8',
  })
}

function refuse(message) {
  throw new DetachRefusal(message)
}

const lines = (text) => text.split('\n').filter((line) => line.trim() !== '')

// Every check that needs no clone knowledge. Nothing is changed before all of them pass.
function checkTree(root) {
  let manifest
  try {
    manifest = loadManifest(root)
  } catch (error) {
    refuse(`${error.message}; this is not the harness`)
  }
  if (existsSync(path.join(root, '.fullstack', 'catalog.yaml'))) {
    refuse('.fullstack/catalog.yaml exists: the project is already bootstrapped')
  }
  const prefix = git(root, ['rev-parse', '--show-prefix'])
  if (prefix.status !== 0) refuse(`${root} is not a git repository; run \`git init\` first`)
  if (prefix.stdout.trim() !== '') {
    refuse(`${root} is inside another git repository, not its top`)
  }
  const status = git(root, ['status', '--porcelain', '--untracked-files=all'])
  if (status.status !== 0) refuse(`git status failed: ${status.stderr.trim()}`)
  if (status.stdout.trim() !== '') {
    refuse('the tree is not clean (changes or untracked files): commit or remove them first')
  }
  return manifest
}

// The harness's own commits are in the history, or too little history is there to tell.
function isClone(root, manifest) {
  const shallow = git(root, ['rev-parse', '--is-shallow-repository'])
  if (shallow.stdout.trim() === 'true') return true
  return git(root, ['merge-base', '--is-ancestor', manifest.rootCommit, 'HEAD']).status === 0
}

// Replacing `.git` must lose nothing that exists only here.
function checkClone(root) {
  if (!statSync(path.join(root, '.git'), { throwIfNoEntry: false })?.isDirectory()) {
    refuse('.git is not a directory (a linked worktree?); detach needs a full clone')
  }
  const branches = lines(git(root, ['for-each-ref', '--format=%(refname)', 'refs/heads']).stdout)
  if (branches.length !== 1) {
    refuse(`this clone has ${branches.length} local branches; detach needs exactly one`)
  }
  if (git(root, ['rev-parse', '--verify', '--quiet', 'refs/stash']).status === 0) {
    refuse('this clone has a stash: apply or drop it first')
  }
  const worktrees = lines(git(root, ['worktree', 'list', '--porcelain']).stdout)
  if (worktrees.filter((line) => line.startsWith('worktree ')).length !== 1) {
    refuse('this clone has another worktree: remove it first')
  }
  // The branch too, not HEAD alone: a detached HEAD can sit on a pushed commit while the branch
  // holds work that exists only here. Tags are not checked: offline, a local tag cannot be told
  // from a fetched release tag that sits on no branch.
  const local = git(root, ['rev-list', '--max-count=1', 'HEAD', '--branches', '--not', '--remotes'])
  if (local.status !== 0) refuse(`git rev-list failed: ${local.stderr.trim()}`)
  if (local.stdout.trim() !== '') {
    refuse('a local commit is on no remote-tracking branch: push or drop it first')
  }
}

// Undoes the move after a failure. `.git` is then absent or the empty one `git init` just made,
// so removing it loses nothing.
function putBack(root, aside) {
  const dotGit = path.join(root, '.git')
  try {
    rmSync(dotGit, { recursive: true, force: true })
    renameSync(aside, dotGit)
    return 'The repository is back in place: `git restore .` brings back the removed files'
  } catch {
    return `The repository is in ${aside}: rename it to .git, then run \`git restore .\``
  }
}

// Tracked files that only develop the harness: in the dev group alone, outside `setup`.
function filesToRemove(root, manifest) {
  const listed = git(root, ['ls-files', '-z'])
  if (listed.status !== 0) refuse(`git ls-files failed: ${listed.stderr.trim()}`)
  const tracked = listed.stdout.split('\0').filter(Boolean)
  const keep = new Set(setupFiles(manifest, tracked))
  return filesIn(manifest, 'dev', tracked).filter(
    (file) => !keep.has(file) && groupsOf(manifest, file).length === 1 && isInside(file),
  )
}

const isInside = (file) => !path.isAbsolute(file) && !file.split('/').includes('..')

function removeEmptyParents(root, file) {
  const top = path.resolve(root)
  for (let dir = path.dirname(path.resolve(root, file)); dir !== top; dir = path.dirname(dir)) {
    try {
      rmdirSync(dir)
    } catch {
      return
    }
  }
}

export function detach(root, { dryRun = false, log = console.log } = {}) {
  root = path.resolve(root)
  const manifest = checkTree(root)
  const clone = isClone(root, manifest)
  if (clone) checkClone(root)
  const files = filesToRemove(root, manifest)

  if (dryRun) {
    for (const file of files) log(`  would remove ${file}`)
    log(clone ? '  would replace .git with a fresh repository on main' : '  git is left alone')
    return { removed: files, clone, leftover: null }
  }

  // The rename is the one step a lock (an editor, a watcher) can refuse: it comes first.
  const aside = path.join(root, `.git-harness-${process.pid}`)
  if (clone) {
    try {
      renameSync(path.join(root, '.git'), aside)
    } catch (error) {
      refuse(`cannot move .git aside (is something holding it open?): ${error.message}`)
    }
  }
  try {
    for (const file of files) {
      rmSync(path.join(root, file), { force: true })
      removeEmptyParents(root, file)
    }
    log(`  removed ${files.length} files`)
    if (!clone) {
      log('  git left alone: the removals are uncommitted deletions')
      return { removed: files, clone, leftover: null }
    }
    const init = git(root, ['init', '-q', '--initial-branch=main'])
    if (init.status !== 0) throw new Error(`git init failed: ${init.stderr.trim()}`)
  } catch (error) {
    if (!clone) throw error
    throw new Error(`${error.message}. ${putBack(root, aside)}`)
  }
  log('  replaced .git with a fresh, empty repository on main')
  try {
    rmSync(aside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    log(`  could not remove ${aside}: delete that folder yourself`)
    return { removed: files, clone, leftover: aside }
  }
  return { removed: files, clone, leftover: existsSync(aside) ? aside : null }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(USAGE)
  } else if (args.some((arg) => arg !== '--dry-run')) {
    console.error(`detach: unknown argument\n${USAGE}`)
    process.exit(1)
  } else {
    try {
      detach(fileURLToPath(new URL('..', import.meta.url)), { dryRun: args.length > 0 })
      if (args.length === 0) console.log('Next: run `claude` here, then /bootstrap-project <brief>')
    } catch (error) {
      console.error(`detach: ${error.message}`)
      process.exit(1)
    }
  }
}

// The files a generated tree holds, as git tracks them. Git runs apart from the user's and the
// system's configuration: an excludes file (set, or XDG's default `git/ignore`) would hide
// generated files, and autocrlf or safecrlf could change or refuse them.
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import process from 'node:process'
import { ScaffoldError } from './request.mjs'

// os.devNull is `\\.\nul` on Windows, a path git cannot open.
const NO_CONFIG = process.platform === 'win32' ? 'NUL' : os.devNull
const ISOLATED = [
  '-c',
  `core.excludesFile=${NO_CONFIG}`,
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.safecrlf=false',
]

export function listFiles(dir) {
  const git = (args) => {
    const run = spawnSync('git', [...ISOLATED, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: NO_CONFIG, GIT_CONFIG_NOSYSTEM: '1' },
    })
    if (run.status !== 0) {
      const why = run.error?.message ?? (run.stderr ?? '').trim().split('\n')[0]
      throw new ScaffoldError(`git ${args[0]} failed in ${dir}: ${why}`, 3)
    }
    return run.stdout
  }
  git(['init', '-q'])
  git(['add', '-A'])
  return git(['ls-files', '-z']).split('\0').filter(Boolean)
}

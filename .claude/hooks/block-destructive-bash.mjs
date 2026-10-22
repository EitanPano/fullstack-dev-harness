#!/usr/bin/env node
// PreToolUse guardrail on Bash|PowerShell: blocks destructive shell commands before they
// run. Hooks fire in every permission mode, so this holds even where no permission prompt
// would have appeared.
//
// The command is split into segments (&&, ||, |, ;, &, subshells) and each segment is
// tokenised with wrappers and package runners stripped (sudo, env, bash -lc, bunx, bun x,
// npx, powershell -Command, …), so intent is matched on the program and its flags rather
// than on one spelling. `echo "rm -r x"` is not a deletion and is allowed; `sh -c "rm -r x"`
// and `find . -exec rm -r {} +` are and are blocked. SQL keyword rules apply only when an SQL
// client is in the command, so `grep truncate src/` and a commit message are not caught.
//
// Layering: the `Bash(...)` / `PowerShell(...)` rules in `permissions.deny` are a separate
// prefix-matched layer that Claude Code evaluates regardless of what this hook returns.
// Keep both.
//
// Access to env/secret FILES is handled by block-secret-file-access.mjs.
import { allow, block, programName, readPayload, segmentTokens, shellSegments } from './lib/guardrail.mjs'

const SQL_CLIENTS = new Set([
  'psql', 'pgcli', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'clickhouse-client', 'cockroach', 'usql'
])
const REDIS_CLIENTS = new Set(['redis-cli', 'valkey-cli'])
const MONGO_CLIENTS = new Set(['mongosh', 'mongo'])

const payload = await readPayload()
const command = typeof payload.tool_input.command === 'string' ? payload.tool_input.command : ''

const segments = shellSegments(command).map(segment => ({ segment, tokens: segmentTokens(segment) }))
const programs = new Set(segments.filter(({ tokens }) => tokens.length > 0).map(({ tokens }) => programName(tokens[0])))

for (const { tokens } of segments) {
  if (tokens.length === 0) continue
  const hit = findRule(programName(tokens[0]), tokens.slice(1))
  if (hit !== null) refuse(hit, programName(tokens[0]))
}

// SQL travels through pipes and -c flags: when an SQL client appears anywhere, judge the
// whole command text.
const upper = command.toUpperCase()
if ([...programs].some(program => SQL_CLIENTS.has(program))) {
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/.test(upper)) refuse('DROP TABLE|DATABASE|SCHEMA', 'sql client')
  if (/\bTRUNCATE\b/.test(upper)) refuse('TRUNCATE', 'sql client')
  if (/\bDELETE\s+FROM\s+\S+/.test(upper) && !/\bWHERE\b/.test(upper)) refuse('DELETE without WHERE', 'sql client')
}
if ([...programs].some(program => REDIS_CLIENTS.has(program)) && /\bFLUSH(ALL|DB)\b/.test(upper)) {
  refuse('redis FLUSHALL|FLUSHDB', 'redis-cli')
}
if ([...programs].some(program => MONGO_CLIENTS.has(program)) && /\bdropDatabase\s*\(/.test(command)) {
  refuse('dropDatabase()', 'mongosh')
}

allow()

function refuse(rule, program) {
  // Never echo the full command: it can carry a token or URL, and stderr lands in the
  // transcript. The program name is safe only when it is a bare word.
  block(
    `blocked destructive command: ${rule} (program: ${/^[\w.-]+$/.test(program) ? program : 'not shown'}). ` +
      'Agents do not run this; ask the user to run it by hand.'
  )
}

function findRule(program, args) {
  const flags = args.filter(arg => arg.startsWith('-') || arg.startsWith('/'))
  const words = args.map(arg => arg.toLowerCase())

  // Recursive deletion, any spelling: rm -r, rm -fr, rm -R -f, rm --recursive, find -delete,
  // rmdir /s, Remove-Item -Recurse and its aliases, rimraf.
  if (program === 'rm' && flags.some(flag => /^-[a-z]*r/i.test(flag) || flag === '--recursive')) return 'recursive rm'
  if (program === 'rm' && flags.some(flag => /^-r(ec(urse)?)?$/i.test(flag))) return 'recursive rm'
  if (program === 'find') {
    if (words.includes('-delete')) return 'find -delete'
    const exec = args.findIndex(arg => /^-exec(dir)?$/.test(arg))
    if (exec >= 0 && args.length > exec + 1) {
      const inner = findRule(programName(args[exec + 1]), args.slice(exec + 2))
      if (inner !== null) return `find -exec ${inner}`
    }
  }
  if (['rmdir', 'rd', 'del', 'erase'].includes(program) && flags.some(flag => /^\/s$/i.test(flag))) return 'recursive delete'
  if (['remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir'].includes(program) && flags.some(flag => /^-r(ec(urse)?)?$/i.test(flag))) return 'Remove-Item -Recurse'
  if (program === 'rimraf') return 'rimraf'

  // Git history or working-tree destruction.
  if (program === 'git') {
    const sub = words[0]
    if (sub === 'push' && (flags.some(flag => /^(-f|--force)/i.test(flag)) || words.some(word => /^\+\S+/.test(word)))) return 'git push --force (with or without a lease)'
    if (sub === 'reset' && words.includes('--hard')) return 'git reset --hard'
    if (sub === 'clean' && flags.some(flag => /^-[a-z]*f/i.test(flag) || flag === '--force')) return 'git clean -f'
    if (sub === 'branch' && (args.includes('-D') || (words.includes('--delete') && words.includes('--force')))) return 'git branch -D'
    if (sub === 'stash' && (words[1] === 'drop' || words[1] === 'clear')) return 'git stash drop|clear'
    if ((sub === 'checkout' || sub === 'restore') && words.includes('.')) return 'git checkout/restore . (discards edits)'
    if (sub === 'filter-branch' || sub === 'filter-repo') return 'git history rewrite'
  }

  // Database tooling that applies or drops schema directly.
  if (program === 'drizzle-kit' && (words[0] === 'drop' || words[0] === 'push')) return 'drizzle-kit drop|push (generate + migrate instead)'
  if (program === 'prisma' && ((words[0] === 'migrate' && words[1] === 'reset') || (words[0] === 'db' && words.includes('--force-reset')))) return 'prisma reset'
  if (program === 'supabase' && words[0] === 'db' && words[1] === 'reset') return 'supabase db reset'

  // Container and volume destruction (docker and the docker-compose v1 spelling).
  const dockerWords = program === 'docker-compose' ? ['compose', ...words] : words
  if (program === 'docker' || program === 'docker-compose') {
    if (dockerWords[0] === 'system' && dockerWords[1] === 'prune') return 'docker system prune'
    if (dockerWords[0] === 'volume' && (dockerWords[1] === 'rm' || dockerWords[1] === 'prune')) return 'docker volume rm|prune'
    if (dockerWords[0] === 'compose' && dockerWords.includes('down') && flags.some(flag => /^-[a-z]*v/i.test(flag) || flag === '--volumes')) return 'docker compose down -v (drops the database volume)'
  }

  return null
}

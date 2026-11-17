#!/usr/bin/env node
// PreToolUse guardrail on Bash|PowerShell: blocks destructive commands in every permission mode.
// - Every rule applies to everyone, except the wrangler rule: it refuses sub-agents, and the
//   interactive session meets the `ask` entries of settings.json instead. The
//   modern-web-guidance rule has its own message and applies to everyone too.
// - Rules match the program and its flags after wrappers, runners and container exec are
//   peeled, so `echo "rm -r x"` passes and `docker compose exec db psql …` is a psql call.
// - Database text rules (SQL, redis, mongosh) apply only when that client is in the command.
//   Script files handed to a client (`psql -f x.sql`) are not inspected.
// - `permissions.deny` in settings.json is a separate layer; secret files are
//   block-secret-file-access.mjs.
import {
  allow,
  block,
  commandLines,
  commandOf,
  commandTails,
  escapeForms,
  programName,
  readPayload,
  resolveRole,
  runtimeOf,
  segmentTokens,
  shellSegments,
  tailViews
} from './lib/guardrail.mjs'

const SQL_CLIENTS = new Set([
  'psql', 'pgcli', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'clickhouse-client', 'cockroach', 'usql',
  'cqlsh', 'duckdb', 'sqlplus'
])
const REDIS_CLIENTS = new Set(['redis-cli', 'valkey-cli'])
const MONGO_CLIENTS = new Set(['mongosh', 'mongo'])
// Programs that run a program inside a container, after `exec` or `run`. Their flag tables are
// not modelled: every token after the subcommand is judged as a program start instead.
const CONTAINER_RUNTIMES = new Set(['docker', 'docker-compose', 'podman', 'nerdctl', 'kubectl'])
// wrangler (also `wrangler.js` and friends once the extension is cut). A sub-agent may run only
// the local subcommands below; everything else reaches the hosted platform or is unknown.
const WRANGLER = /^wrangler(\.(c|m)?js)?$/
// Global options before the subcommand, with a value in the next argument or glued by `=`.
const WRANGLER_VALUE_FLAGS = new Set(['--config', '-c', '--cwd', '--env', '-e', '--env-file'])
const WRANGLER_PLAIN_FLAGS = new Set(['--experimental-json-config', '-j'])
// Subcommands that never touch the platform, as word prefixes; the second list needs `--local`.
const WRANGLER_LOCAL = [
  ['dev'], ['pages', 'dev'], ['pages', 'functions', 'build'], ['types'], ['d1', 'migrations', 'create']
]
const WRANGLER_NEEDS_LOCAL = [
  ['d1', 'migrations', 'apply'], ['d1', 'migrations', 'list'], ['d1', 'execute'], ['d1', 'export']
]
const WRANGLER_INFO = new Set(['--version', '-v', '--help', '-h', 'help', 'docs'])
// modern-web-guidance runs only through scripts/guidance.mjs (exact pin, telemetry off); its
// CLI script `modern-web.mjs` is matched too, for `node …/modern-web.mjs`.
const GUIDANCE = /^(modern-web-guidance|modern-web\.mjs)$/
const RUNNER_VERBS = new Set(['exec', 'dlx', 'x'])
const WRANGLER_RUNNERS = new Set(['yarn', 'pnpm', 'npm', 'bun', 'bunx', 'npx', 'pnpx', 'uvx'])

// mongosh spellings that drop a database or collection, or write with an empty filter (every
// document). Quote runs allow backslashes because quotes may arrive escaped (`\"drop\"`).
const QUOTES = '[\\\\"\'`]*'
const MONGO_RULES = [
  [new RegExp(`\\bdropDatabase\\b${QUOTES}\\s*[(:]`), 'dropDatabase'],
  [/\.\s*drop\s*\(/, 'collection.drop()'],
  [/\bdropCollection\s*\(/, 'dropCollection()'],
  [new RegExp(`[{,\\s]${QUOTES}drop${QUOTES}\\s*:`), '{ drop: … } command'],
  [/\b(deleteMany|remove)\s*\(\s*(\{\s*\}\s*)?[,)]/, 'deleteMany|remove with an empty filter'],
  [/\b(updateMany|replaceOne)\s*\(\s*\{\s*\}\s*,/, 'updateMany|replaceOne with an empty filter']
]

const payload = await readPayload()
const command = commandOf(payload)

// Each segment, those of a command string handed to a shell included, is read twice when it has
// a backslash: as written and the way bash unescapes it (`rm \-rf x` is `rm -rf x`); either
// reading may trigger a rule.
const segments = commandLines(command).flatMap(shellSegments).flatMap(segment =>
  escapeForms(segment).map(unescape => ({
    segment,
    unescape,
    tokens: segmentTokens(segment, unescape)
  }))
)
// Every program judged, wherever it stood: first in a segment, behind a wrapper or package
// runner, or inside a container. The database text rules below key on it.
const programs = new Set()

for (const { segment, unescape, tokens } of segments) {
  if (tokens.length === 0) continue
  judge(tokens)
  // The wrapper and runner flag tables are best effort: an unlisted value flag would make its
  // value the "program" and hide the real one. So judge every token after a wrapper or runner
  // as a program start too (`uv run --newflag x rm -rf y`), which fails closed.
  for (const tail of commandTails(segment, unescape)) judgeTail(tail, unescape)
  const inner = containerTail(programName(tokens[0]), tokens.slice(1))
  if (inner !== null) judgeTail(inner, unescape)
}

// SQL travels through pipes and -c flags: when an SQL client appears anywhere, judge the
// whole command text, and each statement of it for the clauses that scope a write.
const upper = command.toUpperCase()
if ([...programs].some(program => SQL_CLIENTS.has(program))) {
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|KEYSPACE)\b/.test(upper)) refuse('DROP TABLE|DATABASE|SCHEMA|KEYSPACE', 'sql client')
  if (/\bTRUNCATE\s+\S+/.test(upper)) refuse('TRUNCATE', 'sql client')
  for (const statement of sqlStatements(command)) {
    if (/\bWHERE\b/.test(statement)) continue
    if (/\bDELETE\s+((LOW_PRIORITY|QUICK|IGNORE)\s+)*FROM\b/.test(statement)) refuse('DELETE without WHERE', 'sql client')
    // `ON UPDATE SET NULL`, `DO UPDATE SET` (upsert) and `THEN UPDATE SET` (merge) are not
    // mass updates.
    if (/(?<!\b(ON|DO|THEN)\s+)\bUPDATE\s+[\s\S]*?\bSET\b/.test(statement)) refuse('UPDATE without WHERE', 'sql client')
  }
}
if ([...programs].some(program => REDIS_CLIENTS.has(program)) && /\bFLUSH(ALL|DB)\b/.test(upper)) {
  refuse('redis FLUSHALL|FLUSHDB', 'redis-cli')
}
if ([...programs].some(program => MONGO_CLIENTS.has(program))) {
  for (const [pattern, rule] of MONGO_RULES) {
    if (pattern.test(command)) refuse(`mongosh ${rule}`, 'mongosh')
  }
}

allow()

function judge(tokens) {
  const program = programName(tokens[0])
  programs.add(program)
  if (guidanceArgs(program, tokens.slice(1)) !== null) {
    block(
      'blocked: modern-web-guidance runs only through ' +
        '`node scripts/guidance.mjs search|retrieve` (exact pin, telemetry off).'
    )
  }
  const hit = findRule(program, tokens.slice(1))
  if (hit !== null) refuse(hit, program)
}

function judgeTail(tail, unescape) {
  for (const view of tailViews(tail, unescape)) judge(view)
}

// The tokens after a container runtime's `exec` or `run`, or null when it runs nothing inside
// a container.
function containerTail(program, args) {
  if (!CONTAINER_RUNTIMES.has(program)) return null
  const at = args.findIndex(arg => /^(exec|run)$/i.test(arg))
  return at === -1 ? null : args.slice(at + 1)
}

// Upper-cased SQL statements, split at `;` and at quote boundaries (each `-c` value stands
// alone), so a WHERE in one never excuses a DELETE or UPDATE in another.
function sqlStatements(text) {
  const statements = []
  let current = ''
  let quote = null
  const flush = () => {
    if (current.trim() !== '') statements.push(current.toUpperCase())
    current = ''
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if ((char === '\\' || char === '`') && i + 1 < text.length) {
      current += char + text[i + 1]
      i += 1
    } else if (char === ';') {
      flush()
    } else if (quote === null && (char === '"' || char === "'")) {
      flush()
      quote = char
    } else if (char === quote) {
      flush()
      quote = null
    } else {
      current += char
    }
  }
  flush()
  return statements
}

function refuse(rule, program) {
  // Never echo the full command: it can carry a token or URL, and stderr lands in the
  // transcript. The program name is safe only when it is a bare word.
  block(
    `blocked destructive command: ${rule} (program: ${/^[\w.-]+$/.test(program) ? program : 'not shown'}). ` +
      'Agents do not run this; ask the user to run it by hand.'
  )
}

// The arguments wrangler receives, or null when the program is not wrangler. Besides the bare
// program (runners and wrappers are already peeled), `node …/wrangler.js` and the runners the
// table does not peel (`yarn wrangler`, `pnpm wrangler`) are read here.
function wranglerArgs(program, args) {
  if (WRANGLER.test(bareProgram(program))) return args
  const reaches = runtimeOf(program) !== null || WRANGLER_RUNNERS.has(program)
  const at = reaches ? args.findIndex(arg => WRANGLER.test(bareProgram(programName(arg)))) : -1
  return at === -1 ? null : args.slice(at + 1)
}

// The arguments modern-web-guidance receives, or null. Behind a runner or an interpreter only the
// word it runs counts (the first after `exec`, `dlx` or `x`), so `npm view modern-web-guidance`
// and a query word (`node scripts/guidance.mjs search modern-web-guidance`) pass.
function guidanceArgs(program, args) {
  if (GUIDANCE.test(bareProgram(program))) return args
  if (runtimeOf(program) === null && !WRANGLER_RUNNERS.has(program)) return null
  const at = args.findIndex(arg => !arg.startsWith('-') && !RUNNER_VERBS.has(arg))
  return at !== -1 && GUIDANCE.test(bareProgram(programName(args[at]))) ? args.slice(at + 1) : null
}

// A runner may name the package with a registry prefix and a version or tag
// (`npm:wrangler@4`, `wrangler@latest`): both are cut before the name is matched.
function bareProgram(name) {
  return name.replace(/^npm:/, '').replace(/(?<=.)@[^@]*$/, '')
}

// Null when a sub-agent may run these wrangler arguments, else the word to name in the refusal.
function wranglerRefusal(args) {
  const words = args.map(arg => arg.toLowerCase())
  if (words.some(word => word.startsWith('-') && word.split('=')[0].includes('remote'))) return 'remote'
  let at = 0
  while (at < words.length && words[at].startsWith('-')) {
    const flag = words[at].split('=')[0]
    if (WRANGLER_VALUE_FLAGS.has(flag)) at += words[at].includes('=') ? 1 : 2
    else if (WRANGLER_PLAIN_FLAGS.has(flag) && !words[at].includes('=')) at += 1
    else break
  }
  const rest = words.slice(at)
  if (rest.length === 0) return null
  if (rest.length === 1 && WRANGLER_INFO.has(rest[0])) return null
  const starts = list => list.every((word, i) => rest[i] === word)
  if (WRANGLER_LOCAL.some(starts)) return null
  if (WRANGLER_NEEDS_LOCAL.some(starts)) {
    return rest.some(word => word === '--local' || word === '--local=true') ? null : 'without --local'
  }
  return /^[a-z0-9-]+$/.test(rest[0]) ? rest[0] : 'command'
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

  // wrangler talks to a hosted platform (deploys, secrets, remote data); a person does that.
  // Sub-agents are refused here; the interactive session is asked by settings.json instead.
  const wrangler = resolveRole(payload) === null ? null : wranglerArgs(program, args)
  if (wrangler !== null) {
    const hit = wranglerRefusal(wrangler)
    if (hit !== null) return `wrangler ${hit} (a person deploys; agents never reach the hosted platform)`
  }

  // Database tooling that applies or drops schema directly.
  if (program === 'drizzle-kit' && (words[0] === 'drop' || words[0] === 'push')) return 'drizzle-kit drop|push (generate + migrate instead)'
  if (program === 'prisma' && ((words[0] === 'migrate' && words[1] === 'reset') || (words[0] === 'db' && words.includes('--force-reset')))) return 'prisma reset'
  if (program === 'supabase' && words[0] === 'db' && words[1] === 'reset') return 'supabase db reset'

  // Database programs that drop a database, or drop the target before writing into it.
  if (program === 'dropdb') return 'dropdb'
  if (program === 'mysqladmin' && words.includes('drop')) return 'mysqladmin drop'
  if ((program === 'mongorestore' || program === 'mongoimport') && flags.some(flag => /^--drop(=|$)/i.test(flag))) return `${program} --drop`
  if (program === 'pg_restore' && flags.some(flag => flag === '--clean' || /^-[A-Za-z]*c/.test(flag))) return 'pg_restore --clean (drops objects first)'

  // Container and volume destruction (docker and the docker-compose v1 spelling).
  const dockerWords = program === 'docker-compose' ? ['compose', ...words] : words
  if (program === 'docker' || program === 'docker-compose') {
    if (dockerWords[0] === 'system' && dockerWords[1] === 'prune') return 'docker system prune'
    if (dockerWords[0] === 'volume' && (dockerWords[1] === 'rm' || dockerWords[1] === 'prune')) return 'docker volume rm|prune'
    if (dockerWords[0] === 'compose' && dockerWords.includes('down') && flags.some(flag => /^-[a-z]*v/i.test(flag) || flag === '--volumes')) return 'docker compose down -v (drops the database volume)'
  }

  return null
}

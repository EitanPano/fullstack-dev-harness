// Unit tests for the shared tokenizer: a failure here names the exact stripping step.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as lib from '../lib/guardrail.mjs'
import {
  isPythonProgram,
  programName,
  pythonInlineCode,
  pythonReadsStdin,
  runnerTails,
  scriptInlineCode,
  segmentTokens,
  shellSegments,
  tokenize
} from '../lib/guardrail.mjs'

const cases = [
  // Runners and their value flags.
  ['uv run rm -rf x', ['rm', '-rf', 'x']],
  ['uv run --directory backend rm -r x', ['rm', '-r', 'x']],
  ['uv run --directory=backend rm -r x', ['rm', '-r', 'x']],
  ['uv --directory backend run rm', ['rm']],
  ['uv run --with httpx -p 3.14 pytest -q', ['pytest', '-q']],
  ['uv run --no-sync --locked pytest', ['pytest']],
  ['uv tool run --from foo rimraf x', ['rimraf', 'x']],
  ['uvx --from foo rimraf x', ['rimraf', 'x']],
  ['uvx rimraf x', ['rimraf', 'x']],
  ['poetry run git reset --hard', ['git', 'reset', '--hard']],
  ['poetry -C backend run pytest', ['pytest']],
  ['pipx run rimraf x', ['rimraf', 'x']],
  ['pdm run -p backend pytest', ['pytest']],
  ['hatch run test:pytest -q', ['pytest', '-q']],
  ['hatch run +py=3.12 test:pytest', ['pytest']],
  ['bun run --cwd backend rm -r x', ['rm', '-r', 'x']],
  ['bun x -p pkg rimraf x', ['rimraf', 'x']],
  ['bunx rimraf x', ['rimraf', 'x']],
  ['npm exec --package foo rimraf x', ['rimraf', 'x']],
  ['npm exec -c "rimraf x"', ['rimraf', 'x']],
  ['npx rimraf x', ['rimraf', 'x']],
  // Not runner invocations: left as they are.
  ['uv sync --locked', ['uv', 'sync', '--locked']],
  ['uv --version', ['uv', '--version']],
  ['bun install', ['bun', 'install']],
  ['poetry install', ['poetry', 'install']],
  // python -m resolves to the module; inline code and scripts stay.
  ['python -m pytest -p tests.db.plugin', ['pytest', '-p', 'tests.db.plugin']],
  ['python3.14 -m pytest', ['pytest']],
  ['py -3.14 -m pytest', ['pytest']],
  ['python -X dev -m pytest', ['pytest']],
  ['uv run python -m app.openapi --write', ['app.openapi', '--write']],
  ['python -c "print(1)"', ['python', '-c', 'print(1)']],
  ['python script.py -m x', ['python', 'script.py', '-m', 'x']],
  // Existing wrappers keep working.
  ['sudo -u root rm -rf x', ['rm', '-rf', 'x']],
  ['FOO=1 bash -lc "rm -rf x"', ['rm', '-rf', 'x']],
  ['timeout 5 rm -rf x', ['rm', '-rf', 'x']]
]
for (const [command, expected] of cases) {
  test(`segmentTokens: ${command}`, () => {
    assert.deepEqual(segmentTokens(command), expected)
  })
}

test('isPythonProgram accepts every interpreter spelling', () => {
  for (const name of ['py', 'python', 'python3', 'python3.14', 'python3.9', 'pypy', 'pypy3']) {
    assert.equal(isPythonProgram(name), true, name)
  }
  for (const name of ['pytest', 'pip', 'node', 'pythonista', 'python-config']) {
    assert.equal(isPythonProgram(name), false, name)
  }
})

test('pythonInlineCode finds -c only before the script', () => {
  assert.equal(pythonInlineCode(['-c', 'print(1)']), 'print(1)')
  assert.equal(pythonInlineCode(['-Ic', 'print(1)']), 'print(1)')
  assert.equal(pythonInlineCode(['-X', 'dev', '-c', 'x']), 'x')
  assert.equal(pythonInlineCode(['script.py', '-c', 'conf']), null)
  assert.equal(pythonInlineCode(['-m', 'pytest', '-c', 'pytest.ini']), null)
  assert.equal(pythonInlineCode([]), null)
})

test('programName strips directories and Windows suffixes', () => {
  assert.equal(programName('C:\\Python\\python3.14.EXE'), 'python3.14')
  assert.equal(programName('/usr/bin/uv'), 'uv')
})

test('shellSegments splits on operators outside quotes', () => {
  assert.deepEqual(shellSegments('uv sync && uv run "a && b" | tail'), [
    'uv sync',
    'uv run "a && b"',
    'tail'
  ])
})

test('tokenize removes surrounding quotes', () => {
  assert.deepEqual(tokenize(`a "b c" 'd e' f=g`), ['a', 'b c', 'd e', 'f=g'])
})

test('tokenize joins quoted and unquoted parts of one word', () => {
  assert.deepEqual(tokenize('--env-file=".env" x'), ['--env-file=.env', 'x'])
  assert.deepEqual(tokenize("--env-file='.env' x"), ['--env-file=.env', 'x'])
  assert.deepEqual(tokenize(`-c'import os; print(1)' y`), ['-cimport os; print(1)', 'y'])
  assert.deepEqual(tokenize('a "" b'), ['a', '', 'b'])
  assert.deepEqual(tokenize('backend\\.env x'), ['backend\\.env', 'x'])
})

test('segmentTokens resolves short flag clusters of a runner', () => {
  assert.deepEqual(segmentTokens('uv run -qp 3.14 rm -rf x'), ['rm', '-rf', 'x'])
  assert.deepEqual(segmentTokens('uv run -qq rm x'), ['rm', 'x'])
  assert.deepEqual(segmentTokens('uv run -p3.14 rm x'), ['rm', 'x'])
  assert.deepEqual(segmentTokens('uv run -qw httpx rm x'), ['rm', 'x'])
  // `-wq` is `-w q`: the value is attached, so `httpx` really is the program.
  assert.deepEqual(segmentTokens('uv run -wq httpx rm x'), ['httpx', 'rm', 'x'])
})

test('runnerTails keeps what follows each runner, flags unresolved', () => {
  assert.deepEqual(runnerTails('uv run --newflag v rm -rf x'), [
    ['--newflag', 'v', 'rm', '-rf', 'x']
  ])
  assert.deepEqual(runnerTails('uv run bun run x'), [['bun', 'run', 'x'], ['x']])
  assert.deepEqual(runnerTails('echo uv run rm'), [])
})

test('pythonInlineCode reads attached, clustered and module-borne code', () => {
  assert.equal(pythonInlineCode(['-cprint(1)']), 'print(1)')
  assert.equal(pythonInlineCode(['-Icprint(1)']), 'print(1)')
  assert.equal(pythonInlineCode(['-m', 'timeit', 'print(1)', '-n', '1']), 'print(1) -n 1')
  assert.equal(pythonInlineCode(['-m', 'pytest']), null)
  assert.equal(pythonInlineCode(['-']), null)
})

test('pythonReadsStdin: a dash, a heredoc, a pipe, or nothing to run', () => {
  assert.equal(pythonReadsStdin(['-']), true)
  assert.equal(pythonReadsStdin(['-', '<<EOF']), true)
  assert.equal(pythonReadsStdin(['<<EOF']), true)
  assert.equal(pythonReadsStdin([]), true)
  assert.equal(pythonReadsStdin(['-X', 'dev']), true)
  assert.equal(pythonReadsStdin(['script.py']), false)
  assert.equal(pythonReadsStdin(['script.py', '<', 'in.txt']), false)
  assert.equal(pythonReadsStdin(['-m', 'pytest']), false)
  assert.equal(pythonReadsStdin(['-c', 'x']), false)
  assert.equal(pythonReadsStdin(['--version']), false)
  assert.equal(pythonReadsStdin(['-V']), false)
})

test('scriptInlineCode reads separate and attached spellings', () => {
  assert.equal(scriptInlineCode(['-e', 'x']), 'x')
  assert.equal(scriptInlineCode(['-ex']), 'x')
  assert.equal(scriptInlineCode(['--eval=x']), 'x')
  assert.equal(scriptInlineCode(['-pe', 'x']), 'x')
  assert.equal(scriptInlineCode(['script.js', '--flag']), null)
  assert.equal(scriptInlineCode(['--experimental-vm-modules']), null)
  assert.equal(scriptInlineCode(['-rfoo']), null)
  assert.equal(scriptInlineCode(['-rfoo'], 'erp'), 'foo')
})

// Final review of milestone 4.
test('C1: a backslash-escaped quote or operator outside quotes is a literal character', () => {
  assert.deepEqual(tokenize('rm \\" -rf x \\"'), ['rm', '"', '-rf', 'x', '"'])
  assert.deepEqual(tokenize("cat \\' .env \\'"), ['cat', "'", '.env', "'"])
  assert.deepEqual(tokenize('echo a\\;b'), ['echo', 'a;b'])
  assert.deepEqual(tokenize('echo \\$HOME'), ['echo', '$HOME'])
  // A backslash before anything else stays: Windows paths, escaped backslashes, trailing ones.
  assert.deepEqual(tokenize('cat backend\\.env'), ['cat', 'backend\\.env'])
  assert.deepEqual(tokenize('cat C:\\x\\ -r'), ['cat', 'C:\\x\\', '-r'])
  assert.deepEqual(tokenize('cat \\\\server\\share'), ['cat', '\\\\server\\share'])
  assert.deepEqual(tokenize('echo \\\\"a b"'), ['echo', '\\\\a b'])
})

test('C1: shellSegments does not open a quote at an escaped quote', () => {
  assert.deepEqual(shellSegments('echo \\" ; rm -rf x ; echo \\"'), ['echo \\"', 'rm -rf x', 'echo \\"'])
  assert.deepEqual(shellSegments("echo \\' ; rm -rf x ; echo \\'"), ["echo \\'", 'rm -rf x', "echo \\'"])
  assert.deepEqual(shellSegments('echo "a \\" ; b"; ls'), ['echo "a \\" ; b"', 'ls'])
  assert.deepEqual(shellSegments('echo \\\\"a ; b"; ls'), ['echo \\\\"a ; b"', 'ls'])
  // PowerShell's backtick escapes a quote the same way.
  assert.deepEqual(shellSegments('echo `"; rm -rf x; echo `"'), ['echo', '"', 'rm -rf x', 'echo', '"'])
})

test('C2: uv run -m and uv run - are the Python channels', () => {
  assert.deepEqual(segmentTokens('uv run -m pytest -q'), ['pytest', '-q'])
  assert.deepEqual(segmentTokens('uv run -m timeit "print(1)"'), ['python', '-m', 'timeit', 'print(1)'])
  assert.deepEqual(segmentTokens('uv run --module timeit x'), ['python', '-m', 'timeit', 'x'])
  assert.deepEqual(segmentTokens('uv run -qm timeit x'), ['python', '-m', 'timeit', 'x'])
  assert.deepEqual(segmentTokens('uv run --no-project -m code'), ['python', '-m', 'code'])
  assert.deepEqual(segmentTokens('uv run - <<EOF'), ['python', '-', '<<EOF'])
  assert.deepEqual(segmentTokens('uv run --no-project -'), ['python', '-'])
  // -p takes a value: the m in `-pm` is that value, not the module flag.
  assert.deepEqual(segmentTokens('uv run -pm pytest'), ['pytest'])
  assert.deepEqual(segmentTokens('uv run pytest -m slow'), ['pytest', '-m', 'slow'])
})

test('I1: hidden uv flags take their value, before and after the subcommand', () => {
  assert.deepEqual(segmentTokens('uv --python-preference system run rm -rf x'), ['rm', '-rf', 'x'])
  assert.deepEqual(segmentTokens('uv --preview-features x run rm'), ['rm'])
  assert.deepEqual(segmentTokens('uv --python-fetch automatic run rm'), ['rm'])
  assert.deepEqual(segmentTokens('uv run --python-preference system rm x'), ['rm', 'x'])
  assert.deepEqual(segmentTokens('uv run --preview-features x pytest'), ['pytest'])
  assert.deepEqual(segmentTokens('uvx --python-fetch never rimraf x'), ['rimraf', 'x'])
})

test('I1: an unknown flag before the subcommand still records the tail', () => {
  assert.deepEqual(runnerTails('npm --prefix backend exec rimraf x'), [['rimraf', 'x']])
  assert.deepEqual(runnerTails('pnpm --filter x exec rm -rf y'), [['rm', '-rf', 'y']])
  assert.deepEqual(runnerTails('uv --newflag value run rm -rf y'), [['rm', '-rf', 'y']])
  assert.deepEqual(runnerTails('bun add rimraf'), [])
  assert.deepEqual(runnerTails('uv sync --locked'), [])
})

test('I1: interpreterViews judges every later interpreter after an unknown runner flag', () => {
  const views = lib.interpreterViews('uv run --newflag value python -c "print(1)"')
  assert.deepEqual(views, [['python', '-c', 'print(1)']])
  assert.deepEqual(lib.interpreterViews('uv run poe check'), [])
  assert.deepEqual(lib.interpreterViews('npm --prefix backend exec node -e 1'), [['node', '-e', '1']])
})

test('I2: env behind a wrapper or runner stays an env call', () => {
  for (const command of ['uv run env', 'uvx env', 'poetry run env', 'bun run env', 'sudo env', 'nohup env']) {
    assert.deepEqual(segmentTokens(command), ['env'], command)
  }
  assert.deepEqual(segmentTokens('env -u FOO'), ['env', '-u'])
  assert.deepEqual(segmentTokens('env FOO=1'), ['env'])
  assert.deepEqual(segmentTokens('env FOO=1 uv run poe dev'), ['poe', 'dev'])
  assert.deepEqual(segmentTokens('timeout 5 env'), ['env'])
})

test('I3: asyncio and IPython read stdin as a REPL', () => {
  for (const module of ['asyncio', 'code', 'pdb', 'ipython', 'IPython']) {
    assert.equal(pythonReadsStdin(['-m', module, '<<EOF']), true, module)
    assert.equal(pythonReadsStdin(['-m', module]), true, module)
  }
  assert.equal(pythonReadsStdin(['-m', 'pdb', 'script.py']), false)
  assert.equal(pythonReadsStdin(['-m', 'pytest']), false)
  assert.equal(pythonInlineCode(['-m', 'asyncio']), '')
  assert.equal(pythonInlineCode(['-m', 'IPython', '-c', 'x']), '-c x')
})

test('M1: every Python launcher counts', () => {
  for (const name of ['py', 'pyw', 'python', 'pythonw', 'python3', 'python314', 'python3.14', 'python3.14t', 'pypy', 'pypy3', 'pypy3.10', 'ipython', 'ipython3']) {
    assert.equal(isPythonProgram(name), true, name)
  }
  for (const name of ['pytest', 'pythonic', 'python-config', 'pyright', 'pylint']) {
    assert.equal(isPythonProgram(name), false, name)
  }
})

test('M2: a bare interpreter or a dash reads its program from stdin', () => {
  assert.equal(lib.scriptReadsStdin(['-']), true)
  assert.equal(lib.scriptReadsStdin(['-', '<<EOF']), true)
  assert.equal(lib.scriptReadsStdin([]), true)
  assert.equal(lib.scriptReadsStdin(['<<EOF']), true)
  assert.equal(lib.scriptReadsStdin(['--no-warnings']), true)
  assert.equal(lib.scriptReadsStdin(['--require', 'x', '-']), true)
  assert.equal(lib.scriptReadsStdin(['script.js']), false)
  assert.equal(lib.scriptReadsStdin(['script.js', '<', 'in.txt']), false)
  assert.equal(lib.scriptReadsStdin(['run', 'check']), false)
  assert.equal(lib.scriptReadsStdin(['--version']), false)
  assert.equal(lib.scriptReadsStdin(['-v']), false)
  assert.equal(lib.scriptReadsStdin(['--test']), false)
  assert.equal(lib.scriptReadsStdin(['--help']), false)
})

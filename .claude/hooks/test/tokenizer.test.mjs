// Unit tests for the shared tokenizer: a failure here names the exact stripping step.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isPythonProgram,
  programName,
  pythonInlineCode,
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
  assert.deepEqual(shellSegments('uv sync && uv run "a && b" | tail'), ['uv sync', 'uv run "a && b"', 'tail'])
})

test('tokenize removes surrounding quotes', () => {
  assert.deepEqual(tokenize(`a "b c" 'd e' f=g`), ['a', 'b c', 'd e', 'f=g'])
})

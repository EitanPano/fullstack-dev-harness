// Python package runners, value-taking runner flags, Python inline code, and the secret
// files and environment dumps that go with them (plan 009, M4-20).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shellVerdict } from './harness.mjs'

const label = options => (options?.role ? ` [${options.role}]` : '')

const blocks = (command, options) =>
  test(`blocks: ${command}${label(options)}`, () => {
    assert.equal(shellVerdict(command, options).blocked, true, 'expected a block')
  })

const passes = (command, options) =>
  test(`passes: ${command}${label(options)}`, () => {
    const verdict = shellVerdict(command, options)
    assert.equal(verdict.blocked, false, `unexpected block by ${verdict.hook}: ${verdict.stderr}`)
  })

// Runners are seen through, for everyone.
for (const command of [
  'uv run rm -rf x',
  'uv run --directory backend rm -r x',
  'uv run --directory=backend rm -r x',
  'uv --directory backend run rm -r x',
  'uv run --with httpx --python 3.14 rm -rf x',
  'uv run -p 3.14 -w httpx rm -rf x',
  'uv run --group dev --extra x rm -rf x',
  'uv tool run rimraf x',
  'uv tool run --from foo rimraf x',
  'uvx rimraf x',
  'uvx --from foo rimraf x',
  'uvx --from=foo rimraf x',
  'poetry run git reset --hard',
  'poetry --directory backend run rm -rf x',
  'poetry -C backend run rm -rf x',
  'pipx run rimraf x',
  'pdm run rm -rf x',
  'pdm run -p backend rm -rf x',
  'pdm run --env-file f rm -rf x',
  'hatch run rm -rf x',
  'hatch run test:rm -rf x',
  'hatch -e test run rm -rf x',
  'bun run --cwd backend rm -r x',
  'bun run --cwd=backend rm -r x',
  'bun --cwd backend run rm -r x',
  'bun x -p pkg rimraf x',
  'bunx -p pkg rimraf x',
  'npm exec --package foo rimraf x',
  'npm exec -w backend rimraf x',
  'npm run --workspace backend rimraf x',
  'python -m rimraf x',
  'uv run python -m rimraf x',
  'uv run git push --force',
  'uv run sh -c "rm -r x"',
  'uv run --env-file=.env.example rm -rf x'
]) {
  blocks(command)
}

// Python inline code and environment dumps, for everyone.
for (const command of [
  'uv run python -c "import os; print(os.environ)"',
  'python -c "import os;print(os.environ)"',
  'py -c "import os; print(dict(os.environ))"',
  'python3.14 -c "import os; print(os.environ.items())"',
  'python3 -c "import os; print(os.environ.copy())"',
  'python -c "import os; print(list(os.environ.keys()))"',
  'python -c "import os; print(os.environ.values())"',
  'python -c "import os; print({**os.environ})"',
  'python -c "import os, json; print(json.dumps(dict(os.environ)))"',
  'python -c "import os; print(os.environb)"',
  'python -c "from os import environ; print(environ)"',
  'python -c "from os import environ; print(dict(environ))"',
  'python -Ic "import os; print(os.environ)"',
  'python -X dev -c "import os; print(os.environ)"',
  'uv run --with httpx python -c "import os; print(os.environ)"',
  'pypy3 -c "import os; print(os.environ)"',
  "python -c 'import os; print(os.environ)'"
]) {
  blocks(command)
}

// Secret files behind wrappers, flags and inline code, for everyone.
for (const command of [
  'bun run --env-file .env dev',
  'bun run --env-file=.env dev',
  'bun run --env-file=backend/.env.local dev',
  'uv run --env-file .env poe dev',
  'uv run --env-file=.env poe dev',
  'uvx --env-file .env tool',
  'pdm run --env-file .env x',
  'python -c "print(open(\'.env\').read())"',
  'python -c "print(open(\'backend/.env.local\').read())"',
  'python -c "from pathlib import Path; print(Path(\'.env\').read_text())"',
  'uv run python -c "print(open(\'.env\').read())"',
  'node -e "console.log(require(\'fs\').readFileSync(\'backend/.env.local\', \'utf8\'))"',
  'node -e "require(\'fs\').readFileSync(\'.env\')"',
  'python -c "print(open(\'server.pem\').read())"',
  'cat ~/.pypirc',
  'cat pip.conf',
  'cat pip.ini',
  'type %APPDATA%\\pip\\pip.ini',
  'Get-Content ~/.pypirc'
]) {
  blocks(command)
}

// Role agents: inline code through every runtime and runner, and shell write channels
// behind a runner.
for (const role of ['backend', 'frontend', 'qa']) {
  for (const command of [
    'uv run python -c "print(1)"',
    'py -c "print(1)"',
    'python3.14 -c "print(1)"',
    'python -c "print(1)"',
    'python -Ic "print(1)"',
    'pypy3 -c "print(1)"',
    'uv run --with httpx python -c "print(1)"',
    'uv run --directory backend python -c "print(1)"',
    'uvx --from foo python -c "print(1)"',
    'poetry run python -c "print(1)"',
    'uv run tee f',
    'uv run sed -i s/a/b/ f',
    'uv run sh -c "cp a b"',
    'uv run --directory backend rm f',
    'uv run node -e "1"',
    'bun run --cwd backend rm f'
  ]) {
    blocks(command, { role })
  }
}

// Ordinary Python work passes for everyone and for role agents.
for (const role of [undefined, 'backend']) {
  for (const command of [
    'uv run poe check',
    'uv run poe test-db',
    'uv sync',
    'uv sync --locked',
    'uv lock',
    'uv lock --check',
    'uv add httpx',
    'uv run pytest',
    'uv run ruff check .',
    'uv run mypy src',
    'uv run --directory backend poe check',
    'uv run --with httpx pytest',
    'uv --version',
    'uv tool run ruff check .',
    'uvx ruff check .',
    'python -m pytest',
    'python3.14 -m pytest -q',
    'python -X dev -m pytest',
    'py -3.14 -m pytest',
    'uv run python -m pytest -p tests.db.plugin',
    'uv run python -m app.openapi --write',
    'uv run --env-file=.env.example poe dev',
    'uv run --env-file .env.example poe dev',
    'poetry run pytest',
    'poetry install',
    'pdm run pytest',
    'hatch run test:pytest',
    'pipx run black .',
    'python script.py',
    'python script.py -c config.ini',
    'cat backend/.env.example',
    'cat .env.sample',
    'cat .env.template',
    'bun run --cwd backend check',
    'bun run --env-file=.env.example dev',
    'npm exec --package foo prettier --check .'
  ]) {
    passes(command, { role })
  }
}

// Reading one key from the environment is fine for the interactive session.
passes('python -c "import os; print(os.environ[\'HOME\'])"')
passes('python -c "import os; print(os.environ.get(\'HOME\'))"')
passes('python -c "import os; print(os.getenv(\'HOME\'))"')
passes('uv run python -c "import os; print(os.environ.get(\'HOME\', \'\'))"')
passes('python -c "print(open(\'.env.example\').read())"')
passes('python -c "print(open(\'README.md\').read())"')
passes('node -e "console.log(require(\'fs\').readFileSync(\'.env.example\', \'utf8\'))"')

// PowerShell payloads go through the same guardrails.
const powershell = (command, expectBlocked, options = {}) =>
  test(`${expectBlocked ? 'blocks' : 'passes'} (PowerShell): ${command}${label(options)}`, () => {
    const verdict = shellVerdict(command, { ...options, tool: 'PowerShell' })
    assert.equal(verdict.blocked, expectBlocked, verdict.stderr)
  })

powershell('uv run rm -rf x', true)
powershell('uv run --directory backend Remove-Item -Recurse x', true)
powershell('uv run python -c "import os; print(dict(os.environ))"', true)
powershell('Get-Content ~/.pypirc', true)
powershell('uv run --env-file .env poe dev', true)
powershell('uv run python -c "print(1)"', true, { role: 'backend' })
powershell('uv run poe check', false)
powershell('uv run poe check', false, { role: 'backend' })
powershell('uv sync --locked', false)

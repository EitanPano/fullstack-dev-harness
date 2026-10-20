#!/usr/bin/env node
// PreToolUse guardrail on every tool (the `*` matcher is deliberate): hard-blocks access to
// env/secret files whichever tool names them in a path field or a shell command — Read,
// Edit, Write, NotebookEdit, Bash, and any MCP tool with a `path` field. `permissions.deny`
// covers only the tool+pattern pairs listed there and cannot look inside a Bash command
// string; this hook inspects the target of every call, so `cat .env`, Read(.env) and
// `grep KEY backend/.env` are all caught the same way.
//
// What is inspected, and what is not on purpose:
// - Fields that NAME a target (file_path, path, notebook_path), trimmed the way the file
//   tools trim them, and the shell `command`.
// - Not a Write's `content`: setup docs, .env.example templates and this file legitimately
//   mention env files. Scanning content made the hook unable to edit itself.
// - `.env.example` is deliberately allowed: it is committed template content.
//
// Known gaps (Phase 1): only `.env`,
// `.env.local`, `.env.development` and `.env.production` are matched; other secret file
// names and env-dump commands (`printenv`, `console.log(process.env)`) are not; Grep's
// `path`/`glob` and MCP `paths[]` arrays are not inspected.
import { allow, block, readPayload } from './lib/guardrail.mjs'

const SECRET_FILE_PATTERN = /(^|[\/\\])\.env(\.local|\.development|\.production)?(?![\w.-])/i
const SECRET_IN_COMMAND_PATTERN = /(^|[\s"'=/\\])[\w./\\-]*\.env(\.local|\.development|\.production)?(?![\w.-])/i

const PATH_FIELDS = ['file_path', 'path', 'notebook_path']

const payload = await readPayload()
const toolInput = payload.tool_input

const blockedPath = PATH_FIELDS
  .map(field => toolInput[field])
  .find(value => typeof value === 'string' && SECRET_FILE_PATTERN.test(value.trim()))

const command = typeof toolInput.command === 'string' ? toolInput.command : ''
const blockedCommand = SECRET_IN_COMMAND_PATTERN.test(command)

if (blockedPath || blockedCommand) {
  const tool = payload.tool_name ?? 'tool'
  const where = blockedPath ? `: ${blockedPath}` : ' named in the command'
  block(`blocked ${tool} call touching an env/secret file${where}. Use .env.example instead.`)
}

allow()

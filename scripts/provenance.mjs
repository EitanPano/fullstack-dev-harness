import { existsSync, readFileSync } from 'node:fs'

// The template kind (`server`, `serverless`, `frontend`, `sdk`) is the part of the template id
// before the slash; the scripts name a package's kind by it, never by which commands it has.
export const kindOf = (template) => template.split('/')[0]

// An SDK package lives at `sdk-<name>`, <name> kebab-case; it is not a frontend directory.
export const SDK_DIRS = 'sdk-<name>'
export const isSdkDir = (dir) => /^sdk-[a-z0-9]+(-[a-z0-9]+)*$/.test(dir)

// The directory names a frontend package may take; the one place the type names live in code.
export const FRONTEND_DIRS = 'site, platform, app, app-<tool>, admin'
export const isFrontendDir = (dir) =>
  /^(site|platform|admin|app(-[a-z0-9]+(-[a-z0-9]+)*)?)$/.test(dir)

// The generator writes the provenance file in a fixed shape, so a line scan for the facts needed
// (deploy, and per package its template, http.port and commands) replaces a YAML dependency.
// `http` reads in both the block and the inline (`{ port: 1 }`) form.
export function readProvenance(file) {
  const result = { deploy: undefined, packages: [] }
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return result
  }
  const unquote = (value) => value.replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '')
  let section = ''
  let pkg
  let inHttp = false
  let inCommands = false
  // The command whose block is being read, so its continuation lines join onto it: a folded
  // block (`>`) joins with spaces, a literal one (`|`) with newlines.
  let folded
  let joiner = ' '
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const top = /^([A-Za-z]\w*):\s*(.*?)\s*$/.exec(line)
    if (top !== null) {
      section = top[1]
      if (section === 'deploy') result.deploy = unquote(top[2])
      continue
    }
    if (section !== 'packages') continue
    // A key is one segment, or two for a nested package (`serverless/cloudflare`).
    const name = /^ {2}(['"]?)([\w.-]+(?:\/[\w.-]+)?)\1:\s*$/.exec(line)
    if (name !== null) {
      pkg = { name: name[2], dir: name[2], template: '', port: undefined, commands: {} }
      result.packages.push(pkg)
      inHttp = false
      inCommands = false
      folded = undefined
      continue
    }
    // Any other package-level key must not leave its facts to the previous package.
    if (/^ {2}\S/.test(line)) {
      pkg = undefined
      inHttp = false
      inCommands = false
      folded = undefined
      continue
    }
    const key = /^ {4}(\w+):\s*(.*?)\s*$/.exec(line)
    if (key !== null && pkg !== undefined) {
      inHttp = key[1] === 'http'
      inCommands = key[1] === 'commands'
      folded = undefined
      if (key[1] === 'template') pkg.template = unquote(key[2])
      if (key[1] === 'http') pkg.port = Number(/\bport:\s*(\d+)/.exec(key[2])?.[1]) || pkg.port
      continue
    }
    if (inCommands && pkg !== undefined) {
      const entry = /^ {6}(\w+):\s*(.*?)\s*$/.exec(line)
      if (entry !== null) {
        const block = /^[>|][+-]?$/.test(entry[2])
        pkg.commands[entry[1]] = block ? '' : unquote(entry[2])
        folded = block ? entry[1] : undefined
        joiner = entry[2].startsWith('|') ? '\n' : ' '
        continue
      }
      const more = /^ {8,}(\S.*?)\s*$/.exec(line)
      if (more !== null && folded !== undefined) {
        pkg.commands[folded] = `${pkg.commands[folded]}${joiner}${more[1]}`.trim()
        continue
      }
    }
    const port = /^ {6}port:\s*(\d+)\s*$/.exec(line)
    if (port !== null && inHttp && pkg !== undefined) pkg.port = Number(port[1])
  }
  return result
}

// Auth is on only when a package's `flags` block says `auth: true`; a project without a server
// (or an unreadable file) has no accounts, so its auth text is cleared.
export function authFlagFrom(provenancePath) {
  if (!existsSync(provenancePath)) return false
  let flagsIndent
  for (const line of readFileSync(provenancePath, 'utf8').split(/\r?\n/)) {
    const indent = /^\s*/.exec(line)[0].length
    if (/^\s+flags:\s*$/.test(line)) flagsIndent = indent
    else if (line.trim() !== '' && flagsIndent !== undefined && indent <= flagsIndent) {
      flagsIndent = undefined
    }
    if (/^\s+flags:\s*\{[^}]*\bauth:\s*true\b/.test(line)) return true
    const authLine = /^\s+auth:\s*true\s*(#.*)?$/.test(line)
    if (flagsIndent !== undefined && indent > flagsIndent && authLine) {
      return true
    }
  }
  return false
}

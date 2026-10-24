import { readFileSync } from 'node:fs'

// The generator writes the provenance file in a fixed shape, so a line scan for the three facts
// needed (deploy, and per package its template and http.port) replaces a YAML dependency.
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
  for (const line of text.split(/\r?\n/)) {
    const top = /^([A-Za-z]\w*):\s*(.*?)\s*$/.exec(line)
    if (top !== null) {
      section = top[1]
      if (section === 'deploy') result.deploy = unquote(top[2])
      continue
    }
    if (section !== 'packages') continue
    const name = /^ {2}([\w.-]+):\s*$/.exec(line)
    if (name !== null) {
      pkg = { name: name[1], template: '', port: undefined }
      result.packages.push(pkg)
      inHttp = false
      continue
    }
    const key = /^ {4}(\w+):\s*(.*?)\s*$/.exec(line)
    if (key !== null && pkg !== undefined) {
      inHttp = key[1] === 'http'
      if (key[1] === 'template') pkg.template = unquote(key[2])
      continue
    }
    const port = /^ {6}port:\s*(\d+)\s*$/.exec(line)
    if (port !== null && inHttp && pkg !== undefined) pkg.port = Number(port[1])
  }
  return result
}

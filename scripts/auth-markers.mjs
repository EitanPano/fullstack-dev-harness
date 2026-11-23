// Resolves the auth markers of a `.doc/` text for a product with or without accounts. Used by
// history.mjs (setup and recovery) and package-doc.mjs (a seeded package file).
//
// Markers:
//   ... <!-- auth -->               a line (a table row's marker sits inside its last cell)
//   <!-- auth-start --> ... <!-- auth-end -->   a block
//   <!-- noauth: TEXT -->           TEXT replaces the line when the product has no auth

// Only a marker at the end of the line's content (before a table row's closing `|`) is inline;
// any other spelling stays in the text and the post-condition in resolveAuthMarkers rejects it.
const INLINE = / ?<!-- auth\s*-->(?=\s*(?:\|\s*)?$)/
const LEFTOVER = /<!--\s*(?:no)?auth|auth-(?:start|end)/
const BLOCK_START = /^\s*<!-- auth-start -->\s*$/
const BLOCK_END = /^\s*<!-- auth-end -->\s*$/
const NOAUTH = /^(\s*)<!-- noauth: (.*) -->\s*$/

export function resolveAuthMarkers(text, auth) {
  const eol = text.match(/\r?\n/)?.[0] === '\r\n' ? '\r\n' : '\n'
  const out = []
  let inBlock = false
  for (const line of text.split(/\r?\n/)) {
    if (BLOCK_START.test(line)) {
      if (inBlock) throw new Error('nested <!-- auth-start --> inside an open auth block')
      inBlock = true
    } else if (BLOCK_END.test(line)) {
      if (!inBlock) throw new Error('stray <!-- auth-end --> with no open auth block')
      inBlock = false
    } else if (inBlock) {
      if (auth) out.push(line)
    } else if (NOAUTH.test(line)) {
      const [, indent, body] = line.match(NOAUTH)
      if (!auth) out.push(indent + body)
    } else if (INLINE.test(line)) {
      if (auth) out.push(line.replace(INLINE, ''))
    } else {
      out.push(line)
    }
  }
  if (inBlock) throw new Error('unclosed <!-- auth-start --> block: no <!-- auth-end --> found')
  const result = out.join(eol)
  const left = LEFTOVER.exec(result)
  if (left !== null) {
    const shown = result.slice(left.index).split(/\r?\n/)[0].slice(0, 60)
    throw new Error(`an auth marker is misspelled or not at the end of its line: ${shown}`)
  }
  return result
}

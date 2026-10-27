// The paths whose change asks for the security review (dev-loop §4). The globs are plan D3's;
// each package's env module is listed by the catalog's template layout.
const GLOBS = [
  '**/auth/**',
  '**/security/**',
  '**/middleware/**',
  '**/proxy.ts',
  '**/shared/auth/**',
  '**/migrations/**',
  '**/*.sql',
  '**/Dockerfile',
  'docker-compose.yml',
  // bun-express `src/config/env.ts`, python-fastapi `src/app/config/env.py`, react and next
  // `src/env.ts`.
  '**/config/env.ts',
  '**/config/env.py',
  '**/src/env.ts',
]

// `**/` is any number of directories (or none), a trailing `/**` everything below, `*` one
// path segment's characters.
function toRegExp(glob) {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith('**/', i)) (source += '(?:.*/)?'), (i += 2)
    else if (glob.startsWith('/**', i) && i + 3 === glob.length) (source += '/.*'), (i += 2)
    else if (glob[i] === '*') source += '[^/]*'
    else source += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

const PATTERNS = GLOBS.map(toRegExp)

export function securityPaths(files) {
  return files.filter((file) => {
    const path = file.replaceAll('\\', '/')
    return PATTERNS.some((pattern) => pattern.test(path))
  })
}

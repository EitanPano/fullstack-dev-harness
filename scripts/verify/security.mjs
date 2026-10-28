import { matching } from './glob.mjs'

// The paths whose change asks for the security review (dev-loop §4). Plan 014 D2 narrowed the
// list: migrations and `.sql` files no longer trigger. Each package's env module is listed by
// the catalog's template layout.
const GLOBS = [
  '**/auth/**',
  '**/session/**',
  '**/*session*',
  '**/security/**',
  '**/middleware/**',
  '**/proxy.ts',
  '**/shared/auth/**',
  '**/cors.*',
  '**/Dockerfile',
  'docker-compose.yml',
  // bun-express `src/config/env.ts`, python-fastapi `src/app/config/env.py`, and the v1.4.0
  // frontends' `src/shared/config/env.ts` (matched by `**/config/env.ts`). `**/src/env.ts`
  // stays for 1.x frontends.
  '**/config/env.ts',
  '**/config/env.py',
  '**/src/env.ts',
  // Deploy configuration: rarely changed, and it sets headers, build context and routing.
  '**/nginx/**',
  '**/.dockerignore',
  '**/next.config.*',
]

export function securityPaths(files) {
  return matching(files, GLOBS)
}

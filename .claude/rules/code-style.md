# Code style

Applies to every JavaScript and TypeScript file: `frontend/`, `backend/`, `templates/`,
`scripts/` and `.claude/hooks/`.

- No trailing semicolons. When a semicolon is required for syntax safety, put it at the
  start of the line:

  ```js
  const value = getValue()
  ;(() => init())()
  ```

- Prettier formats everything: `semi: false`, `singleQuote: true`, `printWidth: 100`.
  Run `bun run format` instead of formatting by hand.
- TypeScript strict. No `any`; use `unknown` and narrow. Named exports. Small files with
  one responsibility.
- Comments say why, not what. No commented-out code.

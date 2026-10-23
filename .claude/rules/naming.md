# Naming

Applies to routes, modules, features, files, tables, collections, fields and environment
variables.

- Singular entity names everywhere: `post` not `posts`, `/api/post`, `api/post/`,
  `feature/post/`, table or collection `post`.
- Use the canonical short term from `.doc/glossary.md`. Never introduce a second word for
  a concept that already has one; add a new shared term to the glossary before using it.
- File and directory case follows the package's language, stated in its `AGENTS.md`
  (kebab-case for a TypeScript package, snake_case module names for Python). UI components are PascalCase exports.
  SQL tables and columns are snake_case; MongoDB collections are singular and their
  fields camelCase. Environment variables are SCREAMING_SNAKE_CASE.
- Route, module, feature and file names match the domain term they serve.
- `models/` (plural, top-level) holds an entity's types; `api/<name>/model`
  (singular, in the module) is the engine's storage mapping.
- The word "service" has two homes and one meaning each: `api/<name>/service` is a
  module's private queries; `services/` is the shared-capability folder (sessions, cache,
  events, logging, security, communication, pure utils).

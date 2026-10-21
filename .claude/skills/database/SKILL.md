---
name: database
description: Choose, add or change the data layer or the cache store. Use when the bootstrap asks which database engine the product uses, when a plan introduces an entity, table, collection, index or migration, when writing a repository.ts or model.ts, when adding a store under backend/src/infra/, when a test needs the database or the cache, or when seeding local data. Covers the rules that hold for every engine (one data-model source, a repository per module, the infra Resource contract, the two file seams, a separate test database, migrations or indexes shipped with the change), the specifics for Postgres and MongoDB, and the cache store (Redis or Valkey).
---

# Database

The template ships an in-memory store (`infra/memory.ts`) behind two file seams,
`services/db.ts` and `services/cache.ts`; nothing survives a restart. The engine and its
client library are chosen once, in the bootstrap, and recorded in `.doc/architecture.md`
under Data store; the first backlog task adds the data layer. Everything under "Every
engine" holds whatever was chosen; the engine sections add what differs. An engine not
listed here gets its own section in this file before the data-layer task starts.

## Choosing (bootstrap)

Ask the user one question: Postgres, MongoDB, or decide later.

- Postgres when the data is relational (many entities referencing each other),
  transactions span several writes, or reporting queries are expected.
- MongoDB when records are document-shaped (nested, varying fields) and read mostly by
  id or owner.
- Decide later when the first tasks need no persistence; the orchestrator refuses to plan
  a task that stores data until the section is filled.

Record the engine and the client library (for example "Postgres 17 with Drizzle" or
"MongoDB 8 with the official driver") in `.doc/architecture.md` Data store, and make the
first backlog line `- [ ] add the <engine> data layer | stack:backend` when an engine was
chosen.

## The data-layer task

`services/db.ts` is a file seam, not a type seam: it exports the active store, and its type
changes with the engine. The task rewrites the file and everything bound to it. One task,
planned and reviewed like any other, delivers:

1. The engine's service in `docker-compose.yml` (shape below), with `backend` under the
   `app` profile pointing at it and `depends_on` it.
2. The URL variable in `backend/src/config/env.ts` (required in production, defaulting to
   the compose service elsewhere) and in `backend/.env.example`.
3. `backend/src/infra/<engine>.ts` (`infra/postgres.ts`, `infra/mongodb.ts`): exports the
   client and the module's `Resource` from `infra/dependency.ts` (`connect` opens the
   connection from `env`, `ping` runs the cheapest round trip, `close` ends the pool).
4. `services/db.ts` rewritten to export the engine's client. For SQL also export the
   `Executor` type a repository accepts: the client or a transaction.
5. Every `api/*/repository.ts` rewritten against it (`user`, `module` and any product
   module), and `services/session.ts`, which keeps its own queries because it has no
   repository. Signatures stay; bodies change. Each module's `model.ts` when the engine
   defines models in code.
6. `infra/<engine>.ts` added to `dependencies` in `infra/dependency.ts`, replacing
   `memory`. Keep `memory` in the list only while `services/cache.ts` still runs on it, that
   is, until the cache task has run. The entry then connects it with retry before listening,
   `GET /api/health/ready` reports it, and shutdown closes it.
7. `backend/src/infra/scripts/migrate.ts` and its migration, and the scripts `db:migrate`
   (and `db:generate` for tools that generate migrations) in `backend/package.json`.
8. `backend/tests/db/` (helpers and setup, shape below), `bunfig.toml` with `preload`, the
   `test:db` script, plus one `describeDb` test proving `app_test` is the database in use.
9. A `.doc/architecture.md` change-log line and the Data Model section started.

### What the shipped code assumes of the store

The auth and user modules were written against the memory store; the rewrite keeps these
properties, or a race the memory store hides reaches production:

- **Sessions.** `rotateSession` is a conditional update (`where id = ? and tokenHash = ? and
  revokedAt is null`, returning the row): exactly one concurrent rotation wins and the
  loser re-reads the record. `revokeAllSessions` is an `updateMany` with a filter on the
  user. `graceToken` is a sealed string column (the code encrypts it before the write).
- **User uniqueness.** Unique indexes on `email` and on **verified** `phone`. Postgres: a
  partial unique index `where phone_verified_at is not null`. MongoDB: a partial or sparse
  unique index on `phone` limited to verified rows. An unverified phone claim does not
  block others, so a plain unique index on `phone` is wrong.
- **Seed.** The seed script calls `user.setUserRole` to make the first admin; there is no
  other bootstrap.

## Every engine

- **One data-model source.** The interface in `models/<name>/interface.ts` is the
  declaration of the stored record. Engines that define models in code (Mongoose, an ORM)
  keep the storage mapping in `backend/src/api/<name>/model.ts`, written so the compiler
  holds it to the interface (examples per engine below); engines whose model is the
  migration history keep one `backend/src/infra/schema.*` file and map rows to the interface
  in the repository. `.doc/architecture.md` Data Model lists the same entities in prose; the
  code wins on conflict.
- **Store access in one place.** `services/db.ts` is imported only by `repository.ts` and
  `model.ts` files, by `services/` files (`session.ts`) and by `infra/**`; the ESLint zones in
  `backend/eslint.config.mjs` refuse it in routes, controllers, services and schemas of a
  module, and in `middleware/`. `infra/<engine>.ts` is imported only by `services/db.ts`
  and `infra/**`. The scripts in `infra/scripts/` may call controllers and import `model.ts`
  (index definitions), never a route, service or repository.
- **A store is a Resource.** Every store client exports a `Resource` (`infra/dependency.ts`)
  and is listed in `dependencies`. Boot connects with bounded retry (10 attempts, 5 s each),
  readiness pings (2 s), shutdown closes. The client file obeys four rules: no I/O at import
  (constructing the client must not connect; `bun run check` imports `app`, and with it every
  client, without Docker: `lazyConnect` or equivalent); `connect()` is retry-safe and
  releases what it allocated when it rejects; the driver's own connect timeout is set below
  the attempt timeout (pg `connectionTimeoutMillis`, Mongo `serverSelectionTimeoutMS`, Redis
  `connectTimeout`) and its initial-connect retry is off, so one attempt is one attempt;
  `ping()` is the cheapest round trip (`select 1`, `ping`, `PING`) with a driver-level
  timeout. Reconnecting after a drop is the driver's job (pools and drivers do it
  themselves); never re-implement it in the client file. A query that fails because the
  store is unreachable surfaces as `AppError('upstream_unavailable')` from the service.
- **Repository per module.** `api/<name>/repository.ts` holds every query for the
  module, takes and returns plain records (the `models/<name>/interface.ts` type), never
  throws a domain error and never maps to HTTP or response shapes; the service does both.
  The collection or table handle is obtained per call, never at module scope. Both files are
  private to the module: a module that needs another module's data has its controller call
  that module's controller (its public API), never its service or repository, and each such
  call is its own unit of work.
- **Cache-aside stays in the repository.** `repository.ts` may import `services/cache.ts` and
  `services/logger.ts` for exactly that (see Cache store); no other module file may.
- **Shape of every record.** A string `id` the service generates (`crypto.randomUUID()`),
  `createdAt` and `updatedAt` set by the service on every write. Responses carry timestamps
  as ISO 8601 strings; the service converts with `toISOString()`. Tenanted products store
  the owner id on every record and every query filters by it. Soft delete, when the product
  needs it, is a nullable `deletedAt` that every read filters out.
- **Indexes.** One for every field a query filters or sorts on, including the
  `(createdAt, id)` pair that cursor pagination sorts by, the owner id, and a unique index
  for every business key.
- **Changes ship with the task.** A data-model change is not done until the task ships
  what makes it real: a generated migration for SQL, an index definition for MongoDB.
  Never apply a change to a database by hand. Additive first: add the field nullable,
  backfill, then tighten; never remove a field in the same change that stops writing it.
- **Destructive operations are a human's job.** Dropping, truncating or resetting a
  database is never done by an agent; the guardrails refuse the commands. Say so in the
  plan's Rollback section.
- **Transactions**, where the engine has them, are opened by the service and passed to the
  repository functions; repositories never open one, controllers never see one, and a
  transaction never spans modules: a flow that must be atomic lives inside one module.
- **Seed data**, when needed, is `backend/src/infra/scripts/seed.ts`, idempotent (look the
  user up by email first, since `createUser` generates the id), run with `bun run src/infra/scripts/seed.ts`, never in production. The template has
  no admin bootstrap: the seed script creates the first admin through the user module's
  public API, `user.setUserRole({ id, role: 'admin' })` after `user.createUser(...)`. A
  script may call controllers; it never reaches a service or repository.

## Test database

Tests never touch the development database. The same local service hosts a second database
named `app_test`. The memory store needs no database, and `bun run check` never does:
database-backed tests run only under `bun run test:db`.

```jsonc
// backend/package.json
"test:db": "TEST_DATABASE_URL=<url of app_test> bun test"
```

```ts
// backend/tests/db/setup.ts, preloaded by bunfig.toml ([test] preload = ["./tests/db/setup.ts"])
// before any module loads, so config/env.ts can only ever see app_test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '<url of app_test>'
```

```ts
// backend/tests/db/helpers.ts: what every database-backed test uses
export const hasTestDb = process.env.TEST_DATABASE_URL !== undefined
export const describeDb = hasTestDb ? describe : describe.skip
export async function migrateTestDb(): Promise<void> {} // apply migrations or ensure indexes
export async function resetTestDb(): Promise<void> {} // empty every application table or collection
```

A test that reads or writes records through the engine lives in `tests/db/` inside
`describeDb`, calls `migrateTestDb()` in `beforeAll` and `resetTestDb()` in `beforeEach`, and
therefore runs only under `bun run test:db`. Do not fake the repository with `mock.module`:
it is process-global in `bun test` and leaks across files. Mock only an external provider at
its boundary.

## Postgres

- Compose service: `postgres:17-alpine`, user and password `app`, database `app`, a
  `pg_isready` healthcheck, and `db/init.sql` mounted into `/docker-entrypoint-initdb.d/`
  that creates `app_test` and grants it to `app`. Variable: `DATABASE_URL`, defaulting to
  `postgres://app:app@localhost:5432/app` outside production.
- Client: Bun's built-in `SQL` or the query builder or ORM named in
  `.doc/architecture.md`; `infra/postgres.ts` holds it. Migrations are files under
  `backend/migration/` (or the directory the tool requires), generated by the tool or
  written by hand, applied in order by `bun run db:migrate` (`infra/scripts/migrate.ts`)
  with a journal the tool keeps. Commands that push a schema straight to a database without
  a migration are refused by the guardrails.
- Naming: snake_case tables and columns, singular table names (`post`, `post_comment`);
  `created_at` and `updated_at` are `timestamptz`; the repository maps snake_case columns to
  the camelCase record, the service maps the record to the response.
- The model is the migration history. With plain SQL there is no `model.ts`: the repository
  holds a row mapper that returns the interface type, so the compiler checks the mapping:

  ```ts
  // api/post/repository.ts
  const toRecord = (row: PostRow): PostRecord => ({
    id: row.id,
    title: row.title,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
  ```

  With an ORM that defines tables in code (Drizzle), `api/post/model.ts` holds the table and
  proves it matches the interface by assignability:

  ```ts
  // api/post/model.ts
  export const post = pgTable('post', { /* columns */ })
  export const asRecord = (row: typeof post.$inferSelect): PostRecord => row
  ```
- The cursor index is `create index on post (created_at, id)` in the migration.
- `resetTestDb()` truncates every application table with `restart identity cascade`.
- Production: a human or the deploy pipeline runs `bun run db:migrate` against the
  production URL before the new image serves traffic; record who in
  `.doc/architecture.md`.

## MongoDB

- Compose service: `mongo:8`, no authentication locally, databases `app` and `app_test`
  (created on first write; no init script). Variable: `MONGODB_URL`, defaulting to
  `mongodb://localhost:27017/app` outside production.
- Client: the official `mongodb` driver or Mongoose, as named in `.doc/architecture.md`;
  `infra/mongodb.ts` holds it. `api/<name>/model.ts` exports the collection name, the
  document type and the index definitions (with Mongoose, the schema and the model), and
  satisfies the interface:

  ```ts
  // api/post/model.ts (driver)
  import type { PostRecord } from '../../models/post/interface'

  export const POST_COLLECTION = 'post'
  export type PostDocument = Omit<PostRecord, 'id'> & { _id: string }
  export const toRecord = ({ _id, ...rest }: PostDocument): PostRecord => ({ id: _id, ...rest })
  export const postIndexes = [{ key: { createdAt: 1, _id: 1 } }] as const
  ```

  With Mongoose, `InferSchemaType<typeof postSchema>` plus `_id` must be assignable to
  `PostRecord` in the same way (a mapper function or a `satisfies` line).
- Indexes are code. `backend/src/infra/scripts/migrate.ts` creates every module's indexes
  with `createIndexes` (idempotent, from each `model.ts`) and runs the backfill scripts in
  `backend/migration/` that have not run yet, recording each in a `migration` collection.
  `bun run db:migrate` is the deploy step, exactly as for Postgres.
- Naming: singular collection names (`post`), camelCase fields matching the response
  shapes, so the repository maps only `_id` to `id` and the service dates to strings.
- `resetTestDb()` runs `deleteMany({})` on every application collection; it never drops
  the database.
- Transactions need a replica set; the local service runs standalone, so a service that
  must make two writes atomic says so in the plan and the data-layer task enables
  `--replSet` on the compose service.

## Cache store

`services/cache.ts` is the second file seam: typed JSON helpers (`get`, `set` with a TTL,
`del`, `incr` with a TTL) over a key-value store. The template runs them on the memory
store; `middleware/rate-limit.ts` and `services/security/otp.ts` already use them, so a rate
limiter or one-time codes are served by this seam and need no plan of their own.

The cache task is its own backlog line, `- [ ] add the cache store | stack:backend`, added
only when a plan needs one: more than one instance (rate limits and OTP attempts must be
shared), a hot read path a repository fronts, a computed list that is expensive to rebuild,
idempotency keys for a write endpoint. Never in the bootstrap. It delivers:

- Engine: Redis-compatible, `redis:7-alpine` or `valkey/valkey:8-alpine` as named in
  `.doc/architecture.md` (External Dependencies). Compose service `cache`, no
  authentication locally. Variable: `REDIS_URL`, defaulting to `redis://localhost:6379/0`
  outside production and required in production, declared in `backend/src/config/env.ts`
  and `backend/.env.example`.
- Client: the `redis` package or `ioredis`, as named in `.doc/architecture.md`.
  `backend/src/infra/redis.ts` exports the client and its `Resource` (`connect` opens,
  `ping` sends `PING`, `close` quits), added to `dependencies` in `infra/dependency.ts`
  (and `memory` removed once the data layer has also replaced it).
- `services/cache.ts` rewritten over `infra/redis.ts`, keeping its exported helpers and
  their signatures so rate limits, OTP and repositories do not change. Every key is prefixed
  with the module or feature name (`post:`) and every entry has a TTL.
- `infra/pubsub.ts` gets its Redis adapter, implementing the `PubSub` type, so events reach
  every instance; `services/event.ts` and the subscribers do not change.
- Access: cache-aside is written in `repository.ts` around the queries it fronts, the one
  module file allowed to import `services/cache.ts` (and `services/logger.ts`). A cache miss
  is never an error and a cache failure degrades to the database, logged once at `warn`.

  ```ts
  // api/post/repository.ts: cache-aside around one read
  export async function findPost(id: string): Promise<PostRecord | undefined> {
    const key = `post:${id}`
    const hit = await cache.get<SerializedPost>(key).catch(() => undefined)
    if (hit !== undefined) return reviveRecord(hit)
    const record = await posts().get(id)
    if (record !== undefined) await cache.set(key, record, POST_CACHE_TTL_MS).catch(logOnce)
    return record
  }
  ```

  A write that changes the entry deletes the key in the same repository function.
- Tests: index `1` on the same service through `TEST_REDIS_URL`
  (`redis://localhost:6379/1`), set in `tests/db/setup.ts` the way `TEST_DATABASE_URL` is,
  `describeCache` in `tests/db/helpers.ts` mirroring `describeDb`, and a `resetTestCache()`
  that flushes only that index. Run under `bun run test:db`; `bun run check` never needs the
  service.
- Flushing or deleting keys on the development or production store is a human's job; the
  guardrails refuse `FLUSHALL` and `FLUSHDB` from the shell.

### What the shipped code assumes of the store

- **`incr(key, ttlMs)`** increments atomically and sets the TTL on the **first** increment
  only. A naive `INCR` plus `PEXPIRE` on every call makes the window slide, so a client that
  keeps trying is never released; a non-atomic pair can crash between the two and leave a
  key without a TTL, a permanent lockout. Use a Lua script or a transaction that sets the
  expiry only when the counter becomes 1. The memory store's `sweep()` is its expiry; an
  engine expires keys itself.
- **OTP single use** needs an atomic get-and-delete (`GETDEL`), so two concurrent
  submissions of one code cannot both succeed. Attempts are incremented before the code is
  compared, so a parallel burst cannot read the same count.

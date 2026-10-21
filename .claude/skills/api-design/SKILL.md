---
name: api-design
description: Add or change an API endpoint, its zod schemas, or the generated OpenAPI contract. Use when a plan has a Contract section, when adding a module under backend/src/api/, when choosing a path, method, status code or response shape, when a list needs pagination, when an endpoint needs the caller, or when the frontend needs new types. Covers REST conventions, the module skeleton (models, schema, route adapter, controller as the module's public API, private service and repository), validation and middleware in the route, crossing a module boundary through controllers, pagination, auth, the data-layer seam, and how the contract flows to the frontend.
---

# API Design

The rules are in `AGENTS.md`; the layer map, the import table and the engine seam are in
`backend/AGENTS.md`; this skill is the procedure.

## Conventions

- Resource paths are singular and flat: `/api/post`, `/api/post/:id`,
  `/api/post/:id/comment`. No verbs in paths; an action that is not CRUD is a sub-resource
  (`POST /api/order/:id/cancellation`).
- Methods: `GET` (read, idempotent), `POST` (create or non-idempotent action), `PATCH`
  (partial update), `PUT` (full replace, rarely), `DELETE`.
- Status: `200` read/update, `201` create (body is the created entity), `204` delete with
  no body, and the error table from the `error-handling` skill.
- JSON only. Timestamps are ISO 8601 strings in UTC (`z.iso.datetime()`); the service
  converts `Date` values with `toISOString()`. Ids are strings.
- Lists return `{ items: T[], nextCursor: string | null }` and accept `?cursor=&limit=`
  (`limit` 1–100, default 20) through `services/utils/pagination.ts`. No offset pagination.
- Validation is middleware: `validate({ body?, query?, params? })` in the route parses the
  parts the endpoint reads and `readInput(res, schemas)` returns them typed. A failure is
  always the same 400 envelope, naming the part (`invalid body`) and the fields.
- Rate limits are declared in the route, ahead of `validate`, with
  `rateLimit({ name, limit, window, key })` from `middleware/rate-limit.ts`; the numbers
  are constants in `config/constants.ts` (`RATE_LIMITS`), never literals in a route. `key`
  is `byIp`, `byBodyString('email')` or `byBodyPath('target', 'value')`; the subject is
  hashed into the store key (`rl:<name>:<sha256(subject)>`), never stored in clear.
- Every endpoint's errors are declared in its OpenAPI registration, so the frontend's
  generated types know them.

## Module skeleton

Fastest start: copy `api/module/` and `models/module/`, rename `module` → `<name>`,
`Module` → `<Name>` and `MODULE` → `<NAME>`, delete the files the module does not need. The
copy steps live here, in `README.md` and in `backend/AGENTS.md`; the copied files do not
carry them.
Order of work:

1. `models/<name>/`: the entity's types, only the files needed. `interface.ts` the stored
   record, `type.ts` the public shape and the create/update inputs, `enum.ts` closed value
   sets, `constants.ts` limits of the data. `models/` imports only `models/`.
2. `api/<name>/schema.ts`: the contract and its OpenAPI registration. A schema for a shape
   `models/` declares is written `satisfies z.ZodType<T>`; `z.infer` is only for shapes that
   exist for HTTP alone (params, query, credentials).
3. `repository.ts` over `services/db.ts` (engine specifics: `database` skill). Take the
   collection handle per call, never at module scope: a swapped or reset store must be the
   one used.
4. `service.ts`, `controller.ts`, `route.ts`.
5. One line in `config/routes.ts`, then `bun run openapi`.
6. Tests in `tests/<name>.test.ts`.

A module has the files it needs: `service.ts` only with rules of its own, `repository.ts`
only with data of its own. Direction: `route → controller → service → repository`.
`route.ts` adapts HTTP, `controller.ts` is the module's public API, `service.ts` and the data
layer are private to the module. The `post` example below, extracted to `src/models/post/*`
and `src/api/post/*`, type checks and lints against the template as shipped.

```ts
// models/post/constants.ts: limits of the data itself (policy such as rate limits is in config/)
export const POST_LIMITS = { title: { min: 1, max: 200 } } as const
```

```ts
// models/post/interface.ts: the stored record, what the repository reads and writes
export type PostRecord = {
  id: string
  title: string
  authorId: string
  createdAt: Date
  updatedAt: Date
}
```

```ts
// models/post/type.ts: the public shape and the inputs
export type PublicPost = {
  id: string
  title: string
  authorId: string
  createdAt: string
}

export type CreatePostInput = {
  title: string
}

// Optional input fields are declared `field?: T | undefined`: zod's `.optional()` admits an
// explicit undefined and the project compiles with exactOptionalPropertyTypes, so only this
// form lets `satisfies z.ZodType<T>` hold. (Not used by the example below.)
export type UpdatePostInput = { title?: string | undefined }
```

```ts
// api/post/schema.ts: the contract; the leaf of the module, imported by route, controller and service
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { POST_LIMITS } from '../../models/post/constants'
import type { CreatePostInput, PublicPost } from '../../models/post/type'
import { errorResponses, jsonBody, jsonResponse } from '../../services/utils/openapi'
import { PageQuery, pageOf } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The shape lives in models/post/type.ts; `satisfies` makes the compiler hold the schema to it.
export const Post = z
  .object({
    id: z.string(),
    title: z.string(),
    authorId: z.string(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Post') satisfies z.ZodType<PublicPost>

export const PostPage = pageOf(Post, 'Post')

export const CreatePostBody = z
  .object({ title: z.string().min(POST_LIMITS.title.min).max(POST_LIMITS.title.max) })
  .openapi('CreatePostBody') satisfies z.ZodType<CreatePostInput>

// HTTP-only shape: no models/ type to satisfy.
export const PostParams = z.object({ id: z.string().min(1) })

export function registerPost(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/post',
    tags: ['post'],
    summary: 'List posts',
    request: { query: PageQuery },
    responses: { 200: jsonResponse('A page of posts', PostPage), ...errorResponses(400) },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/post/{id}',
    tags: ['post'],
    summary: 'Read one post',
    request: { params: PostParams },
    responses: { 200: jsonResponse('The post', Post), ...errorResponses(400, 404) },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/post',
    tags: ['post'],
    summary: 'Create a post',
    request: { body: jsonBody(CreatePostBody) },
    responses: { 201: jsonResponse('Created', Post), ...errorResponses(400, 401, 429) },
  })
}
```

```ts
// api/post/repository.ts: every query for the module, private to it. Plain records in and out,
// no domain errors, no HTTP. Over the memory store the template ships; the data-layer task
// rewrites the bodies for the engine (`database` skill) and keeps the signatures.
import type { PostRecord } from '../../models/post/interface'
import { getDb } from '../../services/db'
import { type Page, decodeCursor, encodeCursor, toPage } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

const PostCursor = z.object({ createdAt: z.string(), id: z.string() })
type PostCursor = z.infer<typeof PostCursor>

const posts = () => getDb().collection<PostRecord>('post')

// The sort key of cursor pagination: (createdAt, id), ascending. The cursor carries the last
// row's pair; its contents are this file's decision, so this file decodes and encodes it.
const keyOf = (record: PostRecord) => ({ createdAt: record.createdAt.toISOString(), id: record.id })
const compare = (a: PostCursor, b: PostCursor) =>
  `${a.createdAt}|${a.id}`.localeCompare(`${b.createdAt}|${b.id}`)

export function findPost(id: string): Promise<PostRecord | undefined> {
  return posts().get(id)
}

export async function findPostPage(limit: number, cursor?: string): Promise<Page<PostRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, PostCursor)
  const rows = (await posts().find(() => true))
    .sort((a, b) => compare(keyOf(a), keyOf(b)))
    .filter((record) => after === undefined || compare(keyOf(record), after) > 0)
    // limit + 1: the extra row proves there is a next page.
    .slice(0, limit + 1)
  return toPage(rows, limit, (record) => encodeCursor(keyOf(record)))
}

export function insertPost(record: PostRecord): Promise<PostRecord> {
  return posts().put(record)
}
```

```ts
// api/post/service.ts: business rules, private to the module; throws AppError, maps records to response shapes
import type { Caller } from '../../models/auth/type'
import type { PostRecord } from '../../models/post/interface'
import type { CreatePostInput, PublicPost } from '../../models/post/type'
import { AppError } from '../../services/utils/error'
import type { Page, PageQuery } from '../../services/utils/pagination'
import { findPost, findPostPage, insertPost } from './repository'

export async function getPost(id: string): Promise<PublicPost> {
  const record = await findPost(id)
  if (record === undefined) throw new AppError('not_found', `post ${id} not found`)
  return toPost(record)
}

export async function listPost(query: PageQuery): Promise<Page<PublicPost>> {
  const page = await findPostPage(query.limit, query.cursor)
  return { items: page.items.map(toPost), nextCursor: page.nextCursor }
}

// The route already demanded a caller; the service owns what the caller may do.
export async function createPost(input: CreatePostInput, caller: Caller): Promise<PublicPost> {
  const now = new Date()
  const record = await insertPost({
    id: crypto.randomUUID(),
    title: input.title,
    authorId: caller.id,
    createdAt: now,
    updatedAt: now,
  })
  return toPost(record)
}

function toPost(record: PostRecord): PublicPost {
  return {
    id: record.id,
    title: record.title,
    authorId: record.authorId,
    createdAt: record.createdAt.toISOString(),
  }
}
```

```ts
// api/post/controller.ts: the module's public API: one typed function per operation, no HTTP.
// Other modules import this file and nothing else of the module.
import type { Caller } from '../../models/auth/type'
import type { CreatePostInput, PublicPost } from '../../models/post/type'
import type { Page, PageQuery } from '../../services/utils/pagination'
import * as service from './service'

export function getPost(id: string): Promise<PublicPost> {
  return service.getPost(id)
}

export function listPost({ query }: { query: PageQuery }): Promise<Page<PublicPost>> {
  return service.listPost(query)
}

export function createPost({
  input,
  caller,
}: {
  input: CreatePostInput
  caller: Caller
}): Promise<PublicPost> {
  return service.createPost(input, caller)
}
```

```ts
// api/post/route.ts: the HTTP adapter. Mount the endpoint's middleware, validate what it
// reads, call one controller function, send the status. Nothing else.
import { Router } from 'express'
import { RATE_LIMITS } from '../../config/constants'
import { requireAuth, requireCaller } from '../../middleware/auth'
import { byIp, rateLimit } from '../../middleware/rate-limit'
import { readInput, validate } from '../../middleware/validate'
import { PageQuery } from '../../services/utils/pagination'
import * as controller from './controller'
import { CreatePostBody, PostParams } from './schema'

export const postRoute = Router()

const listInput = { query: PageQuery }
postRoute.get('/', validate(listInput), async (_req, res) => {
  const { query } = readInput(res, listInput)
  res.json(await controller.listPost({ query }))
})

const getInput = { params: PostParams }
postRoute.get('/:id', validate(getInput), async (_req, res) => {
  const { params } = readInput(res, getInput)
  res.json(await controller.getPost(params.id))
})

const createInput = { body: CreatePostBody }
// Rate limit first (a 429 should not wait for parsing); the endpoint has its own RATE_LIMITS
// entry, so it does not share another endpoint's bucket.
postRoute.post(
  '/',
  rateLimit({ name: 'createPostPerIp', ...RATE_LIMITS.createPostPerIp, key: byIp }),
  requireAuth,
  validate(createInput),
  async (_req, res) => {
    const { body } = readInput(res, createInput)
    const post = await controller.createPost({ input: body, caller: requireCaller(res) })
    res.status(201).json(post)
  },
)
```

```ts
// config/routes.ts: only the added lines are shown (a fragment, not compiled on its own).
// The imports join the existing ones; the entry joins `modules`, in mount order.
import { postRoute } from '../api/post/route'
import { registerPost } from '../api/post/schema'

// modules: [
//   ...existing entries,
{ path: '/post', route: postRoute, register: registerPost },
// ]
```

The example's `createPostPerIp: { limit: 30, window: '15m' }` is an entry added to
`RATE_LIMITS` in `config/constants.ts`.

Then run `bun run openapi` (`openapi.json` is committed; a test fails when it is stale),
write `tests/post.test.ts` (HTTP tests through `app`; the ones that touch records inside
`describeDb` once the data layer exists, `writing-tests` skill) and run `bun run check`.

A route adapter is an async Express 5 handler: a rejection or a thrown `AppError` reaches
the error handler without `try/catch`. Validation and endpoint-level middleware (auth,
role, rate limit) are mounted in the route and nowhere else; a controller receives typed
values and never sees `req` or `res`. Logic in an adapter beyond mounting middleware,
validating, resolving the caller, calling one controller function, setting cookies and
responding is a review finding.

**Pagination.** `PageQuery` (the `?cursor=&limit=` schema), `pageOf(item, name)` (the
`{ items, nextCursor }` schema) and `Page<T>` come from `services/utils/pagination.ts`. The
repository decodes and encodes the cursor, because what the cursor holds is the data
layer's decision: `decodeCursor(cursor, schema)` (a bad cursor is `validation_failed`),
`limit + 1` rows after the cursor, and `toPage` slices and encodes the next cursor from the
last kept row. The service passes `query.cursor` and `query.limit` through and maps the
records. The cursor holds the sort key and the id; the index behind it is in the `database`
skill.

## Crossing a module boundary

A module's public API is its `controller.ts`. Another module, a job, a subscriber or a
script imports that file and nothing else of the module: never its `service.ts`,
`route.ts`, `repository.ts` or `model.ts` (ESLint refuses them). A flow that spans modules
composes controllers; an abridged illustration, not part of the compiled example:

```ts
// api/auth/controller.ts: logs in through the user module's public API. The user module
// owns the password hash and verifies it; auth never sees the hash.
export async function login({ input }: { input: Credentials }): Promise<AuthSession> {
  // Throws unauthenticated 'invalid credentials' for an unknown email or a wrong password.
  const account = await user.verifyCredentials({ input })
  // issueTokens uses services/session.ts and services/security/*
  return { user: account, tokens: await issueTokens(account) }
}
```

- Signatures: a scalar identifier is positional (`getPost(id)`); anything else is one
  object with named parts (`listPost({ query })`, `createPost({ input, caller })`), so
  adding a part never changes an operation's shape.
- Types cross everywhere, behaviour only through controllers: any module file may
  `import type` from another module's `schema.ts`; only `controller.ts` and `schema.ts` may
  import it as a value (to call or embed its zod schema). ESLint enforces both halves.
- A controller forwards the caller it received to every controller it calls
  (`user.getUser({ id, caller })`); each callee's service authorizes. A public
  operation simply takes no caller. An operation that skips the authorization a caller
  would get (a job; a webhook after its adapter verified the signature) is a separate,
  named system operation, never a fallback for a missing caller.
- Each controller call is its own unit of work. A flow that must be atomic lives inside
  one module, whose service owns the transaction.
- No cycles: `auth → user → auth` is forbidden. Lift the shared operation into one of the
  two modules or a third. Review catches it; a module importing two or more other
  controllers is a prompt to look.
- A controller propagates a callee's `AppError` unchanged and may throw its own for a
  composition rule (a `conflict` between two modules' answers). Neither a controller nor
  an adapter builds an error body: the error handler does.

## Auth and the caller

The template ships authentication (`api/auth/`, `api/user/`): register, login, logout,
refresh with rotation and reuse detection, and OTP by email and phone. A product starts from
it; `.doc/architecture.md` (Auth) states the model and `backend/AGENTS.md` (Authentication)
says where its rules live.

Declaring a protected endpoint, in `route.ts`:

- `requireAuth` ahead of the handler answers 401 without a valid access token.
  `requireRole('admin')` alone guards an admin endpoint (401 anonymous, 403 wrong role); it
  authenticates first.
- The handler calls `requireCaller(res)` and passes the caller to the controller. `Caller`
  is `models/auth/type.ts`: `{ id, role, sessionId }`.
- An optional-auth endpoint mounts `authenticate`, which never rejects and leaves no caller
  when the token is absent or invalid (the OTP endpoints are such).

```ts
// route.ts: an admin endpoint. A fragment, not compiled on its own: it assumes `requireRole`
// imported from '../../middleware/role', a `deleteInput` declared like `getInput`, and a
// `controller.deletePost`. The protected `POST /` above is the requireAuth example.
postRoute.delete('/:id', requireRole('admin'), validate(deleteInput), async (_req, res) => {
  const { params } = readInput(res, deleteInput)
  await controller.deletePost({ id: params.id, caller: requireCaller(res) })
  res.status(204).end()
})
```

- Declarative gates fail fast; the service remains the authority on the forwarded caller
  (role checks, ownership), so a cross-module call cannot bypass a route. Authorization
  failures raise `forbidden`.
- An operation without a caller is a system operation and is named so: the user module
  exports `createUser`, `verifyCredentials`, `findUserByTarget`, `getActiveUser`,
  `markVerified`, `setUserRole`. Only other modules, jobs and scripts call them; no route
  does.
- Events: `publish` from `services/event.ts` schedules the handlers and returns; they run
  detached. A test that observes a reaction awaits `drain()` from the same file after the
  action (`writing-tests` skill).
- `api/auth/` is the shipped capability module without a `service.ts`: its controller
  composes the `user` controller, `services/session.ts`, `services/security/*` and
  `services/communicate/`. Rules about user data (a blocked account) stay in the user module.
- Tokens: the access token is a JWT of 15 minutes, stateless, valid until expiry even after
  logout. The refresh token is a JWT whose hash is kept in a session record and rotated on
  every use; it slides 30 days from each use under a 90-day absolute cap. A replay of the
  previous token within 30 s is a concurrent retry and converges: it receives the same token
  the first rotation issued, so no sibling token is minted (the winning token is kept sealed
  in the session's `graceToken`, and the compare-and-set re-evaluates against the re-read
  record). Any other replay revokes every session of the user. Refresh with neither cookie nor
  body token answers 400. The bearer header wins over the cookie.
- Rate limits for the auth endpoints are `RATE_LIMITS` in `config/constants.ts`, mounted per
  endpoint with `rateLimit`. A new unauthenticated write endpoint gets its own entry.
- Every protected endpoint has a test that answers 401 without credentials and, for a role
  gate, 403 with the wrong role. In a multi-tenant product the service passes the owner
  scope into every repository call; a repository never guesses it.

## Contract flow

1. The plan's Contract table is the agreement.
2. The backend implements it, registers the module in `config/routes.ts` (the one place a
   module is mounted and registered for OpenAPI) and regenerates `openapi.json` (a test
   fails when it is stale).
3. The frontend runs `bun run api:types` and calls
   `api.GET('/api/post/{id}', { params: { path: { id } } })` from a feature loader; the
   result is typed, including the error envelope.
4. A breaking change to a response shape is a new plan, not a silent edit.

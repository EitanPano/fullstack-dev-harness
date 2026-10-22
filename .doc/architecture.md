# System Architecture

The harness fixes the shape: a Next.js frontend, an Express API on Bun, and a contract
generated from the backend's zod schemas (`AGENTS.md`, Stack and Architecture; the backend
layer map in `backend/AGENTS.md`). The database is this product's choice. This document
records what is specific to this product, and the auth model a product starts from.
Fill every `<!-- FILL: … -->` marker before the first plan that touches the section.

## Primary Components

| Component | Responsibility | Runs as |
| --- | --- | --- |
| `frontend/` | Pages, server components, server actions; calls the API on the server side | Node 24 container, port 3000 |
| `backend/` | HTTP API, validation, business rules, persistence | Bun container, port 4000 |
| Data store | System of record | <!-- FILL: the compose service and port of the engine chosen under Data Store --> |

<!-- FILL: add any other component (queue, object storage, email provider) or write "none". -->

## Data Flow

1. A browser request reaches a Next.js route in `frontend/src/app/`.
2. The page calls a feature loader in `feature/<name>/server/`, which calls the API through
   the typed client (`src/lib/api/client.ts`).
3. The module's route adapter runs the endpoint's middleware, validates the request against
   the module's zod schema and calls the controller (the module's public API), which calls
   the service and, across a module boundary, another module's controller; the service
   reads or writes through the repository and returns the schema's shape; failures leave
   as the error envelope.
4. Mutations go through server actions in the same feature directory and revalidate the
   affected route.

5. Events: a service publishes through `services/event.ts`; a subscriber in
   `infra/subscribers/` reacts and may call controllers.
6. Jobs: files in `infra/jobs/`, run by `infra/scheduler.ts`; set `JOBS_ENABLED` on one
   replica only.

<!-- FILL: describe any flow that differs from the above (webhooks, external callbacks). -->

## Data Store

The harness ships no database; the `database` skill lists the options and what the
data-layer task delivers. No task may store data while a marker remains here.

- Engine: <!-- FILL: Postgres 17 | MongoDB 8 | decide later -->
- Client library: <!-- FILL: for example Bun SQL, Drizzle, Prisma, the mongodb driver, Mongoose -->
- Local service: <!-- FILL: the docker-compose.yml service name and the URL variable, written by the data-layer task; the client and its Resource live in backend/src/infra/<engine>.ts, bound through services/db.ts -->
- Test database: `app_test` on the same service, reached only through `bun run test:db`.

## Data Model

<!-- FILL: one line per entity: name (singular), owner entity if tenanted, key fields.
     Keep it in sync with the model files or schema the data-layer task created; the code
     wins on conflict. -->

## API

- Style: REST, JSON, singular resource paths under `/api/` (`api-design` skill).
- Contract: `backend/openapi.json`, generated from the zod schemas; the frontend consumes
  `src/lib/api/schema.d.ts` generated from it.
- Versioning: <!-- FILL: none until v1 ships | /api/v1 prefix from day one -->

## Auth

- Default a product starts from (shipped, change by plan): JWT access token, 15 min,
  stateless. Refresh JWT stored hashed in a session, rotated on use, sliding 30 d with a
  90 d cap, and a replayed token revokes all the caller's sessions. A replay inside the 30 s
  grace window is a concurrent retry and converges: it receives the same token the first
  rotation issued (kept sealed as the session's `graceToken`), and no sibling token is
  minted. OTP by email or phone; an OTP login verifies its target, and a target verified for
  the first time revokes the user's other sessions. A password set before verification stays
  (password reset is the product's remedy; mandatory verification at register is a product
  decision). The access token is stateless: a blocked user or a demoted admin keeps access
  for up to 15 minutes, and a thief's access token lives until expiry after a revoke-all;
  where immediacy matters, read the status or role from the store or shorten
  `ACCESS_TOKEN_TTL`. Roles `user` and `admin`. Tokens travel in the body and in
  cookies. The access token stays valid until it expires, even after logout, and its role
  claim is trusted: the stated tradeoff of a stateless token.
- Client model: the Next.js server is the backend's client (no browser fetch), so the
  backend stays client-agnostic. CORS is off unless `CORS_ORIGINS` is set. A rate-limiter
  key is `rl:<name>:<sha256(subject)>`, so no address or target sits in the store in clear.
  A refresh with neither cookie nor body token answers 400.
- OTP: 6 digits, 10 minutes, 5 attempts, single use; attempts are counted before the code
  is compared. Purpose `login` works only for an existing active account and answers 202
  for an unknown target, with delivery detached, so the OTP endpoints do not disclose
  accounts. Purpose `verify` needs a caller and only the caller's own target. Two
  disclosures are accepted: register's 409 tells that an email exists (limited per IP), and
  `PATCH /api/user/me`'s 409 tells that a phone is verified by another account
  (authenticated callers only). A phone claim conflicts only with a verified holder.
- Where authentication is enforced: `backend/src/middleware/auth.ts` resolves the caller
  into `res.locals.caller` when a route mounts it; `requireAuth` and `requireRole` reject
  anonymous or unauthorised calls, and the route adapter's `requireCaller(res)` narrows the
  type so it can pass the caller to the controller. Role gates sit in `route.ts`; authority
  (who may touch which record) is decided in the module's `service.ts` where it has one; a
  capability module such as `auth` decides in its controller.
- The Next.js server is the API client, so the frontend auth task must forward
  `X-Forwarded-For` and the backend runs with `TRUST_PROXY` set; otherwise rate limiting
  sees one address.
- <!-- FILL: the roles and scope rule beyond `user`/`admin`, or "every signed-in user is equal" -->

## External Dependencies

None in the template. A vendor goes in `services/<vendor>.ts` and is selected by
`MAIL_PROVIDER`, `SMS_PROVIDER` or `WHATSAPP_PROVIDER`.

<!-- FILL: third-party services the product adds, the file that wraps each, and the env
     variable that configures it. Or "none". -->

## Operational Concerns

- Logs: through `backend/src/services/logger.ts` (with redaction), one line per request on stdout
  (`middleware/request-log.ts`) with `requestId`, method, path (without the query string),
  status and duration; every unexpected error with its stack under the same id. Headers,
  bodies and secrets are never logged.
- Health: `GET /api/health` is the liveness check and never depends on a store.
  `GET /api/health/ready` pings every dependency in `backend/src/infra/dependency.ts`
  (`memory`, `pubsub` and `scheduler` in the template; one ping round in flight at a
  time, the answer reused for a second) and answers 503 with the per-dependency map under
  `dependencies` when one is down. Nothing in the shipped compose file reads it; a
  `HEALTHCHECK` or a compose `healthcheck` that points at it is the data-layer task's or
  the deployment's to add.
- Startup and shutdown: `backend/src/index.ts` calls `connectAll` (bounded retry)
  before it listens (a dependency that never comes up stops the process with exit code 1);
  on `SIGTERM` or `SIGINT` it stops accepting requests, runs `disconnectAll` in reverse
  order and exits 0, or exits 1 after 10 s if draining hangs.
- Errors: the envelope and status table in the `error-handling` skill.
- Replicas: the template runs as exactly one instance until the data-layer and cache tasks
  (users, sessions, rate limits and the bus live in one process); after them `JOBS_ENABLED`
  must be true on exactly one replica.
- Deployment: one image per package from the two Dockerfiles, both running as a
  non-root user; `docker compose --profile app up --build` runs the stack locally.
  <!-- FILL: the production target (which host, how secrets are injected). -->
- Data migrations: <!-- FILL: who runs `bun run db:migrate` in production and when, once the data layer exists -->

## Change Log

Date-stamped notes for architecture changes: new routes, auth boundaries, data-model
changes, external dependencies. Newest first.

- 2026-10-21: plan 005; layered backend (config, api, models, middleware, services,
  infra); authentication, rate limiting, communication, scheduler and pub/sub ship;
  readiness body key is `dependencies`.
- 2026-10-21: plan 004; controllers are the module's public API; route adapters run
  middleware and validation; modules cross only through controllers.
- <!-- FILL: YYYY-MM-DD — initial architecture accepted -->

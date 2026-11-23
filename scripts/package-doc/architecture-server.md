# Architecture

What the product put in this package, and the auth model it starts from. Its layers, request
flow and where an addition goes are in this package's `AGENTS.md`; what is true for the whole
product is in the root `.doc/architecture.md`. Fill every `<!-- FILL: … -->` marker before the
first plan that touches the section.

## Data Store

The harness ships no database. A provider chosen at the bootstrap wires one; otherwise the
`database` skill lists the options and what the data-layer task delivers. No task may store data
while a marker remains here.

- Engine: <!-- FILL: Postgres 17 | MongoDB 8 | decide later -->
- Client library: <!-- FILL: per this package's AGENTS.md › Adding the data layer, or the provider chosen at the bootstrap -->
- Local service: <!-- FILL: the docker-compose.yml service name and the URL variable, written by the generator when a provider was chosen at the bootstrap, else by the data-layer task; the client and its Resource live under `infra/`, bound through the db service -->
- Test database: `app_test` on the same service, reached only through the package's `testDb`
  command.

## Data Model

<!-- FILL: one line per entity: name (singular), owner entity if tenanted, key fields.
     Keep it in sync with the model files or schema the data-layer task created; the code
     wins on conflict. -->

## API

- Style: REST, JSON, singular resource paths under `/api/` (`api-design` skill).
- Contract: the OpenAPI document this package's `contract` command produces from its request
  schemas; a frontend's `contract` command regenerates its client types from it; both are
  committed.
- Versioning: <!-- FILL: none until v1 ships | /api/v1 prefix from day one -->

## Auth

<!-- auth-start -->
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
  cookies; a bearer header wins over the cookie. The access token stays valid until it
  expires, even after logout, and its role claim is trusted: the stated tradeoff of a
  stateless token.
- A rate-limiter key is `rl:<name>:<sha256(subject)>`, so no address or target sits in the
  store in clear. A refresh with neither cookie nor body token answers 400.
- OTP: 6 digits, 10 minutes, 5 attempts, single use; attempts are counted before the code
  is compared. Purpose `login` works only for an existing active account and answers 202
  for an unknown target, with delivery detached, so the OTP endpoints do not disclose
  accounts. Purpose `verify` needs a caller and only the caller's own target. Two
  disclosures are accepted: register's 409 tells that an email exists (limited per IP), and
  `PATCH /api/user/me`'s 409 tells that a phone is verified by another account
  (authenticated callers only). A phone claim conflicts only with a verified holder.
- Where authentication is enforced: the route gate is declarative and fails fast. The auth
  gate resolves the caller when a route declares it, and the role gate rejects anonymous or
  unauthorised calls before any handler runs (the names are in this package's
  `AGENTS.md › Authentication`). The handler resolves the caller and passes it to the
  controller's rules, which decide authority (who may touch which record); the service
  never does.
- <!-- FILL: the roles and scope rule beyond `user`/`admin`, or "every signed-in user is equal" -->
<!-- auth-end -->
<!-- noauth: - Auth: none. The product has no accounts and every endpoint is public. -->
<!-- noauth:   Adding accounts is a planned change; a scaffold with the `auth` flag on is the -->
<!-- noauth:   reference. -->

## Change Log

One line per task that changes this package, citing its plan. The description stays in the
plan. Newest first.

None yet.

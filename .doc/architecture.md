# System Architecture

The harness fixes the shape: the packages of the stack chosen at the bootstrap (recorded in
`.fullstack/catalog.yaml`) and a contract generated from the server's request schemas
(`AGENTS.md` Stack and Architecture; each package's `AGENTS.md` for its layer map). This
document records what is true across packages. What is true for one package (its data store,
data model, API, auth, routes and change log) is in `<package>/.doc/architecture.md`.
Fill every `<!-- FILL: … -->` marker before the first plan that touches the section.

## Primary Components

| Component | Responsibility | Runs as |
| --- | --- | --- |
| `<frontend>/`, each | Pages and routes. Server-rendered (Next): its server calls the API. Single-page app (React, Angular, Vue): static files, the browser calls `/api` on its own origin | Server-rendered: the frontend's container. SPA: the server's container (`single`) or the frontend's static-server container (`split`). Ports: `.fullstack/catalog.yaml` |
| `backend/` | HTTP API, validation, business rules, persistence; serves the SPA's files in `single` | The server's container; port in `.fullstack/catalog.yaml` |
| Stack | The packages and their templates | <!-- FILL: written by the bootstrap from .fullstack/catalog.yaml: stack id; per package its directory, template and version --> |
| Data store | System of record | <!-- FILL: the compose service and port of the engine chosen in the server package's Data Store section --> |

<!-- FILL: add any other component (queue, object storage, email provider) or write "none". -->

## Data Flow

Between packages; a package's own flow is in its `AGENTS.md`.

1. A browser request reaches a route in a frontend's routing layer.
2. The page calls the frontend's data layer (`services/`), which calls the API through the
   client generated from the contract.
3. The server validates the request against the entity's request schema and answers in the
   schema's shape; failures leave as the error envelope.

- Client model: <!-- FILL: written by the bootstrap per frontend kind. Server-rendered: the
  frontend's server is the backend's client (no browser fetch). SPA: the browser calls `/api` on
  the page's own origin, no CORS, `TRUST_PROXY` is the hop count in front of the server -->

<!-- FILL: describe any flow that differs from the above (webhooks, external callbacks). -->

## External Dependencies

None in the template. A vendor goes in `services/<vendor>` and is selected by
`MAIL_PROVIDER`, `SMS_PROVIDER` or `WHATSAPP_PROVIDER`.

<!-- FILL: third-party services the product adds, the file that wraps each, and the env
     variable that configures it. Or "none". -->

## Operational Concerns

- Logs: through the server's logger (with redaction), one line per request on stdout
  (the request logger) with `requestId`, method, path (without the query string),
  status and duration; every unexpected error with its stack under the same id. Headers,
  bodies and secrets are never logged.
- Health: `GET /api/health` is the liveness check and never depends on a store.
  `GET /api/health/ready` pings every dependency in the dependency registry
  (`memory`, `pubsub` and `scheduler` in the template, plus the database resource when a
  provider was chosen at the bootstrap; one ping round in flight at a
  time, the answer reused for a second) and answers 503 with the per-dependency map under
  `dependencies` when one is down. Nothing in the shipped compose file reads it; a
  `HEALTHCHECK` or a compose `healthcheck` that points at it is the data-layer task's or
  the deployment's to add.
- Startup and shutdown: the server's entry file calls `connectAll` (bounded retry)
  before it listens (a dependency that never comes up stops the process with exit code 1);
  on `SIGTERM` or `SIGINT` it stops accepting requests, runs `disconnectAll` in reverse
  order and exits 0, or exits 1 after 10 s if draining hangs.
- Errors: the envelope and status table in the `error-handling` skill.
- Replicas: the template runs as exactly one instance until the data-layer and cache tasks
  (rate limits, the cache and the bus, and sessions when the product has accounts, live in
  one process); after them `JOBS_ENABLED` must be true on exactly one replica.
- Deployment: images run as a non-root user; `docker compose --profile app up --build`
  runs the stack locally.
  - Deploy mode: <!-- FILL: single | split. `single`: one image, the server serves the
    SPA's files; `split`: one image per package. Written by the bootstrap from
    `.fullstack/catalog.yaml` `deploy:`, or "n/a" when it has none (a stack with no frontend or
    no server). The `deployment` skill changes it; this line wins over provenance. -->
  - `TRUST_PROXY` hop count: local default <!-- FILL: written by the bootstrap: `false` in
    `single`, 1 in `split` -->; production <!-- FILL: the production value, decided with the
    host: 1 behind a PaaS edge, 2 behind a CDN and a load balancer -->
  - <!-- FILL: the production target (which host, how secrets are injected). -->
- Data migrations: <!-- FILL: who runs the server's `migrate` command in production and when, once the data layer exists; with a provider chosen at the bootstrap, answer it at the bootstrap -->

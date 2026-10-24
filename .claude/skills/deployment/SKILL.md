---
name: deployment
description: Choose or change how the project ships. Use when a plan or the user asks to move between the `single` and `split` deploy modes, to set or review `TRUST_PROXY` for a production host, to scale past one replica, to serve the frontend from a static host or CDN, or to put the app on a non-loopback host. Covers choosing a mode, both switches as file-level steps, the proxy hop count, the Compose 2.35.0 floor, the static-host change, and what scaling needs.
---

# Deployment

A project with a server and a frontend ships in one of two modes. The mode is chosen at the
bootstrap (`--deploy`) and moved later only through this skill, as a planned change.

| | `single` | `split` |
| --- | --- | --- |
| Images | one: the server's, holding the API and the SPA's `dist/` | one per package |
| Public port | the server's | the frontend's (the server's is loopback only) |
| Browser reaches the API | same origin, same process | same origin, through the frontend image's `/api` proxy |
| `TRUST_PROXY` default | `false` (the server is the edge) | `1` (the frontend's proxy counts) |
| Frontend Compose service | build-only: `target: dist`, `scale: 0`, no ports, no profile | a container: the `serve` target, ports, the `app` profile |

The files and exact lines for each mode are in each package's `AGENTS.md › Deployment`
(`frontend/AGENTS.md`, `backend/AGENTS.md`; the directories are in `.fullstack/catalog.yaml`).
This skill names the steps; it does not repeat the lines. Read both sections before editing.

## 1. Choose

- Current mode: `.doc/architecture.md › Operational Concerns › Deployment`. It wins over the
  `deploy:` line in `.fullstack/catalog.yaml`, which records only what was generated and is
  never edited.
- A server-rendered frontend (Next) is always `split`. Nothing below applies to switching it.
- A single-page app (a frontend whose `template.yaml` declares `static`) starts `single`: one
  container, one port, no CORS, no API URL in the bundle. A `.fullstack/catalog.yaml` with no
  `deploy:` line predates catalog v1.2.0 and is `split`.
  Move to `split` when the frontend needs its own scaling or release cadence, or a second
  deployable is required. Moving back is the same work in reverse.
- `single` needs Docker Compose 2.35.0 or newer. Check `docker compose version`; an older
  client fails with an error that does not name the cause. `split` has no floor.

## 2. single to split

1. Plan it (`writing-plans`); the change touches deployable files only, no source code.
2. Frontend service in the root `docker-compose.yml`: replace the build-only form (`build.target: dist`,
   `scale: 0`) with the `serve` target, the published port, the `app` profile, `depends_on`
   the server and the `API_URL` environment, as `<frontend>/AGENTS.md › Deployment` lists
   them. Take every line from there.
3. Server service in the root `docker-compose.yml`: remove `build.additional_contexts` (`spa`); set the `TRUST_PROXY` default
   to `1`; change the published port to loopback only (`127.0.0.1:<port>:<port>`).
4. Server `Dockerfile`: delete the two `STATIC_DIR` lines (`COPY --from=spa /dist ./public`
   and `ENV STATIC_DIR=/app/public`). The server's static code stays; it is inert without
   `STATIC_DIR`.
5. Check the files: `docker compose --profile app config` exits 0, the frontend service shows
   `profiles: [app]` and no `scale: 0`, and the server service shows no `spa` context.
6. Run every touched package's `check`, then `docker compose --profile app up --build --wait`.
   Smoke through the frontend's port: `/` and a deep link return the page, `/api/health`
   answers through the proxy, and `docker compose exec <frontend service> id -u` prints a
   non-zero uid (101 in the catalog's image).
   Stop with `docker compose --profile app down` (section 3 says why).
7. Run the frontend's `testE2e` with `E2E_BASE_URL` set to `http://localhost:<frontend port>`.
8. Set `TRUST_PROXY` for production (section 4). Update `.doc/architecture.md › Deployment`
   (mode `split`) and add a change-log line.

## 3. split to single

1. Plan it (`writing-plans`). Confirm Compose 2.35.0 or newer on the machine that builds and
   runs the images, in CI included.
2. Frontend service in the root `docker-compose.yml`: replace the `serve` form with the build-only form (`build.target: dist`,
   `scale: 0`, no ports, no profile). The service must stay: the server's build reads it.
3. Server service in the root `docker-compose.yml`: add `build.additional_contexts: { spa: "service:<frontend dir>" }`; set the
   `TRUST_PROXY` default to `false`; publish the port on every interface
   (`<port>:<port>`), because the server is now the public edge.
4. Server `Dockerfile`: add the two lines (`COPY --from=spa /dist ./public`, `ENV
   STATIC_DIR=/app/public`) exactly as `<server>/AGENTS.md › Deployment` spells them.
5. Check the files: `docker compose --profile app config` exits 0, the frontend service shows
   `scale: 0` and the build target `dist`, and the server service shows the `spa` context.
6. Run every touched package's `check`, then `docker compose --profile app up --build --wait`.
   Smoke on the server's port: `/` and a deep link return `index.html`, `/api/health`
   answers, `/api/nope` returns the JSON 404 envelope, and `docker compose ps -a` lists no
   frontend container.
7. Run the frontend's `testE2e` with `E2E_BASE_URL` set to `http://localhost:<server port>`.
8. Set `TRUST_PROXY` for production (section 4). Update `.doc/architecture.md › Deployment`
   (mode `single`) and add a change-log line.

Stop the stack with `docker compose --profile app down`. Without `--profile app` the
profiled services are invisible to `down` and keep running (`COMPOSE_PROFILES=app` works too).

## 4. TRUST_PROXY

The server keys rate limits on the client address it derives from `X-Forwarded-For`. The
value is the number of proxy hops in front of the server.

- Locally: `false` in `single` (the server is the edge), `1` in `split` (the frontend's
  proxy is the one hop).
- Production: count what sits in front. 1 behind a PaaS edge; 2 behind a CDN and a load
  balancer; in `split`, add the hops in front of the frontend image to the 1.
- Too high: a caller chooses its own rate-limit key through `X-Forwarded-For`. Too low: every
  caller is keyed to the nearest proxy, so one caller exhausts the limit for everyone.
- Record the production value in `.doc/architecture.md › Deployment`. The shell
  environment or the secret manager supplies it; no file in the tree does.

## 5. Production hosts

- TLS. The containers speak HTTP and `Secure` cookies assume HTTPS, so an edge terminates TLS.
  The servers and the split image send helmet's default CSP with `upgrade-insecure-requests`:
  over plain HTTP at any host other than loopback the browser upgrades the script, style and
  `/api` requests to HTTPS and the page is blank. Local checks on `localhost` hide this.
  Put TLS in front, or change the CSP by plan.
- Compression and caching belong to the edge. Hashed `assets/*` are immutable (a CDN may
  cache them for a year); `index.html` is `no-cache`.
- Host-specific manifests (Fly, Render, Railway, Cloud Run, Kubernetes) are not generated;
  add them by plan.

## 6. Scaling

More than one replica of the server needs, first:

- State out of process: the database task (users, sessions, records) and the cache task
  (rate limits, sessions, the event bus). The template runs as one instance until both exist.
- Jobs on exactly one replica: `JOBS_ENABLED` true on one and false on the rest.

In `single` the frontend scales with the server. `split` lets the static-server image scale
alone, which is its reason to exist.

## 7. A static host (CDN) for the frontend

Not generated and not a third mode (`deploy` stays `single | split`). It changes the security
model, so it is a planned change with a security review. A frontend served from another origin
than the API needs all of:

1. `CORS_ORIGINS` set to the frontend's origin so the server answers the preflights. Confirm
   the server's CORS options send credentials (`config/cors.ts` in bun-express,
   `config/cors.py` in python-fastapi; `AGENTS.md` names them) and change them if not.
2. Session cookies sent cross-site: `SameSite=None; Secure`, and a cookie `domain` both
   origins share where the browser allows.
3. A CSRF defence, because `SameSite=Lax` no longer protects: a synchroniser token, or a
   double-submit cookie with a custom header the server requires. Add a test that a
   mutation without it is refused.
4. An API base URL in the bundle, read only through `src/env.ts`. This gives up the
   "relative `/api`" rule on purpose; the typed client's `baseUrl` changes with it.

Why the default is safe without these: in `single` and `split` the browser and the API
share one origin, `SameSite=Lax` withholds the cookie from cross-site mutations, bodies are
JSON only and there is no CORS to answer a preflight. Losing any of the three breaks the
stance.

## Never

- Edit `deploy:` in `.fullstack/catalog.yaml`.
- Switch a server-rendered frontend to `single`.
- Leave the mode change without its change-log line in `.doc/architecture.md`.

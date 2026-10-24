---
name: deployment
description: Choose or change how the project ships. Use when a plan or the user asks to move between the `single` and `split` deploy modes, to set or review `TRUST_PROXY` for a production host, to scale past one replica, to serve the frontend from a static host or CDN, or to put the app on a non-loopback host. Covers choosing a mode, both switches as file-level steps, running the app profile, the proxy hop count, the Compose 2.35.0 floor, the static-host change, and what scaling needs.
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

The files and exact lines for each mode, comments and Dockerfile lines included, are in each
package's `AGENTS.md › Deployment` (`frontend/AGENTS.md`, `backend/AGENTS.md`; the
directories are in `.fullstack/catalog.yaml`). This skill names the steps; it does not repeat
the lines. Read both sections before editing.

## 1. Choose

- Current mode: `.doc/architecture.md › Operational Concerns › Deployment`. It wins over the
  `deploy:` line in `.fullstack/catalog.yaml`, which records only what was generated and is
  never edited. While the doc line still holds its FILL marker, use the provenance line. A
  `.fullstack/catalog.yaml` with no `deploy:` line predates catalog v1.2.0 and is `split`.
- A server-rendered frontend (Next) is always `split`. Nothing below applies to switching it.
- A single-page app (a frontend whose `template.yaml` declares `static`) starts `single`: one
  container, one port, no CORS, no API URL in the bundle. Move to `split` when the frontend
  needs its own scaling or release cadence, or a second deployable is required. Moving back
  is the same work in reverse.
- The Compose floor, stated here once: `single` needs Docker Compose 2.35.0 or newer. Check
  `docker compose version`; an older client fails with an error that does not name the
  cause. `split` has no floor.

## 2. single to split

1. Plan it (`writing-plans`); the change touches deployable files only, no source code.
2. Frontend service in the root `docker-compose.yml`: replace the build-only form
   (`build.target: dist`, `scale: 0`) with the `serve` target, the published port, the `app`
   profile, `depends_on` the server and the `API_URL` environment, as
   `<frontend>/AGENTS.md › Deployment` lists them. Take every line from there.
3. Server service in the root `docker-compose.yml`: remove `build.additional_contexts`
   (`spa`); set the `TRUST_PROXY` default to `1`; change the published port to loopback only
   (`127.0.0.1:<port>:<port>`); swap the per-mode comments to the `split` ones.
4. Server `Dockerfile`: delete the two `STATIC_DIR` lines marked for `single` and the comment
   above them, as `<server>/AGENTS.md › Deployment` shows them. The server's static code
   stays; it is inert without `STATIC_DIR`.
5. Check the files: `docker compose --profile app config` exits 0, the frontend service shows
   `profiles: [app]` and no `scale: 0`, and the server service shows no `spa` context, the
   `TRUST_PROXY` default `1` and the loopback port binding.
6. Run every touched package's `check`, then run the app profile (see Running the app
   profile) and smoke through the frontend's port: `/` and a deep link return the page,
   `/api/health` answers through the proxy, and `docker compose exec <frontend service> id
   -u` prints a non-zero uid (101 in the catalog's image).
7. With the stack still up, run the frontend's `testE2e` with `E2E_BASE_URL` set to
   `http://localhost:<frontend port>`.
8. Stop the stack (Running the app profile says how).
9. Set the production `TRUST_PROXY` (section 4). Record the mode and the change (see
   Recording the change).

## 3. split to single

1. Plan it (`writing-plans`). Confirm the machine that builds and runs the images, CI
   included, meets the Compose floor (section 1).
2. Frontend service in the root `docker-compose.yml`: replace the `serve` form with the
   build-only form (`build.target: dist`, `scale: 0`, no ports, no profile), and drop its
   `depends_on` and `environment`. The service must stay: the server's build reads it.
3. Server service in the root `docker-compose.yml`: add
   `build.additional_contexts: { spa: "service:<frontend dir>" }` (this needs `build:` in its
   long form, with `context:`); set the `TRUST_PROXY` default to `false`; publish the port on
   every interface (`<port>:<port>`), because the server is now the public edge; swap the
   per-mode comments to the `single` ones.
4. Server `Dockerfile`: add the two `STATIC_DIR` lines for `single` and their comment exactly
   as `<server>/AGENTS.md › Deployment` spells them.
5. Check the files: `docker compose --profile app config` exits 0, the frontend service shows
   `scale: 0` and the build target `dist`, and the server service shows the `spa` context,
   the `TRUST_PROXY` default `false` and the port on every interface.
6. Run every touched package's `check`, then run the app profile (see Running the app
   profile) and smoke on the server's port: `/` and a deep link return `index.html`,
   `/api/health` answers, `/api/nope` returns the JSON 404 envelope, and `docker compose ps
   -a` lists no frontend container.
7. With the stack still up, run the frontend's `testE2e` with `E2E_BASE_URL` set to
   `http://localhost:<server port>`.
8. Stop the stack (Running the app profile says how).
9. Set the production `TRUST_PROXY` (section 4). Record the mode and the change (see
   Recording the change).

## Running the app profile

- The server runs with `NODE_ENV`/`APP_ENV` production inside the stack and refuses to start
  without its production secrets. Before `docker compose --profile app up --build --wait`,
  export in the shell a value for every secret the server's `.env.example` lists (the
  placeholders are fine for a local proof) and, with a database, its `DATABASE_URL`. Never
  write them to a file. With a database, the `<dir>-migrate` one-shot service runs the
  migrations before the server.
- Reusing a Compose project name reuses its volumes (a database from an earlier run keeps its
  data). Pass a fresh `-p <name>` for a clean proof.
- Stop with `docker compose --profile app down` (add the same `-p`). Without `--profile app`
  the profiled services are invisible to `down` and keep running (`COMPOSE_PROFILES=app`
  works too).

## Recording the change

A role agent cannot write `.doc/`. The agent that made the switch puts two lines in its
report's `Docs:`: the new `Deploy mode` line for `.doc/architecture.md › Operational Concerns
› Deployment`, and the change-log line. The driver session applies both when the dev loop
finishes the task (`dev-loop` section 6).

## 4. TRUST_PROXY

The server keys rate limits on the client address it derives from `X-Forwarded-For`. The
value is the number of proxy hops in front of the server.

- Locally: `false` in `single` (the server is the edge), `1` in `split` (the frontend's
  proxy is the one hop).
- Production: count what sits in front. 1 behind a PaaS edge; 2 behind a CDN and a load
  balancer; in `split`, add the hops in front of the frontend image to the 1.
- Too high: a caller chooses its own rate-limit key through `X-Forwarded-For`. Too low: every
  caller is keyed to the nearest proxy, so one caller exhausts the limit for everyone.
- Record the production value in `.doc/architecture.md › Deployment` (it stays a FILL until
  decided). The shell environment or the secret manager supplies it; no file in the tree does.

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

1. `CORS_ORIGINS` set to an explicit list of the frontend's origins (never a wildcard) so the
   server answers the preflights, with credentials allowed. Confirm the server's CORS options
   do so (`config/cors.ts` in bun-express, `config/cors.py` in python-fastapi; `AGENTS.md`
   names them) and change them if not.
2. Session cookies that reach the API from the frontend's origin. Keep them host-only: set
   no cookie `domain` (no `COOKIE_DOMAIN`), because a shared parent domain also sends the
   session cookies to every sibling subdomain, and the API's own cookie is already sent on a
   credentialed request to the API. Use `SameSite=None; Secure` only when the frontend's
   site differs from the API's; for a same-site split (`app.example.com` to
   `api.example.com`) `Lax` still sends the cookie and is safer.
3. A CSRF defence, in both cases (sibling subdomains are same-site): a synchroniser token, or
   a double-submit cookie with a custom header the server requires. Add a test that a
   mutation without it is refused.
4. An API base URL in the bundle, read only through `src/env.ts`. This gives up the
   "relative `/api`" rule on purpose; the typed client's `baseUrl` changes with it, and the
   client sends `credentials: 'include'`, because fetch's same-origin default withholds
   cookies on a cross-origin request.

Why the default is safe without these: in `single` and `split` the browser and the API
share one origin, `SameSite=Lax` withholds the cookie from cross-site mutations, bodies are
JSON only and there is no CORS to answer a preflight. Losing any of the four breaks the
stance.

## Never

- Edit `deploy:` in `.fullstack/catalog.yaml`.
- Switch a server-rendered frontend to `single`.
- Leave the mode change without its `Deploy mode` and change-log lines in
  `.doc/architecture.md`.

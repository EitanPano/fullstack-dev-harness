# The data-layer task

Read this for the backlog line `add the <engine> data layer` or `add the data layer` (the plan names
the engine). The plan's `Scaffold:` is `--capability database=<engine>` (plus `--stack <id>` when
the project has no server): the scaffold brings the engine's files (the Compose service `database`,
which `verify` starts by that name; the URL variable; the connection exported as a `Resource`,
pinged by readiness and closed on shutdown; the db seam; the migration script; the test database)
and records `testDb`, `migrate` and `e2eDb` in `.fullstack/catalog.yaml`. The task adds none of them
by hand. The `database` skill's rules hold throughout. One task, planned and reviewed like any
other, delivers:

1. Every module's data-access file rewritten against the seam, and any shared file that keeps
   its own queries. Signatures stay; bodies change.
2. The product's models on it: the first migration (or the index definitions) for the plan's
   entities, and one test proving the test database is the one in use.
3. With a frontend, its e2e database chain: the scaffold brought the frontend's `server:database`
   e2e files and `e2eDb` (it creates, migrates and truncates `app_e2e`); the task's `verify` proves
   it.
   - **Engines without an e2e chain.** The catalog ships one for Postgres only (MongoDB has no
     provider): no e2e chain is wired and the plan's Risks note that e2e uses the
     development database.
4. A `.doc/architecture.md` change-log line, the Data Model section started, and the `Local service`
   line and the components table's `Data store` row written.

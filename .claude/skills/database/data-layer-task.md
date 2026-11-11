# The data-layer task

Read this for the backlog line `add the <engine> data layer` or `add the data layer`. The
`database` skill's rules hold. For an engine with a provider, `Scaffold:` is
`--capability database=<engine>` (plus `--stack <id>` and its flags without a server): it brings
the Compose service, URL variable, `Resource` connection, db seam, migration script and test
database, and records `testDb`, `migrate` and `e2eDb` in `.fullstack/catalog.yaml`. The task
delivers:

1. Every module's data-access file rewritten against the seam, and any shared file that keeps
   its own queries. Signatures stay; bodies change.
2. The product's models on it: the first migration (or the index definitions) and one test
   proving the test database is the one in use.
3. With a frontend, its e2e database chain: the scaffold brought the `server:database` e2e files
   and `e2eDb`; the task's `verify` proves it.
4. A `.doc/architecture.md` change-log line and the Data Model section started. The scaffold
   step wrote the `Data store` rows.

## An engine without a provider

For an engine the server template has no provider for (MongoDB), `Scaffold:` is `--stack <id>`
(and its flags) without a server, else `none`. The task builds by hand what a provider brings:
the Compose service named `database` (`verify` starts it by that name); the URL variable (the
package's env module and `.env.example`); the connection as a `Resource` (boot, readiness,
shutdown) and the db seam; the migration (or index definitions) and `migrate`; the test database
and `testDb`. The backend report carries `Commands: testDb=<command>; migrate=<command>`; the
driver writes them under `packages.<dir>.commands` in `.fullstack/catalog.yaml` before the next
`verify`. No e2e chain: the plan's Risks note that e2e uses the development database.

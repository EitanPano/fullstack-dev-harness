# .orchestrate/

Everything here but this README is **generated**, not source of truth. The root `.gitignore`
excludes all of it but this file.

| Path | Written by | Read by |
| --- | --- | --- |
| `<slug>/backend.md`, `<slug>/frontend.md`, `<slug>/qa.md` | the stage's agent | the dev loop, the reviewers, QA |
| `<slug>/review.md`, `<slug>/review-security.md` | the reviewer (general, security) | the dev loop, the implementers, later reviews |
| `<slug>/plan.md` | the orchestrator (the draft the driver promotes to `.plan/`) | the dev loop, the approver |
| `<slug>/ticket.md` | the orchestrator, or the driver when the tracker is `none` | the dev loop |
| `<slug>/verify.json` | `scripts/verify.mjs` (the full run; carries `tree`, `ok` and `security`) | the dev loop, the reviewers, QA |
| `<slug>/verify-partial.json` | `scripts/verify.mjs` (the last `--package` or `--no-e2e` run, one file for backend and frontend, its passing steps reused per package) | the implementers |
| `<slug>/review.diff`, `<slug>/review-fix-<n>.diff` | `scripts/verify.mjs` (the full run with a Base; the fix-round diff) | the reviewers |
| `guidance/<version>/<id>.md` | `scripts/guidance.mjs` | the frontend agent |

Every report starts with `Stage:`, `Task:` and `Verdict:` lines. `Verdict:` is
informational: the loop branches on `verify`'s exit code and the reports' findings.

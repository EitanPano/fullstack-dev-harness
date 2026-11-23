# Architecture

What the product put in this package. Its layers, request flow and where an addition goes are in
this package's `AGENTS.md`; what is true for the whole product is in the root
`.doc/architecture.md`. Fill every `<!-- FILL: … -->` marker before the first plan that touches
the section.

## Data Store

The store is the platform's; this package's `AGENTS.md › Adding the data layer` names it. No task
may store data while a marker remains here.

- Engine: <!-- FILL: the platform's store this product uses, or "none yet" -->
- Binding: <!-- FILL: the binding or variable the package reads it through, or "none yet" -->
- Test database: <!-- FILL: how the package's tests reach a store, per its AGENTS.md › Tests, or "none yet" -->

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

<!-- FILL: who may call what: "none: every endpoint is public", or the model the product adds and the roles it tells apart -->

## Change Log

One line per task that changes this package, citing its plan. The description stays in the
plan. Newest first.

None yet.

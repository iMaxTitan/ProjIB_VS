# Refactoring Proposal

## Goal

Bring the project to a unified architecture without a full rewrite:

- fix module boundaries;
- normalize database access;
- remove duplicated orchestration and excess queries;
- reduce architectural drift in `plans`, `planner`, `reports`, `kb`, `bot`;
- lock in rules so modules do not sprawl again.

## Current Assessment

The project is already functionally rich and structurally above average, but it has clear signs of rapid growth:

- business logic is split between hooks, route handlers, and domain services;
- DB access rules are only partially standardized;
- some hooks are too heavy and combine fetch, aggregation, mapping, and UI state;
- route handlers sometimes contain orchestration that should live deeper;
- documentation is partially behind the current code;
- there is risk of cross-domain coupling as the codebase continues to grow.

Estimated current quality: about `7.5/10`.

## Target Architecture

```text
UI Layer
  components/
  hooks/

Application Layer
  app/api/*
  route handlers
  bot adapters
  page orchestration

Domain Layer
  lib/ops/*
  lib/kb/*
  lib/bot/core/*

Infrastructure Layer
  lib/shared/db-*
  lib/shared/auth/*
  lib/shared/ai/*
  lib/shared/api/*
  lib/shared/config/*
```

### Mandatory rules

- `components` do not contain business logic or ad hoc DB assembly.
- `hooks` orchestrate UI state and query lifecycle, but do not own complex domain joins.
- `app/api/*` only does:
  - auth;
  - validation;
  - service call;
  - response mapping.
- business logic lives in `lib/ops/*`, `lib/kb/*`, `lib/bot/core/*`;
- `shared` knows nothing about business domains;
- domain modules do not import UI code;
- bot channel adapters do not implement domain logic.

## Main Refactoring Direction

### 1. Freeze architecture boundaries

Define and enforce:

- allowed dependency directions;
- public API for each domain module;
- DB access rules;
- ownership map by domain.

### 2. Normalize DB access

Introduce a thin data access layer:

```text
src/lib/data/
  plans/
    plans.queries.ts
    plans.commands.ts
    plans.mappers.ts
  planner/
    planner.queries.ts
    planner.commands.ts
  reports/
    reports.queries.ts
  references/
    reference-queries.ts
```

Rules:

- `queries.ts` for reads only;
- `commands.ts` for writes only;
- route handlers and hooks do not build heavy queries directly;
- domain services orchestrate through this layer instead of scattering SQL access.

### 3. Split read and write models

- reads: views, materialized views, query services;
- writes: command services and selected RPC for atomic multi-step workflows.

### 4. Slim down hooks

Hooks should become thin:

- call `queryOptions` or API client methods;
- manage cache/invalidation;
- avoid assembling complex domain models from raw tables.

Candidate for cleanup: `usePlans.ts`, then similar heavy hooks in planner/reports/reference flows.

### 5. Slim down route handlers

Each route should converge to:

```ts
parse request
validate auth
validate input
call service
map response
return
```

No heavy orchestration or repeated joins in route files.

## SQL and DB Best Practices

### Read side

Move repeated heavy aggregations into views/materialized views:

- KPI aggregates;
- summary dashboards;
- reports list data;
- planner weekly joined read models;
- cabinet stats;
- activity feed read models.

### Write side

Use command services and selected RPC where the flow:

- touches multiple tables;
- requires atomicity;
- has permission checks + business validation;
- should not be duplicated in multiple endpoints.

### Ownership

Each domain should own its DB surface:

- `plans`: annual, quarterly, monthly, related joins;
- `planner`: calendar entries, drafts, sync, templates;
- `reports`: report generation and report read models;
- `kb`: documents, chunks, search logs, indexing;
- `bot`: permissions, bindings, settings, API keys.

## Concrete Architectural Decisions Recommended

### A. Public facade per domain

Expose only supported entry points from each major module:

- `lib/ops/plans/index.ts`
- `lib/ops/planner/index.ts`
- `lib/ops/reports/index.ts`
- `lib/kb/index.ts`

Internal files should not be imported arbitrarily across the project.

### B. Internal module structure

Within each domain:

```text
queries/
commands/
services/
mappers/
types/
```

### C. Restrict cross-domain imports

Example:

- `reports` should not import private internals from `plans`;
- domains interact through public contracts only.

### D. Query key registry

Standardize TanStack Query keys and invalidation policy centrally.

### E. Mutation policy

For every mutation:

- either do precise optimistic update;
- or invalidate a clearly defined set of keys;
- never invalidate broad areas blindly.

## Priority Areas

Highest expected impact:

1. `plans`
2. `planner`
3. `reports`
4. heavy hooks and query cache policy
5. route handler cleanup
6. bot state and tool boundaries
7. KB read/write separation

## What Not To Do

- do not rewrite the whole system from scratch;
- do not introduce a heavy ORM just for fashion;
- do not move all business logic into DB;
- do not split into microservices now;
- do not do broad renames/refactors before rules are defined.

Preferred strategy: evolutionary cleanup, not a revolution.

## Expected Reduction

Approximate achievable improvements without a full rewrite:

- extra or duplicated DB requests: `25-50%`;
- duplicated logic across hooks/routes/services: `30-40%`;
- excess client-side orchestration and mapping: `20-35%`;
- architecture boundary violations: `50%+`;
- cache/invalidation chaos: `40-60%`.

## Estimated Timeline

### Minimal useful result

`1.5-2 weeks`

- architecture audit;
- dependency rules;
- DB access rules;
- first cleanup of the worst hot paths.

### Strong systemic result

`3-5 weeks`

- query/command layer for major domains;
- hook simplification;
- route slimming;
- standardized cache and mutation policy.

### High-quality stabilization

`5-7 weeks`

- additional views/materialized views/RPC where justified;
- import boundary enforcement;
- ownership rules fully applied.

## Phased Plan

### Phase 1. Architecture freeze

- update architecture docs;
- define dependency rules;
- define DB access rules;
- define ownership map.

### Phase 2. Query audit

- list all heavy and duplicated queries;
- identify hot paths;
- identify fat hooks;
- identify browser queries that should move server-side.

### Phase 3. Data access layer

Start with:

1. `plans`
2. `planner`
3. `reports`
4. `kb`

### Phase 4. Hook simplification

- reduce hook responsibility;
- centralize query options;
- normalize invalidation.

### Phase 5. Route cleanup

- remove business joins/orchestration from API routes;
- convert routes to thin transport wrappers.

### Phase 6. Enforcement

- lint/import rules;
- public API boundaries;
- dependency discipline.

## Next Recommended Step

The best immediate next step is:

1. perform a query and dependency audit;
2. identify the worst `plans/planner/reports` hot paths;
3. design the target data-access structure before changing code.

## Reference Summary

This proposal aims to turn the project into a contract-driven codebase:

- who may access DB;
- where business logic lives;
- what each module publicly exposes;
- how reads and writes are structured;
- how future growth is constrained by architecture, not by convention only.

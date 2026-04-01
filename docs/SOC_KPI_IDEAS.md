# SOC KPI and Task Classification Ideas

## Context

The system is not meant to force employees to write endless reports manually.
The project already uses task templates, and this should evolve into a stronger operational model for SOC and information security work.

The core idea is:

- task templates should describe not only routine actions;
- they should classify the nature of the work;
- this allows the system to distinguish planned operational work from unplanned reactive work;
- KPI and workload analytics should reflect that distinction.

## Main Business Observation

For SOC / information security operations, not all work is predictable.

Examples:

- monitoring events is planned operational work;
- handling incidents is unplanned reactive work;
- event investigation may also be reactive;
- customer requests can be semi-planned or unplanned;
- reporting and control procedures are usually planned.

Because of that, workload should not be modeled as one flat stream of generic tasks.

## Key Idea

Every task or task template should carry operational meaning:

- what kind of work it is;
- whether it is planned or unplanned;
- how resource-intensive it is;
- whether it belongs to baseline process execution or appeared as reactive overload.

This would allow the platform to show:

- what was inside plan;
- what exceeded plan;
- what kind of work displaced planned work;
- how much capacity was consumed by reactive events and incidents.

## Proposed Conceptual Model

### 1. Work mode

Introduce a field like:

```text
work_mode
```

Minimal classification:

- `planned`
- `unplanned`

Meaning:

- `planned` = regular process work, scheduled operational activities, standard reviews, monitoring, reporting;
- `unplanned` = incidents, reactive event analysis, urgent requests, unexpected investigations.

### 2. Work type

Introduce a field like:

```text
work_type
```

Possible values:

- `monitoring`
- `event_analysis`
- `incident_response`
- `request_processing`
- `reporting`
- `audit`
- `tuning`
- `improvement`
- `internal_admin`

Meaning:

- `monitoring` is a planned baseline activity;
- `incident_response` is reactive and unplanned;
- `event_analysis` may be reactive even if related to the same procedure as monitoring;
- this creates a meaningful operational picture instead of generic task names only.

### 3. Effort / resource model

Introduce optional template defaults:

- `default_expected_hours`
- `default_complexity`
- `default_effort_weight`

These should help compare not only raw hours, but also weighted workload.

## Why This Matters

Without this classification:

- all hours look equal;
- it is hard to understand whether overload came from planned work or reactive events;
- it is impossible to explain why planned work slipped;
- incident-driven overload is hidden inside generic execution numbers.

With this classification:

- planned and unplanned work become visible;
- reserve consumption becomes measurable;
- management can see what exactly created overload;
- process and company level analytics become much more honest.

## Example

Procedure: event monitoring

Templates may include:

1. `Моніторинг подій`
   - `work_mode = planned`
   - `work_type = monitoring`

2. `Аналіз підозрілої події`
   - `work_mode = unplanned`
   - `work_type = event_analysis`

3. `Реагування на інцидент`
   - `work_mode = unplanned`
   - `work_type = incident_response`

This allows the same process to have both baseline and reactive work visible separately.

## Management Metrics to Support Later

### Planned vs Unplanned

```text
planned_hours
unplanned_hours
planned_weight
unplanned_weight
```

### Reserve consumption

```text
reserve_consumption = unplanned_hours / reserve_capacity
```

### Work displacement

Track whether reactive work displaced planned work:

- planned workload stayed within target;
- or planned workload slipped because incident/event load grew.

### Top overload sources

Analytics should later show:

- which processes generated most unplanned load;
- which companies generated most reactive work;
- what share of total work was incident-driven;
- what planned tasks were squeezed out by reactive tasks.

## Suggested Minimal Data Fields

For task templates:

- `work_mode`
- `work_type`
- `default_expected_hours`
- `default_complexity`
- `default_effort_weight`
- `is_operational`
- `is_incident_related`

For created tasks:

- inherited `work_mode`
- inherited `work_type`
- editable `effort_weight`
- actual hours
- link to process / procedure / company

## KPI Direction

Future KPI should not be only `actual / plan`.

For SOC-like work, it should also include:

- planned vs unplanned split;
- reserve consumption by incidents;
- weighted incoming workload;
- weighted processed workload;
- overload by process and company;
- deviation from planned work due to reactive work.

## Strategic Product Direction

Task templates should become not only productivity helpers, but also semantic carriers of operational meaning.

That means:

- templates are not just convenience;
- they become the basis for trustworthy SOC workload analytics;
- they make it possible to explain why teams fall behind plan;
- they connect planning, execution, and KPI in one model.

## Future Implementation Direction

This should later affect at least:

- planning model;
- task templates;
- planner/task creation flow;
- KPI analytics;
- department and company dashboards;
- overload / reserve / coverage analytics.

# Plans V2 + Planner Target Model

## Goal

Define a future target model where:

- `Plans V2` is the primary management surface for heads/chiefs;
- `Planner` is the primary execution surface for employees;
- task templates carry operational meaning;
- KPI is derived automatically from planning, execution, and task classification;
- managers are not overloaded with manual monthly planning;
- employees are not forced into long text reporting.

## Core Principle

The system should separate:

- management view of workload and coverage;
- execution view of actual work;
- semantic classification of work.

Target separation:

```text
Plans V2
  management model
  planned / baseline / reserve

Planner
  execution model
  actual work by slot and template

Task Templates
  semantic bridge
  define what kind of work was done

KPI
  derived from planned + actual + capacity + unplanned split
```

## Product Roles

### Heads / Chiefs

Primary workspace:

- `Plans V2`

This module should answer:

- what must be covered;
- what is planned;
- what went beyond plan;
- which process is overloaded;
- which company generates reactive pressure;
- which employees are overloaded;
- how much reserve was consumed.

### Employees

Primary workspace:

- `Planner`

This module should answer:

- what I am doing right now;
- what template I executed;
- how many hours it took;
- whether it was planned or unplanned work;
- what company/project it belonged to.

Employees should not be required to write large reports by default.

## Target Data Model

### Quarterly Plans

`quarterly_plans` remains the top-level process planning entity.

Recommended role:

- process-level quarterly frame;
- not detailed manual microplanning.

Recommended fields:

- `process_id`
- `year`
- `quarter`
- `goal`
- `expected_result`
- `status`
- `target_capacity_hours`
- `planned_baseline_hours`
- `reserve_hours`

Meaning:

- `target_capacity_hours` = intended available capacity for the process in the quarter;
- `planned_baseline_hours` = expected regular workload;
- `reserve_hours` = reserved capacity for reactive/unplanned work.

### Monthly Plans

`monthly_plans` should become a lightweight procedure-level workload envelope.

Recommended role:

- baseline expected load for a procedure in a month;
- assignee and company/project binding;
- not the main place for manual task decomposition.

Recommended fields:

- `procedure_id`
- `quarterly_id`
- `year`
- `month`
- `planned_hours`
- `reserve_hours`
- `status`
- `distribution_type`
- assignees
- linked companies
- linked projects
- linked KB documents

### Procedure Task Templates

This table should evolve from text presets into semantic work objects.

Recommended fields:

- `id`
- `procedure_id`
- `title`
- `content`
- `work_mode` = `planned | unplanned`
- `work_type` = `monitoring | event_analysis | incident_response | request | reporting | audit | improvement | internal_admin`
- `default_expected_hours`
- `default_effort_weight`
- `requires_comment`
- `is_active`

Meaning:

- `work_mode` distinguishes baseline process work from reactive work;
- `work_type` gives operational meaning for analytics;
- `default_expected_hours` and `default_effort_weight` support workload analytics.

### Daily Tasks

`daily_tasks` should store semantic task attributes directly, not rely on template text later.

Recommended additional fields:

- `template_id`
- `work_mode`
- `work_type`
- `effort_weight`
- `expected_hours`
- `is_exception`
- `deviation_reason`

This allows analytics to work on stable structured fields.

## Target UX Model

### Plans V2

`Plans V2` should become the single management control tower.

Managers should not manually compose large numbers of detailed plans from scratch.

They should:

- review process and procedure load;
- confirm baseline;
- adjust reserve;
- review overload;
- inspect planned vs unplanned split;
- inspect company/process/employee pressure.

### Quarterly Level

Per process, show:

- `capacity`
- `baseline planned`
- `reserve`
- `actual planned work`
- `actual unplanned work`
- `coverage`
- `gap`

### Monthly Level

Per procedure, show:

- `planned baseline hours`
- `actual planned hours`
- `actual unplanned hours`
- `planned/unplanned ratio`
- `company-driven load`
- `employee load`
- `reserve overflow`

### Procedure Detail

Should show:

- baseline work by template type;
- unplanned work by template type;
- incident share;
- event analysis share;
- what exceeded reserve;
- which companies generated reactive load.

### Planner

`Planner` should be the only primary execution surface for employees.

Default flow:

1. select slot;
2. select template;
3. system auto-fills:
   - title
   - work mode
   - work type
   - expected hours
4. employee enters actual hours;
5. optionally selects company/project/document;
6. adds short comment only if needed.

Default principle:

- no large report by default;
- comment is optional for regular planned work;
- comment can be required for incidents, investigations, or deviations.

## KPI Direction

KPI should be built on top of `Plans V2 + Planner + Template semantics`.

It should not be a single raw `actual / plan` metric.

### Recommended management metrics

- `Capacity Coverage = Capacity / Required Load`
- `Plan Coverage = Actual Planned Work / Planned Baseline`
- `Reserve Consumption = Unplanned Work / Reserve`
- `Utilization = Actual Total Work / Capacity`
- `Overload Gap = Required Load - Capacity`

### Process-level analytics

- baseline planned;
- actual planned;
- actual unplanned;
- reserve used;
- overload flag.

### Procedure-level analytics

- monitoring hours;
- event analysis hours;
- incident response hours;
- request hours;
- reporting hours.

### Employee-level analytics

Keep simpler:

- actual hours;
- planned hours;
- share of planned work;
- share of unplanned work;
- template mix.

## Architectural Intent

### Plans V2 answers:

- what should be covered;
- what is overloaded;
- what came outside plan;
- who is overloaded;
- which process/company creates pressure.

### Planner answers:

- what exactly was done;
- when;
- under which template;
- whether it was planned or unplanned;
- how many hours it consumed.

### Templates answer:

- what kind of work this task represents operationally.

## Implementation Phases

### Phase 1. Semantic templates

Without breaking existing UX:

- extend `procedure_task_templates`;
- extend `daily_tasks`;
- save semantic fields on task creation from template.

### Phase 2. Planner-first execution

Update `Planner` so that:

- template-based execution becomes the default path;
- manual description becomes secondary;
- comments are only required where justified.

### Phase 3. Plans V2 analytics expansion

Add:

- planned vs unplanned split;
- reserve / capacity / gap blocks;
- process / procedure / company overload analytics.

### Phase 4. KPI redesign

Build a new KPI layer on top of:

- `quarterly_plans`
- `monthly_plans`
- `daily_tasks`
- semantic template fields

The old KPI can coexist during migration.

## Expected Result

### For managers

- less manual planning overhead;
- better visibility into overload and reactive work;
- clearer process/procedure/company control;
- honest view of what displaced planned work.

### For employees

- less reporting burden;
- more click-based execution through templates;
- less repeated text entry;
- more accurate tracking of actual work semantics.

### For the system

- automatic classification of planned/unplanned work;
- support for SOC-style analytics;
- better future KPI;
- stronger connection between planning and real execution.

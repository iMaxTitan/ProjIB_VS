# KPI Model — концептуальная модель

> **Статус:** концепция v2, после ревизии БД и уточнения логики capacity.
> **Дата последнего обновления:** 2026-04-07

---

## 1. Назначение

KPI в CS Platform — инструмент для:

1. **Отчёт руководству** ежеквартально (что сделано, что нет, почему)
2. **Диагностика причин невыполнения** — отличить «не хватает ресурсов» от «не справляется с обязанностями» от «перекоса инициатив»
3. **Видимость перекоса от инициатив** — когда внеплановая change-работа ломает routine на уровне процедуры

KPI **не считает премию и её размер** — это решение руководителя вне системы. Система даёт цифры и диагноз.

---

## 2. Базовые принципы

1. **Период KPI = квартал.** Месячные планы — операционка, KPI агрегируется поквартально.
2. **Уровни агрегации:** процедура / процесс / сотрудник.
3. **Компании в KPI не входят** — это отдельная ось ежемесячной отчётности.
4. **Сотрудник вводит ТОЛЬКО часы и дату задачи.** Никакой ручной классификации.
5. **Единственное manual gate** в pipeline факта — `head` принимает/отклоняет задачу. Только принятые попадают в actual.
6. **Все классификации задач — авто** (выводятся из родительских сущностей и дат, не из ввода пользователя).
7. **Plan-часы НЕ вводятся вручную.** Они вычисляются снизу вверх из capacity сотрудников и их штатных закреплений за процедурами/инициативами.
8. **Штатное закрепление за процедурами** — head задаёт один раз при изменении штата/должности (не каждый квартал).
9. **На старте** — равномерное распределение capacity по закреплённым процедурам. Со временем — возможна индивидуальная подстройка `share` (хранится в БД).

---

## 3. Структура работы и capacity

```
Процесс
├── Процедуры (routine baseline)
│   └── Шаблоны задач → задачи
└── Инициативы (change)
    ├── Плановые      — добавлены до старта квартала
    └── Внеплановые   — добавлены в течение квартала
```

### Логика capacity

```
employee_capacity_q  = норма_часов_квартала × work_rate − absences

employee_share_proc  = доля сотрудника в процедуре (по умолчанию 1/N, где N = число процедур у него)

procedure_expected_q = Σ (employee_capacity × share_proc) по всем сотрудникам, закреплённым за процедурой

initiative_expected_q = часы, выделенные head на инициативу при её назначении сотруднику
                        (через monthly_plan_assignees к плану с initiative_id)

process_expected_q   = Σ procedure_expected_q + Σ initiative_expected_q  (для планов внутри процесса)
```

**Ключевая особенность:** инициатива и процедура **внутри одного процесса делят общий капасити**.

- Если инициатива сожрала часы у процедуры → **процедура «просядет» (Procedure Coverage упадёт)**
- При этом **процесс в целом не просядет** (часы остались внутри процесса) → Process Load Factor останется в норме
- Это и есть **видимость перекоса**: на уровне процесса всё ок, на уровне процедуры — провал

### Классификация задачи (вычисляется автоматически)

| task_class | Условие |
|---|---|
| `routine` | Задача через план с `procedure_id IS NOT NULL` |
| `initiative_planned` | Задача через план с `initiative_id IS NOT NULL`, инициатива создана **до** старта квартала |
| `initiative_unplanned` | Задача через план с `initiative_id IS NOT NULL`, инициатива создана **в течение** квартала |
| `ad_hoc` | Задача без `monthly_plan_id` (редкий случай — почти не используется) |

Сотрудник классификацию не видит. Head не классифицирует руками. Всё выводится из связей и дат через `plan_initiatives.created_at`.

---

## 4. Метрики

### Уровень процедуры

| # | Метрика | Формула | Зона нормы |
|---|---|---|---|
| 1 | **Procedure Coverage** | procedure_actual / procedure_expected | 90–110% |
| 2 | **Procedure Load** | procedure_actual / procedure_expected | то же — на этом уровне совпадает с Coverage |

Процедура — диагностический уровень для перекосов. Здесь видно, что routine просел.

### Уровень процесса

| # | Метрика | Формула | Зона нормы |
|---|---|---|---|
| 1 | **Routine Coverage** | Σ procedure_actual / Σ procedure_expected | 90–110% |
| 2 | **Initiative Coverage** | initiative_planned_actual / initiative_planned_expected | 90–110% |
| 3 | **Unplanned Pressure** | initiative_unplanned_actual / process_capacity | < 15% |
| 4 | **Process Load** | total_actual / process_capacity | 80–100% |

`process_capacity` = Σ employee_capacity всех сотрудников, чьи процедуры/инициативы попадают в этот процесс (с учётом долей).

### Уровень сотрудника

| # | Метрика | Формула |
|---|---|---|
| 1 | **Personal Routine Coverage** | accepted_routine_hours / personal_routine_expected |
| 2 | **Personal Load** | accepted_total_hours / personal_capacity |

`personal_routine_expected` = Σ (capacity × share_proc) по всем закреплённым процедурам сотрудника.

---

## 5. Матрица диагностики

Главный артефакт модели. Применяется на уровне **процедуры** и на уровне **сотрудника**.

| # | Coverage | Unplanned Pressure | Load | Диагноз | Что делать |
|---|---|---|---|---|---|
| 1 | ≥90% | low | 80–100% | ✅ **Норма** | — |
| 2 | ≥90% | high | >100% | 🟠 **Геройство** — справились ценой перегруза | Не злоупотреблять, обозначить риск |
| 3 | ≥90% | low | <80% | 🟡 **Закрепление завышено** — capacity больше, чем реально нужно процедуре | Снизить share / перераспределить на другие процедуры |
| 4 | <90% | low | >100% | 🔴 **Не хватает штата** — procedure expected больше, чем сотрудник может физически закрыть | +штат / снизить ожидание / убрать процедуру |
| 5 | <90% | low | 80–100% | 🟠 **Квалификация / распределение** — capacity была, но routine не закрыт | Обучение / разбор / пересмотр share между процедурами |
| 6 | <90% | low | <80% | 🔴 **Не загружен И не делает** | Дисциплинарный разбор |
| 7 | <90% | **high** | **>100%** | 🔴 **Перекос инициатив** — внеплановые съели routine | Защитить routine, governance над приёмом инициатив в квартал |
| 8 | <90% | high | 80–100% | 🟠 **Приоритизация инициатив** — инициативы вытеснили routine, но capacity хватало | Решить приоритеты явно |

**Ключевые строки для твоего вопроса «не хватает ресурсов или не справляется»:**
- **№4 = ресурсы** (физически не вмещается)
- **№5 = квалификация** (capacity была, но не использовал)
- **№7 = перекос инициатив** (внешний фактор перетянул)

---

## 6. Адаптивная подстройка `share`

На старте: `share = 1/N` для всех процедур сотрудника.

Через 1-2 квартала система видит фактическое распределение:
- Иванов закрывает 60% часов в Мониторинге, 30% в Доступах, 10% в Бэкапе
- Базовое распределение — 1/3 везде
- Система показывает head: «Фактическое распределение Иванова: 60/30/10. Обновить share?»
- **Решение принимает head, не автоматом** (защита от self-referential ловушки)

Это отдельная фича `share recommendation engine`, которая включится после накопления данных. В первой версии — только равномерное распределение.

---

## 7. Правила формирования факта

1. **В actual попадают только принятые задачи** (`daily_tasks.task_type = 'completed'` после head accept).
2. **Якорь квартала = `daily_tasks.task_date`**, не `completed_at`. Поздняя приёмка не сдвигает факт между кварталами.
3. **`task_type='incomplete'`** = промежуточный статус (запланирована, не завершена). НЕ идёт в actual.
4. **`source` поле** (manual/calendar/template/head/chief) = информационный признак «откуда пришла задача», для классификации routine/initiative НЕ используется.
5. **Internal-часы** (совещания из Outlook через `source='calendar'`, дополнительные задачи от шефа через `source='chief'`) учитываются в Load Factor сотрудника, но не в Procedure Coverage если не привязаны к процедуре.
6. **Cold start** для процесса/сотрудника без истории — модель работает с первого квартала, исторический baseline не нужен.

---

## 8. Что НЕ входит в KPI

Сознательно исключено:

- ❌ Премиальная формула и расчёт размера премии (это вне системы)
- ❌ Outcome-метрики (rework, lead time, quality flags)
- ❌ Anti-gaming guardrails (cap'ы, штрафы)
- ❌ Headcount Gap, Required FTE — может появиться отдельной аналитикой потом
- ❌ Композитный сводный балл 0–100
- ❌ Ручная классификация задач, ручные allocation, ручные нормативные коридоры
- ❌ Ручной ввод plan_hours для процедур и инициатив (всё вычисляется из capacity)

---

## 9. Открытые вопросы (для имплементации)

1. **`task_type='completed'` = принято head** — подтверждено. ✅
2. **`task_type='incomplete'` = промежуточный статус, НЕ в actual** — подтверждено. ✅
3. **Plan vs unplanned initiative** через `plan_initiatives.created_at` vs `quarter_start` — выбран этот путь. ✅
4. **Allocation сотрудника по процедурам** — через новую таблицу `employee_procedure_assignments` (см. §11). ✅
5. **Capacity сотрудника** = `monthly_working_days.work_hours × work_rate − planned_absences`. ✅
6. **Adaptive share recommendation** — отложено до накопления данных, в первой версии равномерное распределение.

---

## 10. Что дальше

1. ✅ Ревизия БД через postgres MCP — выполнена
2. **Доработать §11** — точные SQL views и формулы (следующий шаг)
3. **Migration** — добавить таблицу `employee_procedure_assignments`, написать views
4. **UI** — макеты дашборда KPI с матрицей диагностики
5. **Удалить устаревшее** в коде после имплементации (`lib/ops/kpi/service.ts` сейчас считает по старой формуле `actual/planned`)

---

## 11. Реализация в БД

### 11.1. Что уже есть (использовать как есть)

| Таблица / поле | Назначение в KPI |
|---|---|
| `monthly_plans.procedure_id` | Признак routine-плана |
| `monthly_plans.initiative_id` | Признак initiative-плана |
| `quarterly_plans.process_id` | Привязка плана к процессу через quarterly |
| `procedures.process_id` | Привязка процедуры к процессу |
| `daily_tasks.task_type` | `'completed'` = accepted, всё остальное в actual не идёт |
| `daily_tasks.task_date` | Якорь квартала |
| `daily_tasks.spent_hours` | Источник actual |
| `daily_tasks.monthly_plan_id` | Связь с планом → процедура/инициатива |
| `monthly_plan_assignees` | Кто работает на этом плане (для personal KPI и для инициатив) |
| `plan_initiatives.created_at` | Различение plan vs unplanned initiative |
| `monthly_working_days.work_hours` | Норма часов месяца |
| `user_profiles.work_rate` | Ставка сотрудника |
| `planned_absences` | Отпуска/больничные для capacity (status='approved') |

### 11.2. Что нужно добавить

**Новая таблица: `employee_procedure_assignments`**

```sql
CREATE TABLE employee_procedure_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  procedure_id  uuid NOT NULL REFERENCES procedures(procedure_id) ON DELETE CASCADE,
  share         numeric(5,4) NULL,  -- NULL = равная доля 1/N, явное значение = индивидуальная подстройка
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  assigned_by   uuid REFERENCES user_profiles(user_id),
  UNIQUE (user_id, procedure_id)
);

CREATE INDEX ON employee_procedure_assignments (user_id);
CREATE INDEX ON employee_procedure_assignments (procedure_id);
```

**Что НЕ добавляем:**
- ❌ Поля для классификации в `daily_tasks` (всё выводится через JOIN)
- ❌ Отдельную таблицу `employee_initiative_assignments` — инициативы используют существующий `monthly_plan_assignees` через план с `initiative_id`
- ❌ snapshot/baseline таблицы — в первой версии не нужны
- ❌ acceptance log / quality flags — отложено

### 11.3. Views для расчёта

> Конкретный SQL views будет написан после согласования модели.
> Список нужных views и их назначение:

| View | Назначение |
|---|---|
| `v_kpi_employee_capacity_q` | capacity сотрудника по кварталу: норма × work_rate − absences |
| `v_kpi_procedure_share` | доля сотрудника в процедуре: COALESCE(share, 1/N) где N = число процедур у сотрудника |
| `v_kpi_procedure_expected_q` | ожидаемые часы процедуры: Σ employee_capacity × share |
| `v_kpi_initiative_expected_q` | ожидаемые часы инициативы: часы из monthly_plans с этим initiative_id, с учётом assignees |
| `v_kpi_actual_q` | принятые часы (task_type='completed') агрегированные по процедуре/инициативе/процессу/сотруднику с разбивкой routine/initiative_planned/initiative_unplanned |
| `v_kpi_procedure_metrics_q` | финальная метрика процедуры (Coverage, Load) |
| `v_kpi_process_metrics_q` | финальная метрика процесса (4 метрики + диагноз) |
| `v_kpi_employee_metrics_q` | финальная метрика сотрудника (Personal Coverage + Personal Load + диагноз) |

### 11.4. Migration plan

**Phase 1. Foundation**
- Создать таблицу `employee_procedure_assignments`
- Заполнить её первоначальными закреплениями (head делает руками или импорт из текущих monthly_plan_assignees + procedure_id)
- Создать views capacity / share / expected

**Phase 2. Metrics**
- Создать views actual / procedure_metrics / process_metrics / employee_metrics
- Добавить новый API endpoint `/api/kpi/v2` параллельно со старым
- Сравнить старый и новый KPI на исторических данных

**Phase 3. UI**
- Дашборд KPI с матрицей диагностики
- Уровни drill-down: процесс → процедура → сотрудник
- Подсветка диагноза цветом по матрице

**Phase 4. Cleanup**
- Заменить старый `/api/kpi` на v2
- Удалить старую формулу `actual/planned` из `lib/ops/kpi/service.ts`
- Обновить bot-adapter, если использует KPI
- Удалить старые пороги ≥130%/≥100%/≥70% из всех мест

**Phase 5. Adaptive (отложено)**
- Share recommendation engine
- UI для подтверждения/правки share через head

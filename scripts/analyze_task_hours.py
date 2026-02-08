#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Анализ группировки недельных планов.

Логика:
1. Группировка: неделя + main_task
2. Сотрудники: уникальные, план часов = MAX по сотруднику
3. Компании: уникальные
4. Итого план = СУММА(MAX plan_hours каждого сотрудника)
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
from datetime import datetime
from collections import defaultdict

wb = openpyxl.load_workbook('c:/Proj/ProjIB_VS/bdib2025.xlsx', read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(min_row=2, values_only=True))

# Группировка: (week, main_task) -> данные
weekly_plans = defaultdict(lambda: {
    'employees': {},      # employee -> max(plan_hours)
    'companies': set(),
    'tasks': [],          # все записи для weekly_tasks
    'process': None,
    'department': None,
})

for row in rows:
    main_task = str(row[1]).strip() if row[1] else None
    dept = str(row[2]).strip() if row[2] else None
    employee = str(row[3]).strip() if row[3] else None
    plan_hours = float(row[4]) if row[4] else 0
    plan_date = row[5]
    task_name = str(row[6]).strip() if row[6] else None
    fact_date = row[7]
    company = str(row[10]).strip() if row[10] else None
    fact_hours = float(row[11]) if row[11] else 0
    process = str(row[0]).strip() if row[0] else None

    if not main_task or not isinstance(plan_date, datetime):
        continue

    week = plan_date.isocalendar()[1]
    key = (week, main_task)

    # Сотрудник: берём MAX plan_hours
    if employee:
        current_max = weekly_plans[key]['employees'].get(employee, 0)
        weekly_plans[key]['employees'][employee] = max(current_max, plan_hours)

    # Компания
    if company:
        weekly_plans[key]['companies'].add(company)

    # Процесс и отдел (берём первый)
    if not weekly_plans[key]['process']:
        weekly_plans[key]['process'] = process
    if not weekly_plans[key]['department']:
        weekly_plans[key]['department'] = dept

    # Задача для weekly_tasks
    weekly_plans[key]['tasks'].append({
        'task_name': task_name,
        'company': company,
        'employee': employee,
        'fact_hours': fact_hours,
        'fact_date': fact_date.strftime('%Y-%m-%d') if isinstance(fact_date, datetime) else None,
    })

wb.close()

print(f'ВСЕГО НЕДЕЛЬНЫХ ПЛАНОВ: {len(weekly_plans)}')
print('='*70)

# Показываем примеры
examples = [
    (1, 'Моніторинг подій ІБ'),
    (1, 'SIEM. Збір та кореляція подій'),
    (1, 'Плановий перегляд нормативної документації в сфері ІБ'),
]

for week, mt in examples:
    key = (week, mt)
    if key not in weekly_plans:
        continue

    data = weekly_plans[key]
    total_plan = sum(data['employees'].values())
    total_fact = sum(t['fact_hours'] for t in data['tasks'])

    print(f'\nНеделя {week}: {mt[:50]}')
    print('-'*70)
    print(f'Отдел: {data["department"]} | Процесс: {data["process"][:40]}...')
    print(f'Сотрудники ({len(data["employees"])}):')
    for emp, hours in data['employees'].items():
        print(f'  {emp}: MAX {hours:.0f}ч')
    print(f'Компании: {len(data["companies"])}')
    print(f'Записей (tasks): {len(data["tasks"])}')
    print(f'ИТОГО: план {total_plan:.0f}ч, факт {total_fact:.1f}ч')

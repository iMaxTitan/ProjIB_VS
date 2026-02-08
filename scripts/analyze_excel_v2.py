#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Анализ структуры данных Excel для оптимизации импорта v2"""

import openpyxl
import os
import sys
from collections import defaultdict
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Колонки
COL_PROCESS = 0      # Процесс
COL_MAIN_TASK = 1    # Основна задача
COL_DEPT = 2         # Відділ (ОКБ/СМУР)
COL_RESOURCE = 3     # Сотрудник
COL_PLAN_HOURS = 4   # План ч/г
COL_PLAN_DATE = 5    # Планова дата
COL_TASK = 6         # Задача
COL_FACT_DATE = 7    # Дата виконання
COL_DOC = 8          # Документ
COL_NOTE = 9         # Примітка
COL_COMPANY = 10     # предприятие
COL_FACT_HOURS = 11  # ФактК
COL_WEEK = 12        # Неделя


def get_quarter(date):
    if date is None:
        return None
    if isinstance(date, datetime):
        return (date.month - 1) // 3 + 1
    return None


def get_week(date):
    if date is None:
        return None
    if isinstance(date, datetime):
        return date.isocalendar()[1]
    return None


EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'bdib2025.xlsx')
print(f'Loading: {EXCEL_PATH}', flush=True)
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

ws = wb.active
rows = list(ws.iter_rows(min_row=2, values_only=True))
print(f'Total rows: {len(rows)}', flush=True)

# По отделам
depts = defaultdict(list)
for row in rows:
    dept = row[COL_DEPT]
    if dept:
        depts[str(dept).strip()].append(row)

print(f'\nОтделы:')
for d, r in sorted(depts.items(), key=lambda x: -len(x[1])):
    print(f'  {d}: {len(r)} строк')

# Анализируем каждый отдел
for dept_name, dept_rows in depts.items():
    print(f'\n{"="*60}')
    print(f'{dept_name} ({len(dept_rows)} строк)')
    print('='*60)

    processes = defaultdict(int)
    main_tasks = defaultdict(int)
    resources = defaultdict(int)

    # Группировки
    by_process_week = defaultdict(int)
    by_process_week_task = defaultdict(int)
    by_resource_week = defaultdict(int)
    by_week = defaultdict(int)

    for row in dept_rows:
        process = str(row[COL_PROCESS]).strip() if row[COL_PROCESS] else None
        main_task = str(row[COL_MAIN_TASK]).strip() if row[COL_MAIN_TASK] else None
        resource = str(row[COL_RESOURCE]).strip() if row[COL_RESOURCE] else None
        plan_date = row[COL_PLAN_DATE]

        if process: processes[process] += 1
        if main_task: main_tasks[main_task[:80]] += 1
        if resource: resources[resource] += 1

        week = get_week(plan_date)
        quarter = get_quarter(plan_date)

        if week:
            by_week[week] += 1
        if process and week:
            by_process_week[(process, week)] += 1
        if process and week and main_task:
            by_process_week_task[(process, week, main_task[:80])] += 1
        if resource and week:
            by_resource_week[(resource, week)] += 1

    print(f'\nПроцессов: {len(processes)}')
    for p, c in sorted(processes.items(), key=lambda x: -x[1])[:5]:
        print(f'  {p[:55]}: {c}')

    print(f'\nСотрудников: {len(resources)}')
    for r, c in sorted(resources.items(), key=lambda x: -x[1])[:10]:
        print(f'  {r}: {c}')

    print(f'\nУникальных "Основна задача": {len(main_tasks)}')
    for t, c in sorted(main_tasks.items(), key=lambda x: -x[1])[:5]:
        print(f'  [{c:4d}] {t[:65]}')

    print(f'\n--- ВАРИАНТЫ ГРУППИРОВКИ НЕДЕЛЬНЫХ ПЛАНОВ ---')
    print(f'Вариант 1: Процесс + Неделя = {len(by_process_week)} планов')
    print(f'  (в среднем {len(dept_rows) // len(by_process_week) if by_process_week else 0} задач на план)')

    print(f'Вариант 2: Процесс + Неделя + Задача = {len(by_process_week_task)} планов')
    print(f'  (в среднем {len(dept_rows) // len(by_process_week_task) if by_process_week_task else 0} задач на план)')

    print(f'Вариант 3: Сотрудник + Неделя = {len(by_resource_week)} планов')
    print(f'  (в среднем {len(dept_rows) // len(by_resource_week) if by_resource_week else 0} задач на план)')

    print(f'Вариант 4: Просто Неделя = {len(by_week)} планов')
    print(f'  (в среднем {len(dept_rows) // len(by_week) if by_week else 0} задач на план)')

wb.close()
print('\n=== РЕКОМЕНДАЦИЯ ===')
print('Вариант 1 (Процесс + Неделя) - оптимальный баланс')
print('Меньше планов чем Вариант 2, больше детализации чем Вариант 4')

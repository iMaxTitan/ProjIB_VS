#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Экспорт недельных планов и задач из Excel в JSON для импорта в Supabase.

Логика группировки:
1. weekly_plan = (week + main_task)
2. planned_hours = СУММА(MAX plan_hours каждого сотрудника)
3. weekly_task.description = "task_name - company"
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
import json
import os
import uuid
from datetime import datetime, timedelta
from collections import defaultdict

# Импортируем маппинги
from analyze_mapping import (
    DEPARTMENTS, EMPLOYEES, PROCESSES_DB, PROCESS_MAPPING, PROCESS_FIXES,
    COMPANIES_DB, COMPANY_MAPPING,
    get_process_id, get_company_id,
)

SCRIPT_DIR = os.path.dirname(__file__)
EXCEL_PATH = os.path.join(SCRIPT_DIR, '..', 'bdib2025.xlsx')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')


def get_week_monday(plan_date):
    """Получить дату понедельника недели"""
    if isinstance(plan_date, datetime):
        monday = plan_date - timedelta(days=plan_date.weekday())
        return monday.strftime('%Y-%m-%d')
    return None


def get_quarter(plan_date):
    """Получить квартал из даты"""
    if isinstance(plan_date, datetime):
        month = plan_date.month
        if month <= 3: return 1
        if month <= 6: return 2
        if month <= 9: return 3
        return 4
    return None


def main():
    print(f'Loading: {EXCEL_PATH}')
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f'Total rows: {len(rows)}')

    # Группировка: (week, main_task) -> данные недельного плана
    weekly_plans_data = defaultdict(lambda: {
        'weekly_id': str(uuid.uuid4()),
        'employees': {},      # employee -> max(plan_hours)
        'companies': set(),
        'tasks': [],
        'process_excel': None,
        'main_task': None,
        'department': None,
        'week_monday': None,
        'first_plan_date': None,
    })

    for row in rows:
        process_excel = str(row[0]).strip() if row[0] else None
        main_task = str(row[1]).strip() if row[1] else None
        dept = str(row[2]).strip() if row[2] else None
        employee = str(row[3]).strip() if row[3] else None
        plan_hours = float(row[4]) if row[4] else 0
        plan_date = row[5]
        task_name = str(row[6]).strip() if row[6] else None
        fact_date = row[7]
        document = str(row[8]).strip() if row[8] else None
        note = str(row[9]).strip() if row[9] else None
        company = str(row[10]).strip() if row[10] else None
        fact_hours = float(row[11]) if row[11] else 0

        if not main_task or not isinstance(plan_date, datetime):
            continue

        week = plan_date.isocalendar()[1]
        key = (week, main_task)

        # Сотрудник: берём MAX plan_hours
        if employee:
            current_max = weekly_plans_data[key]['employees'].get(employee, 0)
            weekly_plans_data[key]['employees'][employee] = max(current_max, plan_hours)

        # Компания
        if company:
            weekly_plans_data[key]['companies'].add(company)

        # Метаданные (берём первые)
        if not weekly_plans_data[key]['process_excel']:
            weekly_plans_data[key]['process_excel'] = process_excel
        if not weekly_plans_data[key]['main_task']:
            weekly_plans_data[key]['main_task'] = main_task
        if not weekly_plans_data[key]['department']:
            weekly_plans_data[key]['department'] = dept
        if not weekly_plans_data[key]['week_monday']:
            weekly_plans_data[key]['week_monday'] = get_week_monday(plan_date)
        if not weekly_plans_data[key]['first_plan_date']:
            weekly_plans_data[key]['first_plan_date'] = plan_date

        # Задача
        weekly_plans_data[key]['tasks'].append({
            'task_name': task_name,
            'company': company,
            'employee': employee,
            'fact_hours': fact_hours,
            'fact_date': fact_date.strftime('%Y-%m-%d') if isinstance(fact_date, datetime) else None,
            'document': document,
            'note': note,
        })

    wb.close()

    print(f'\nНедельных планов: {len(weekly_plans_data)}')

    # Генерируем JSON структуры
    weekly_plans = []
    weekly_tasks = []
    weekly_plan_assignees = []
    weekly_plan_companies = []

    stats = {
        'plans': 0,
        'tasks': 0,
        'assignees': 0,
        'companies': 0,
        'with_process': 0,
    }

    for (week, main_task), data in weekly_plans_data.items():
        weekly_id = data['weekly_id']

        # Получаем ID из маппингов
        process_id = get_process_id(data['process_excel'], main_task)

        # Сумма MAX часов по сотрудникам
        planned_hours = sum(data['employees'].values())

        # Статус (все задачи выполнены = completed)
        has_incomplete = any(t['fact_date'] is None and t['fact_hours'] == 0 for t in data['tasks'])
        status = 'active' if has_incomplete else 'completed'

        # weekly_plan
        plan = {
            'weekly_id': weekly_id,
            'weekly_date': data['week_monday'],
            'expected_result': main_task,
            'planned_hours': planned_hours,
            'status': status,
            'quarterly_id': None,  # Связь опциональна
            # Дополнительные поля для отладки
            '_week_number': week,
            '_process_excel': data['process_excel'],
            '_process_id': process_id,
            '_department': data['department'],
        }
        weekly_plans.append(plan)
        stats['plans'] += 1
        if process_id:
            stats['with_process'] += 1

        # weekly_plan_assignees
        for employee, max_hours in data['employees'].items():
            user_id = EMPLOYEES.get(employee)
            if user_id:
                weekly_plan_assignees.append({
                    'weekly_plan_id': weekly_id,
                    'user_id': user_id,
                    '_employee': employee,
                    '_max_hours': max_hours,
                })
                stats['assignees'] += 1

        # weekly_plan_companies
        for company in data['companies']:
            company_id = get_company_id(company)
            if company_id:
                weekly_plan_companies.append({
                    'weekly_id': weekly_id,
                    'company_id': company_id,
                    '_company': company,
                })
                stats['companies'] += 1

        # weekly_tasks
        for task in data['tasks']:
            user_id = EMPLOYEES.get(task['employee'])

            # Описание: task_name - company
            if task['company']:
                description = f"{task['task_name']} - {task['company']}"
            else:
                description = task['task_name']

            weekly_tasks.append({
                'weekly_tasks_id': str(uuid.uuid4()),
                'weekly_plan_id': weekly_id,
                'user_id': user_id,
                'description': description,
                'spent_hours': task['fact_hours'],
                'completed_at': task['fact_date'],
                '_employee': task['employee'],
                '_task_name': task['task_name'],
                '_company': task['company'],
            })
            stats['tasks'] += 1

    # Сохраняем JSON файлы
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Полные версии (с отладочной информацией)
    with open(os.path.join(OUTPUT_DIR, 'weekly_plans_full.json'), 'w', encoding='utf-8') as f:
        json.dump(weekly_plans, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_tasks_full.json'), 'w', encoding='utf-8') as f:
        json.dump(weekly_tasks, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_plan_assignees_full.json'), 'w', encoding='utf-8') as f:
        json.dump(weekly_plan_assignees, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_plan_companies_full.json'), 'w', encoding='utf-8') as f:
        json.dump(weekly_plan_companies, f, ensure_ascii=False, indent=2)

    # Чистые версии (только поля для импорта)
    clean_plans = [{k: v for k, v in p.items() if not k.startswith('_')} for p in weekly_plans]
    clean_tasks = [{k: v for k, v in t.items() if not k.startswith('_')} for t in weekly_tasks]
    clean_assignees = [{k: v for k, v in a.items() if not k.startswith('_')} for a in weekly_plan_assignees]
    clean_companies = [{k: v for k, v in c.items() if not k.startswith('_')} for c in weekly_plan_companies]

    with open(os.path.join(OUTPUT_DIR, 'weekly_plans.json'), 'w', encoding='utf-8') as f:
        json.dump(clean_plans, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_tasks.json'), 'w', encoding='utf-8') as f:
        json.dump(clean_tasks, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_plan_assignees.json'), 'w', encoding='utf-8') as f:
        json.dump(clean_assignees, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, 'weekly_plan_companies.json'), 'w', encoding='utf-8') as f:
        json.dump(clean_companies, f, ensure_ascii=False, indent=2)

    # Статистика
    print('\n' + '='*60)
    print('СТАТИСТИКА')
    print('='*60)
    print(f'Недельных планов: {stats["plans"]}')
    print(f'  С process_id: {stats["with_process"]} ({100*stats["with_process"]/stats["plans"]:.1f}%)')
    print(f'Задач (weekly_tasks): {stats["tasks"]}')
    print(f'Связей план-сотрудник: {stats["assignees"]}')
    print(f'Связей план-компания: {stats["companies"]}')

    print('\nФайлы сохранены в:', OUTPUT_DIR)
    print('  weekly_plans.json')
    print('  weekly_tasks.json')
    print('  weekly_plan_assignees.json')
    print('  weekly_plan_companies.json')
    print('\nГотово!')


if __name__ == '__main__':
    main()

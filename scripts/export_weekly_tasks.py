#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Экспорт задач из Excel в JSON для импорта в Supabase.
Использует маппинги из analyze_mapping.py
"""

import openpyxl
import json
import os
import sys
import uuid
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Импортируем маппинги
from analyze_mapping import (
    DEPARTMENTS, EMPLOYEES, PROCESSES_DB, PROCESS_MAPPING, PROCESS_FIXES,
    COMPANIES_DB, COMPANY_MAPPING,
    get_process_id, get_company_id,
    COL_PROCESS, COL_MAIN_TASK, COL_DEPT, COL_EMPLOYEE,
    COL_PLAN_HOURS, COL_PLAN_DATE, COL_TASK, COL_FACT_DATE,
    COL_DOC, COL_NOTE, COL_COMPANY, COL_FACT_HOURS
)

SCRIPT_DIR = os.path.dirname(__file__)
EXCEL_PATH = os.path.join(SCRIPT_DIR, '..', 'bdib2025.xlsx')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')


def format_date(val):
    """Форматирование даты в ISO формат"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    return str(val) if val else None


def format_hours(val):
    """Форматирование часов в число"""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def get_week_number(plan_date):
    """Получить номер недели из даты"""
    if isinstance(plan_date, datetime):
        return plan_date.isocalendar()[1]
    return None


def determine_status(plan_date, fact_date, fact_hours):
    """Определить статус задачи"""
    if fact_date or (fact_hours and fact_hours > 0):
        return 'completed'
    if plan_date:
        if isinstance(plan_date, datetime):
            if plan_date < datetime.now():
                return 'overdue'
    return 'pending'


def main():
    print(f'Loading: {EXCEL_PATH}')
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f'Total rows: {len(rows)}')

    tasks = []
    stats = {
        'total': 0,
        'with_user': 0,
        'with_process': 0,
        'with_company': 0,
        'with_department': 0,
        'completed': 0,
        'pending': 0,
        'overdue': 0,
        'missing_user': [],
        'missing_process': [],
    }

    for i, row in enumerate(rows):
        stats['total'] += 1

        # Извлекаем данные из строки
        process_excel = str(row[COL_PROCESS]).strip() if row[COL_PROCESS] else None
        main_task = str(row[COL_MAIN_TASK]).strip() if row[COL_MAIN_TASK] else None
        dept = str(row[COL_DEPT]).strip() if row[COL_DEPT] else None
        employee = str(row[COL_EMPLOYEE]).strip() if row[COL_EMPLOYEE] else None
        plan_hours = format_hours(row[COL_PLAN_HOURS])
        plan_date = row[COL_PLAN_DATE]
        task_name = str(row[COL_TASK]).strip() if row[COL_TASK] else None
        fact_date = row[COL_FACT_DATE]
        document = str(row[COL_DOC]).strip() if row[COL_DOC] else None
        note = str(row[COL_NOTE]).strip() if row[COL_NOTE] else None
        company = str(row[COL_COMPANY]).strip() if row[COL_COMPANY] else None
        fact_hours = format_hours(row[COL_FACT_HOURS])

        # Получаем ID из маппингов
        user_id = EMPLOYEES.get(employee)
        department_id = DEPARTMENTS.get(dept)
        process_id = get_process_id(process_excel, main_task)
        company_id = get_company_id(company)

        # Статус
        status = determine_status(plan_date, fact_date, fact_hours)
        stats[status] += 1

        # Статистика
        if user_id:
            stats['with_user'] += 1
        else:
            if employee and employee not in stats['missing_user']:
                stats['missing_user'].append(employee)

        if process_id:
            stats['with_process'] += 1
        else:
            if process_excel and process_excel not in stats['missing_process']:
                stats['missing_process'].append(process_excel)

        if company_id:
            stats['with_company'] += 1
        if department_id:
            stats['with_department'] += 1

        # Формируем запись
        task = {
            'weekly_tasks_id': str(uuid.uuid4()),
            'task_name': task_name,
            'main_task': main_task,
            'description': note,
            'document': document,
            'plan_hours': plan_hours,
            'fact_hours': fact_hours,
            'plan_date': format_date(plan_date),
            'fact_date': format_date(fact_date),
            'week_number': get_week_number(plan_date),
            'status': status,
            'user_id': user_id,
            'department_id': department_id,
            'process_id': process_id,
            'company_id': company_id,
            # Оригинальные данные для отладки
            '_excel_row': i + 2,
            '_excel_employee': employee,
            '_excel_process': process_excel,
            '_excel_company': company,
            '_excel_dept': dept,
        }

        tasks.append(task)

    wb.close()

    # Сохраняем полный JSON (с отладочной информацией)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    full_path = os.path.join(OUTPUT_DIR, 'weekly_tasks_full.json')
    with open(full_path, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)
    print(f'\nПолный файл: {full_path}')

    # Сохраняем чистый JSON (без отладочной информации, только поля для импорта)
    clean_tasks = []
    for task in tasks:
        clean_task = {k: v for k, v in task.items() if not k.startswith('_')}
        clean_tasks.append(clean_task)

    clean_path = os.path.join(OUTPUT_DIR, 'weekly_tasks.json')
    with open(clean_path, 'w', encoding='utf-8') as f:
        json.dump(clean_tasks, f, ensure_ascii=False, indent=2)
    print(f'Чистый файл: {clean_path}')

    # Выводим статистику
    print('\n' + '='*60)
    print('СТАТИСТИКА')
    print('='*60)
    print(f'Всего задач: {stats["total"]}')
    print(f'  С user_id: {stats["with_user"]} ({100*stats["with_user"]/stats["total"]:.1f}%)')
    print(f'  С process_id: {stats["with_process"]} ({100*stats["with_process"]/stats["total"]:.1f}%)')
    print(f'  С company_id: {stats["with_company"]} ({100*stats["with_company"]/stats["total"]:.1f}%)')
    print(f'  С department_id: {stats["with_department"]} ({100*stats["with_department"]/stats["total"]:.1f}%)')
    print(f'\nСтатусы:')
    print(f'  completed: {stats["completed"]}')
    print(f'  pending: {stats["pending"]}')
    print(f'  overdue: {stats["overdue"]}')

    if stats['missing_user']:
        print(f'\n⚠️ Сотрудники без маппинга ({len(stats["missing_user"])}):')
        for emp in stats['missing_user'][:10]:
            print(f'    {emp}')

    if stats['missing_process']:
        print(f'\n⚠️ Процессы без маппинга ({len(stats["missing_process"])}):')
        for proc in stats['missing_process'][:10]:
            print(f'    {proc[:60]}')

    print('\nГотово!')


if __name__ == '__main__':
    main()

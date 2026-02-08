#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Конвертация Excel в CSV для импорта"""

import openpyxl
import csv
import os
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Пути
SCRIPT_DIR = os.path.dirname(__file__)
EXCEL_PATH = os.path.join(SCRIPT_DIR, '..', 'bdib2025.xlsx')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')

# Колонки Excel
COLUMNS = [
    'process',      # 0 - Процесс
    'main_task',    # 1 - Основна задача
    'department',   # 2 - Відділ
    'employee',     # 3 - Сотрудник
    'plan_hours',   # 4 - План ч/г
    'plan_date',    # 5 - Планова дата
    'task',         # 6 - Задача
    'fact_date',    # 7 - Дата виконання
    'document',     # 8 - Документ
    'note',         # 9 - Примітка
    'company',      # 10 - предприятие
    'fact_hours',   # 11 - ФактК
    'week',         # 12 - Неделя
]


def format_date(val):
    """Конвертировать дату в ISO формат"""
    if val is None:
        return ''
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    return str(val)


def format_value(val, col_name):
    """Форматировать значение для CSV"""
    if val is None:
        return ''
    if col_name in ('plan_date', 'fact_date'):
        return format_date(val)
    if col_name in ('plan_hours', 'fact_hours'):
        return str(float(val)) if val else '0'
    return str(val).strip()


def main():
    print(f'Loading: {EXCEL_PATH}')
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f'Total rows: {len(rows)}')

    # Группируем по отделам
    by_dept = {}
    for row in rows:
        dept = str(row[2]).strip() if row[2] else 'unknown'
        if dept not in by_dept:
            by_dept[dept] = []
        by_dept[dept].append(row)

    print(f'\nОтделы: {list(by_dept.keys())}')

    # Создаем CSV для каждого отдела
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for dept, dept_rows in by_dept.items():
        # Безопасное имя файла
        safe_name = dept.replace(' ', '_').replace('/', '_')
        csv_path = os.path.join(OUTPUT_DIR, f'{safe_name}.csv')

        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(COLUMNS)

            for row in dept_rows:
                csv_row = []
                for i, col_name in enumerate(COLUMNS):
                    val = row[i] if i < len(row) else None
                    csv_row.append(format_value(val, col_name))
                writer.writerow(csv_row)

        print(f'  {dept}: {len(dept_rows)} rows -> {csv_path}')

    # Также создаем общий файл
    all_csv = os.path.join(OUTPUT_DIR, 'all_data.csv')
    with open(all_csv, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(COLUMNS)
        for row in rows:
            csv_row = []
            for i, col_name in enumerate(COLUMNS):
                val = row[i] if i < len(row) else None
                csv_row.append(format_value(val, col_name))
            writer.writerow(csv_row)
    print(f'\nОбщий файл: {len(rows)} rows -> {all_csv}')

    wb.close()
    print('\nГотово!')


if __name__ == '__main__':
    main()

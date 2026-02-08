#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Конвертация Excel в JSON для импорта"""

import openpyxl
import json
import os
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# Пути
SCRIPT_DIR = os.path.dirname(__file__)
EXCEL_PATH = os.path.join(SCRIPT_DIR, '..', 'bdib2025.xlsx')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')

# Колонки Excel -> JSON ключи
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


def format_value(val, col_name):
    """Форматировать значение для JSON"""
    if val is None:
        return None
    if col_name in ('plan_date', 'fact_date'):
        if isinstance(val, datetime):
            return val.strftime('%Y-%m-%d')
        return str(val) if val else None
    if col_name in ('plan_hours', 'fact_hours'):
        return float(val) if val else 0
    if col_name == 'week':
        if not val:
            return None
        # Может быть "1 2025" или просто "1"
        s = str(val).split()[0]
        return int(s) if s.isdigit() else None
    return str(val).strip() if val else None


def row_to_dict(row):
    """Конвертировать строку в словарь"""
    result = {}
    for i, col_name in enumerate(COLUMNS):
        val = row[i] if i < len(row) else None
        result[col_name] = format_value(val, col_name)
    return result


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
        by_dept[dept].append(row_to_dict(row))

    print(f'\nОтделы: {list(by_dept.keys())}')

    # Создаем JSON для каждого отдела
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for dept, dept_rows in by_dept.items():
        # Безопасное имя файла
        safe_name = dept.replace(' ', '_').replace('/', '_')
        json_path = os.path.join(OUTPUT_DIR, f'{safe_name}.json')

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(dept_rows, f, ensure_ascii=False, indent=2)

        print(f'  {dept}: {len(dept_rows)} rows -> {json_path}')

    # Общий файл
    all_data = [row_to_dict(row) for row in rows]
    all_json = os.path.join(OUTPUT_DIR, 'all_data.json')
    with open(all_json, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f'\nОбщий файл: {len(all_data)} rows -> {all_json}')

    wb.close()
    print('\nГотово!')


if __name__ == '__main__':
    main()

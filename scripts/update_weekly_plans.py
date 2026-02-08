#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Обновление недельных планов в Supabase с quarterly_id.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import os
import requests
from dotenv import load_dotenv

# Загружаем .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

IMPORT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'import')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

BATCH_SIZE = 500


def delete_all(table_name):
    """Удалить все записи из таблицы"""
    # Используем фильтр который всегда true
    url = f'{SUPABASE_URL}/rest/v1/{table_name}?weekly_id=neq.00000000-0000-0000-0000-000000000000'
    response = requests.delete(url, headers=HEADERS)
    return response.status_code in (200, 204)


def import_table(table_name, json_file):
    """Импорт данных в таблицу"""
    filepath = os.path.join(IMPORT_DIR, json_file)

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total = len(data)
    print(f'  📦 {table_name}: {total} записей...', end=' ', flush=True)

    imported = 0
    errors = 0

    for i in range(0, total, BATCH_SIZE):
        batch = data[i:i + BATCH_SIZE]

        url = f'{SUPABASE_URL}/rest/v1/{table_name}'
        response = requests.post(url, headers=HEADERS, json=batch)

        if response.status_code in (200, 201):
            imported += len(batch)
            pct = 100 * imported / total
            print(f'\r  📦 {table_name}: {imported}/{total} ({pct:.0f}%)', end='', flush=True)
        else:
            errors += len(batch)
            print(f'\n  ❌ Ошибка: {response.status_code} - {response.text[:200]}')

    if errors == 0:
        print(f'\r  ✅ {table_name}: {imported} записей импортировано')
    else:
        print(f'\r  ⚠️  {table_name}: {imported} OK, {errors} ошибок')

    return imported


def main():
    print('='*60)
    print('ОБНОВЛЕНИЕ НЕДЕЛЬНЫХ ПЛАНОВ В SUPABASE')
    print('='*60)
    print(f'URL: {SUPABASE_URL}')
    print()

    # 1. Удаляем связанные данные
    print('🗑️  Удаление старых данных...')

    # Сначала задачи (зависят от weekly_plans)
    url = f'{SUPABASE_URL}/rest/v1/weekly_tasks?weekly_plan_id=neq.00000000-0000-0000-0000-000000000000'
    response = requests.delete(url, headers=HEADERS)
    print(f'  weekly_tasks: {"OK" if response.status_code in (200, 204) else response.status_code}')

    # Связи с сотрудниками
    url = f'{SUPABASE_URL}/rest/v1/weekly_plan_assignees?weekly_plan_id=neq.00000000-0000-0000-0000-000000000000'
    response = requests.delete(url, headers=HEADERS)
    print(f'  weekly_plan_assignees: {"OK" if response.status_code in (200, 204) else response.status_code}')

    # Связи с компаниями
    url = f'{SUPABASE_URL}/rest/v1/weekly_plan_companies?weekly_id=neq.00000000-0000-0000-0000-000000000000'
    response = requests.delete(url, headers=HEADERS)
    print(f'  weekly_plan_companies: {"OK" if response.status_code in (200, 204) else response.status_code}')

    # Сами недельные планы
    url = f'{SUPABASE_URL}/rest/v1/weekly_plans?weekly_id=neq.00000000-0000-0000-0000-000000000000'
    response = requests.delete(url, headers=HEADERS)
    print(f'  weekly_plans: {"OK" if response.status_code in (200, 204) else response.status_code}')

    print()

    # 2. Импортируем обновленные данные
    print('📥 Импорт обновленных данных...')
    import_table('weekly_plans', 'weekly_plans.json')
    import_table('weekly_plan_assignees', 'weekly_plan_assignees.json')
    import_table('weekly_plan_companies', 'weekly_plan_companies.json')
    import_table('weekly_tasks', 'weekly_tasks.json')

    print()
    print('✅ Обновление завершено!')


if __name__ == '__main__':
    main()

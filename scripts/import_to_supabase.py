#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Импорт данных в Supabase.
Порядок: quarterly_plans -> weekly_plans -> weekly_plan_assignees -> weekly_plan_companies -> weekly_tasks
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

BATCH_SIZE = 500  # Размер батча для вставки


def import_table(table_name, json_file, id_field=None):
    """Импорт данных в таблицу"""
    filepath = os.path.join(IMPORT_DIR, json_file)

    if not os.path.exists(filepath):
        print(f'  ⚠️  Файл не найден: {json_file}')
        return 0

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total = len(data)
    if total == 0:
        print(f'  ⚠️  Пустой файл: {json_file}')
        return 0

    print(f'  📦 {table_name}: {total} записей...', end=' ', flush=True)

    # Импортируем батчами
    imported = 0
    errors = 0

    for i in range(0, total, BATCH_SIZE):
        batch = data[i:i + BATCH_SIZE]

        url = f'{SUPABASE_URL}/rest/v1/{table_name}'
        response = requests.post(url, headers=HEADERS, json=batch)

        if response.status_code in (200, 201):
            imported += len(batch)
            # Прогресс
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


def check_existing(table_name, count_only=True):
    """Проверить существующие записи"""
    url = f'{SUPABASE_URL}/rest/v1/{table_name}?select=count'
    headers = {**HEADERS, 'Prefer': 'count=exact'}
    response = requests.head(url, headers=headers)

    if response.status_code == 200:
        count = response.headers.get('content-range', '').split('/')[-1]
        return int(count) if count.isdigit() else 0
    return 0


def main():
    print('='*60)
    print('ИМПОРТ ДАННЫХ В SUPABASE')
    print('='*60)
    print(f'URL: {SUPABASE_URL}')
    print()

    # Проверяем текущее состояние
    print('📊 Текущее состояние БД:')
    tables = ['quarterly_plans', 'weekly_plans', 'weekly_plan_assignees', 'weekly_plan_companies', 'weekly_tasks']
    for table in tables:
        count = check_existing(table)
        print(f'  {table}: {count} записей')
    print()

    # Импорт
    print('📥 Импорт данных:')

    # 1. Квартальные планы
    import_table('quarterly_plans', 'quarterly_plans.json', 'quarterly_id')

    # 2. Недельные планы
    import_table('weekly_plans', 'weekly_plans.json', 'weekly_id')

    # 3. Связи план-сотрудник
    import_table('weekly_plan_assignees', 'weekly_plan_assignees.json')

    # 4. Связи план-компания
    import_table('weekly_plan_companies', 'weekly_plan_companies.json')

    # 5. Задачи
    import_table('weekly_tasks', 'weekly_tasks.json', 'weekly_tasks_id')

    print()
    print('📊 Состояние БД после импорта:')
    for table in tables:
        count = check_existing(table)
        print(f'  {table}: {count} записей')

    print()
    print('✅ Импорт завершён!')


if __name__ == '__main__':
    main()

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Полная очистка всех планов и задач"""

import urllib.request
import urllib.error
import json

SUPABASE_URL = 'https://lfsdttsvihyejplmzaaz.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc2R0dHN2aWh5ZWpwbG16YWF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDE4NTkyOSwiZXhwIjoyMDU5NzYxOTI5fQ.GM1wZ1rivVjrmhHhRGlq_UzlwjpOrrL-kpMjoj_Dd-4'


def delete_all(table):
    """Удалить ВСЕ записи из таблицы"""
    try:
        # Удаляем все записи без условия (neq.null - всегда true для id)
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}?id=neq.00000000-0000-0000-0000-000000000000',
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Prefer': 'return=minimal'
            },
            method='DELETE'
        )
        urllib.request.urlopen(req, timeout=120)
        return True
    except urllib.error.HTTPError as e:
        print(f'Error {e.code}: {e.read().decode()[:200]}')
        return False
    except Exception as e:
        print(f'Error: {e}')
        return False


def query(endpoint):
    try:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{endpoint}',
            headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except:
        return []


def delete_by_pk(table, pk_column):
    """Удаляем все записи из таблицы по первичному ключу"""
    try:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{table}?{pk_column}=neq.00000000-0000-0000-0000-000000000000',
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Prefer': 'return=minimal'
            },
            method='DELETE'
        )
        urllib.request.urlopen(req, timeout=120)
        return True
    except urllib.error.HTTPError as e:
        print(f'Error {e.code}: {e.read().decode()[:200]}')
        return False


def main():
    print('=== ПОЛНАЯ ОЧИСТКА ПЛАНОВ ===\n')

    # 1. Удаляем задачи
    print('1. Удаление задач (weekly_tasks)...')
    delete_by_pk('weekly_tasks', 'weekly_tasks_id')
    tasks = query('weekly_tasks?select=weekly_tasks_id&limit=1')
    print(f'   Осталось: {len(tasks)}')

    # 2. Удаляем assignees недельных планов
    print('\n2. Удаление weekly_plan_assignees...')
    delete_by_pk('weekly_plan_assignees', 'weekly_plan_id')

    # 3. Удаляем недельные планы
    print('\n3. Удаление недельных планов (weekly_plans)...')
    delete_by_pk('weekly_plans', 'weekly_id')
    wps = query('weekly_plans?select=weekly_id&limit=1')
    print(f'   Осталось: {len(wps)}')

    # 4. Удаляем квартальные планы
    print('\n4. Удаление квартальных планов (quarterly_plans)...')
    delete_by_pk('quarterly_plans', 'quarterly_id')
    qps = query('quarterly_plans?select=quarterly_id&limit=1')
    print(f'   Осталось: {len(qps)}')

    # 5. НЕ удаляем годовые планы (они нужны)
    print('\n5. Годовые планы СОХРАНЕНЫ')
    aps = query('annual_plans?select=annual_plan_id,goal')
    print(f'   Годовых планов: {len(aps)}')

    print('\n=== ГОТОВО ===')


if __name__ == '__main__':
    main()

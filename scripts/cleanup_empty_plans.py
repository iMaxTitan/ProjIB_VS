#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Очистка пустых недельных планов (без задач).
Удаляет сначала assignees, потом сам план.
"""

import urllib.request
import urllib.error
import json
import time

SUPABASE_URL = 'https://lfsdttsvihyejplmzaaz.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc2R0dHN2aWh5ZWpwbG16YWF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDE4NTkyOSwiZXhwIjoyMDU5NzYxOTI5fQ.GM1wZ1rivVjrmhHhRGlq_UzlwjpOrrL-kpMjoj_Dd-4'


def query(endpoint, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/{endpoint}',
                headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                print(f'Query error: {e}')
                return []


def delete(endpoint, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/{endpoint}',
                headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Prefer': 'return=minimal'},
                method='DELETE'
            )
            urllib.request.urlopen(req, timeout=30)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 409:  # Conflict - есть связанные данные
                return False
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
    return False


def main():
    print('=== Очистка пустых недельных планов ===\n')

    # 1. Загружаем все недельные планы
    print('1. Загрузка недельных планов...')
    all_wps = []
    offset = 0
    while True:
        batch = query(f'weekly_plans?select=weekly_id&offset={offset}&limit=1000')
        if not batch:
            break
        all_wps.extend(batch)
        offset += 1000
    print(f'   Всего: {len(all_wps)}')

    # 2. Находим планы без задач
    print('\n2. Поиск пустых планов (без задач)...')
    empty_plans = []
    checked = 0
    for wp in all_wps:
        wp_id = wp['weekly_id']
        tasks = query(f'weekly_tasks?weekly_plan_id=eq.{wp_id}&select=weekly_tasks_id&limit=1')
        if not tasks:
            empty_plans.append(wp_id)
        checked += 1
        if checked % 500 == 0:
            print(f'   Проверено {checked}... (пустых: {len(empty_plans)})')

    print(f'   Найдено пустых: {len(empty_plans)}')

    if not empty_plans:
        print('\nНет пустых планов для удаления!')
        return

    # 3. Удаляем assignees и планы
    print(f'\n3. Удаление {len(empty_plans)} пустых планов...')
    deleted = 0
    errors = 0
    for wp_id in empty_plans:
        # Сначала удаляем assignees
        delete(f'weekly_plan_assignees?weekly_plan_id=eq.{wp_id}')

        # Потом удаляем план
        if delete(f'weekly_plans?weekly_id=eq.{wp_id}'):
            deleted += 1
        else:
            errors += 1

        if deleted % 100 == 0 and deleted > 0:
            print(f'   Удалено {deleted}...')

    print(f'\n=== Результат ===')
    print(f'   Удалено планов: {deleted}')
    print(f'   Ошибок: {errors}')

    # 4. Проверка
    remaining = query('weekly_plans?select=weekly_id&limit=1')
    all_remaining = []
    offset = 0
    while True:
        batch = query(f'weekly_plans?select=weekly_id&offset={offset}&limit=1000')
        if not batch:
            break
        all_remaining.extend(batch)
        offset += 1000
    print(f'   Осталось планов: {len(all_remaining)}')


if __name__ == '__main__':
    main()

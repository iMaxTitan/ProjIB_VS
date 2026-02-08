#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Удаление всех данных за 2025 год.
Порядок: задачи -> недельные планы -> квартальные планы -> годовые планы
"""

import urllib.request
import urllib.error
import json
import time

SUPABASE_URL = 'https://lfsdttsvihyejplmzaaz.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc2R0dHN2aWh5ZWpwbG16YWF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDE4NTkyOSwiZXhwIjoyMDU5NzYxOTI5fQ.GM1wZ1rivVjrmhHhRGlq_UzlwjpOrrL-kpMjoj_Dd-4'

# Годовые планы 2025 (ОКБ и СМУР)
ANNUAL_PLANS_2025 = [
    '50ff0ab8-1546-4de8-98ed-fbde16fb2162',  # ОКБ
    'c02acf2f-9e12-40d4-97d1-8d7142ea4a4d'   # СМУР
]


def delete_request(endpoint):
    """DELETE запрос к Supabase"""
    try:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{endpoint}',
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Prefer': 'return=minimal'
            },
            method='DELETE'
        )
        urllib.request.urlopen(req, timeout=60)
        return True
    except urllib.error.HTTPError as e:
        print(f'HTTP Error {e.code}: {e.read().decode()[:100]}')
        return False
    except Exception as e:
        print(f'Error: {e}')
        return False


def query(endpoint):
    """GET запрос к Supabase"""
    try:
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/{endpoint}',
            headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f'Query error: {e}')
        return []


def main():
    print('=== УДАЛЕНИЕ ДАННЫХ 2025 ГОДА ===\n')

    # 1. Получаем квартальные планы
    print('1. Получаем квартальные планы 2025...')
    quarterly_ids = []
    for annual_id in ANNUAL_PLANS_2025:
        qps = query(f'quarterly_plans?annual_plan_id=eq.{annual_id}&select=quarterly_id')
        quarterly_ids.extend([q['quarterly_id'] for q in qps])
    print(f'   Найдено: {len(quarterly_ids)}')

    # 2. Получаем недельные планы
    print('\n2. Получаем недельные планы...')
    weekly_ids = []
    for qp_id in quarterly_ids:
        wps = query(f'weekly_plans?quarterly_id=eq.{qp_id}&select=weekly_id')
        weekly_ids.extend([w['weekly_id'] for w in wps])
    print(f'   Найдено: {len(weekly_ids)}')

    # 3. Удаляем задачи
    print('\n3. Удаляем задачи...')
    for i, wp_id in enumerate(weekly_ids):
        delete_request(f'weekly_tasks?weekly_plan_id=eq.{wp_id}')
        if (i + 1) % 100 == 0:
            print(f'   Обработано планов: {i + 1}/{len(weekly_ids)}')
    print('   Задачи удалены!')

    # 4. Удаляем assignees недельных планов
    print('\n4. Удаляем assignees...')
    for wp_id in weekly_ids:
        delete_request(f'weekly_plan_assignees?weekly_plan_id=eq.{wp_id}')
    print('   Assignees удалены!')

    # 5. Удаляем недельные планы
    print('\n5. Удаляем недельные планы...')
    for qp_id in quarterly_ids:
        delete_request(f'weekly_plans?quarterly_id=eq.{qp_id}')
    print('   Недельные планы удалены!')

    # 6. Удаляем квартальные планы
    print('\n6. Удаляем квартальные планы...')
    for annual_id in ANNUAL_PLANS_2025:
        delete_request(f'quarterly_plans?annual_plan_id=eq.{annual_id}')
    print('   Квартальные планы удалены!')

    # НЕ удаляем годовые планы - они нужны
    print('\n7. Годовые планы СОХРАНЕНЫ (они нужны для нового импорта)')

    print('\n=== ГОТОВО ===')

    # Проверка
    print('\nПроверка:')
    for annual_id in ANNUAL_PLANS_2025:
        qps = query(f'quarterly_plans?annual_plan_id=eq.{annual_id}&select=quarterly_id')
        print(f'  Квартальных планов для {annual_id[:8]}: {len(qps)}')


if __name__ == '__main__':
    main()

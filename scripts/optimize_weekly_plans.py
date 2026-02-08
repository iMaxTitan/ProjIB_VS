#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Оптимизация недельных планов ОКБ и СМУР.

Объединяем планы с одинаковой (quarterly_id, weekly_date) в один.
Все задачи переносим на оставшийся план. Часы сохраняются!
"""

import urllib.request
import urllib.error
import json
import time
from collections import defaultdict

SUPABASE_URL = 'https://lfsdttsvihyejplmzaaz.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc2R0dHN2aWh5ZWpwbG16YWF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDE4NTkyOSwiZXhwIjoyMDU5NzYxOTI5fQ.GM1wZ1rivVjrmhHhRGlq_UzlwjpOrrL-kpMjoj_Dd-4'

# Годовые планы ОКБ и СМУР
ANNUAL_IDS = [
    '50ff0ab8-1546-4de8-98ed-fbde16fb2162',  # ОКБ
    'c02acf2f-9e12-40d4-97d1-8d7142ea4a4d'   # СМУР
]


def supabase_request(endpoint, method='GET', data=None, retries=3):
    """Выполнить запрос к Supabase"""
    for attempt in range(retries):
        try:
            url = f'{SUPABASE_URL}/rest/v1/{endpoint}'
            headers = {
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            }

            body = json.dumps(data).encode() if data else None
            req = urllib.request.Request(url, data=body, headers=headers, method=method)

            with urllib.request.urlopen(req, timeout=30) as resp:
                if method == 'GET':
                    return json.loads(resp.read())
                return True
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            print(f'HTTP Error {e.code}: {error_body[:100]}')
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as e:
            print(f'Error: {e}')
            if attempt < retries - 1:
                time.sleep(1)
    return None


def get_quarterly_plans():
    """Получить все квартальные планы ОКБ и СМУР"""
    all_qps = []
    for annual_id in ANNUAL_IDS:
        qps = supabase_request(f'quarterly_plans?annual_plan_id=eq.{annual_id}&select=quarterly_id')
        if qps:
            all_qps.extend(qps)
    return [q['quarterly_id'] for q in all_qps]


def get_weekly_plans(qp_ids):
    """Получить все недельные планы для квартальных планов"""
    all_wps = []
    for qp_id in qp_ids:
        wps = supabase_request(f'weekly_plans?quarterly_id=eq.{qp_id}&select=weekly_id,quarterly_id,weekly_date,expected_result,planned_hours')
        if wps:
            all_wps.extend(wps)
    return all_wps


def get_tasks_for_plan(wp_id):
    """Получить задачи для недельного плана"""
    return supabase_request(f'weekly_tasks?weekly_plan_id=eq.{wp_id}&select=weekly_tasks_id,spent_hours') or []


def update_tasks_plan(task_ids, new_wp_id):
    """Перенести задачи на другой план"""
    for task_id in task_ids:
        supabase_request(
            f'weekly_tasks?weekly_tasks_id=eq.{task_id}',
            'PATCH',
            {'weekly_plan_id': new_wp_id}
        )


def delete_weekly_plan(wp_id):
    """Удалить недельный план"""
    return supabase_request(f'weekly_plans?weekly_id=eq.{wp_id}', 'DELETE')


def update_plan_hours(wp_id, total_hours):
    """Обновить planned_hours для плана"""
    return supabase_request(
        f'weekly_plans?weekly_id=eq.{wp_id}',
        'PATCH',
        {'planned_hours': total_hours}
    )


def main():
    print('=== Оптимизация недельных планов ОКБ и СМУР ===\n')

    # 1. Получаем квартальные планы
    print('1. Загрузка квартальных планов...')
    qp_ids = get_quarterly_plans()
    print(f'   Найдено: {len(qp_ids)}')

    # 2. Получаем недельные планы
    print('\n2. Загрузка недельных планов...')
    all_wps = get_weekly_plans(qp_ids)
    print(f'   Найдено: {len(all_wps)}')

    # 3. Группируем по (quarterly_id, weekly_date)
    print('\n3. Группировка планов...')
    groups = defaultdict(list)
    for wp in all_wps:
        key = (wp['quarterly_id'], wp['weekly_date'])
        groups[key].append(wp)

    # Находим группы с дублями
    duplicates = {k: v for k, v in groups.items() if len(v) > 1}
    print(f'   Уникальных групп: {len(groups)}')
    print(f'   Групп с дублями: {len(duplicates)}')
    print(f'   Планов к объединению: {sum(len(v) - 1 for v in duplicates.values())}')

    if not duplicates:
        print('\nНет дублей для объединения!')
        return

    # 4. Объединяем
    print('\n4. Объединение планов...')
    merged_count = 0
    deleted_count = 0
    total_hours_before = 0
    total_hours_after = 0

    for (qp_id, weekly_date), plans in duplicates.items():
        # Выбираем главный план (первый по ID)
        main_plan = plans[0]
        other_plans = plans[1:]

        # Собираем все задачи и часы
        all_tasks = []
        total_hours = 0

        for plan in plans:
            tasks = get_tasks_for_plan(plan['weekly_id'])
            for t in tasks:
                all_tasks.append(t['weekly_tasks_id'])
                total_hours += t['spent_hours'] or 0
                total_hours_before += t['spent_hours'] or 0

        # Переносим задачи на главный план
        for plan in other_plans:
            tasks = get_tasks_for_plan(plan['weekly_id'])
            task_ids = [t['weekly_tasks_id'] for t in tasks]
            if task_ids:
                update_tasks_plan(task_ids, main_plan['weekly_id'])

        # Обновляем часы главного плана
        update_plan_hours(main_plan['weekly_id'], total_hours)
        total_hours_after += total_hours

        # Удаляем лишние планы
        for plan in other_plans:
            delete_weekly_plan(plan['weekly_id'])
            deleted_count += 1

        merged_count += 1
        if merged_count % 100 == 0:
            print(f'   Обработано групп: {merged_count}...')

    print(f'\n=== Результат ===')
    print(f'   Объединено групп: {merged_count}')
    print(f'   Удалено планов: {deleted_count}')
    print(f'   Часов до: {total_hours_before}')
    print(f'   Часов после: {total_hours_after}')
    print(f'   Разница часов: {total_hours_after - total_hours_before} (должно быть 0)')

    # 5. Проверка
    print('\n5. Проверка...')
    final_wps = get_weekly_plans(qp_ids)
    print(f'   Недельных планов после: {len(final_wps)}')
    print(f'   Было: {len(all_wps)} -> Стало: {len(final_wps)}')


if __name__ == '__main__':
    main()

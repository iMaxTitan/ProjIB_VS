#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Скрипт для обновления created_at задач на основе weekly_date их недельных планов.
Это исправит проблему когда все задачи имеют одинаковую дату импорта.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta
import random

# Load env
load_dotenv('c:/Proj/ProjIB_VS/.env.local')

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not url or not key:
    print('Missing env vars')
    sys.exit(1)

supabase = create_client(url, key)

print('=' * 60)
print('Обновление created_at задач на основе weekly_date планов')
print('=' * 60)

# 1. Получаем все недельные планы с их датами
print('\n1. Загружаем недельные планы...')
plans_response = supabase.table('weekly_plans').select('weekly_id, weekly_date').execute()
plans = {p['weekly_id']: p['weekly_date'] for p in plans_response.data}
print(f'   Загружено планов: {len(plans)}')

# 2. Получаем все задачи
print('\n2. Загружаем задачи...')
# Supabase имеет лимит, загружаем порциями
all_tasks = []
offset = 0
batch_size = 1000

while True:
    response = supabase.table('weekly_tasks').select('weekly_tasks_id, weekly_plan_id, created_at').range(offset, offset + batch_size - 1).execute()
    if not response.data:
        break
    all_tasks.extend(response.data)
    offset += batch_size
    print(f'   Загружено: {len(all_tasks)} задач...')

print(f'   Всего задач: {len(all_tasks)}')

# 3. Группируем задачи по weekly_plan_id
print('\n3. Группируем задачи по планам...')
tasks_by_plan = {}
for task in all_tasks:
    plan_id = task['weekly_plan_id']
    if plan_id not in tasks_by_plan:
        tasks_by_plan[plan_id] = []
    tasks_by_plan[plan_id].append(task)

print(f'   Уникальных планов с задачами: {len(tasks_by_plan)}')

# 4. Обновляем created_at для каждой задачи
print('\n4. Обновляем created_at задач...')
updated = 0
errors = 0
no_plan = 0

for plan_id, tasks in tasks_by_plan.items():
    if plan_id not in plans:
        no_plan += len(tasks)
        continue

    weekly_date = plans[plan_id]  # формат: '2025-02-03'
    base_date = datetime.strptime(weekly_date, '%Y-%m-%d')

    for i, task in enumerate(tasks):
        # Добавляем случайное смещение в пределах недели (0-6 дней) + случайное время
        day_offset = random.randint(0, 6)
        hour = random.randint(9, 18)  # рабочие часы
        minute = random.randint(0, 59)
        second = random.randint(0, 59)

        new_created_at = base_date + timedelta(days=day_offset, hours=hour, minutes=minute, seconds=second)
        new_created_at_str = new_created_at.isoformat() + '+00:00'

        try:
            supabase.table('weekly_tasks').update({
                'created_at': new_created_at_str
            }).eq('weekly_tasks_id', task['weekly_tasks_id']).execute()
            updated += 1

            if updated % 500 == 0:
                print(f'   Обновлено: {updated} задач...')
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'   Ошибка: {e}')

print(f'\n   Обновлено: {updated} задач')
print(f'   Ошибок: {errors}')
print(f'   Без плана: {no_plan}')

# 5. Проверяем результат
print('\n5. Проверяем результат...')
check = supabase.table('weekly_tasks').select('created_at').limit(10).execute()
print('   Примеры новых дат:')
for t in check.data[:5]:
    print(f'   {t["created_at"]}')

# Статистика по месяцам
print('\n6. Распределение по месяцам (выборка 1000):')
sample = supabase.table('weekly_tasks').select('created_at').limit(1000).execute()
from collections import Counter
months = Counter()
for t in sample.data:
    if t['created_at']:
        month = t['created_at'][:7]
        months[month] += 1

for month, count in sorted(months.items())[-12:]:
    print(f'   {month}: {count} задач')

print('\n' + '=' * 60)
print('Готово!')

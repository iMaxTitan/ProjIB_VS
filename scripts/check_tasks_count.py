#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta

# Load env
load_dotenv('c:/Proj/ProjIB_VS/.env.local')

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not url or not key:
    print('Missing env vars')
    sys.exit(1)

supabase = create_client(url, key)

# Даты
now = datetime.now()
week_ago = now - timedelta(days=7)
quarter_ago = now - timedelta(days=90)
year_ago = now - timedelta(days=365)

print(f'Текущая дата: {now.strftime("%Y-%m-%d %H:%M")}')
print(f'Неделя назад: {week_ago.strftime("%Y-%m-%d")}')
print('=' * 60)

# Запросы
try:
    # Всего задач
    total = supabase.table('weekly_tasks').select('weekly_tasks_id', count='exact').execute()
    print(f'Всего задач в БД: {total.count}')

    # За неделю
    week_tasks = supabase.table('weekly_tasks').select('weekly_tasks_id', count='exact').gte('created_at', week_ago.isoformat()).execute()
    print(f'Задач за последние 7 дней: {week_tasks.count}')

    # За квартал
    quarter_tasks = supabase.table('weekly_tasks').select('weekly_tasks_id', count='exact').gte('created_at', quarter_ago.isoformat()).execute()
    print(f'Задач за последние 90 дней: {quarter_tasks.count}')

    # За год
    year_tasks = supabase.table('weekly_tasks').select('weekly_tasks_id', count='exact').gte('created_at', year_ago.isoformat()).execute()
    print(f'Задач за последние 365 дней: {year_tasks.count}')

    print('=' * 60)

    # Часы за неделю
    week_hours_data = supabase.table('weekly_tasks').select('spent_hours').gte('created_at', week_ago.isoformat()).execute()
    week_hours = sum(float(t['spent_hours'] or 0) for t in week_hours_data.data)
    print(f'Часов за неделю: {week_hours:.2f}')

    # Часы за квартал
    quarter_hours_data = supabase.table('weekly_tasks').select('spent_hours').gte('created_at', quarter_ago.isoformat()).execute()
    quarter_hours = sum(float(t['spent_hours'] or 0) for t in quarter_hours_data.data)
    print(f'Часов за квартал: {quarter_hours:.2f}')

    # Часы за год
    year_hours_data = supabase.table('weekly_tasks').select('spent_hours').gte('created_at', year_ago.isoformat()).execute()
    year_hours = sum(float(t['spent_hours'] or 0) for t in year_hours_data.data)
    print(f'Часов за год: {year_hours:.2f}')

    print('=' * 60)

    # Проверим распределение по месяцам
    all_tasks = supabase.table('weekly_tasks').select('created_at').order('created_at', desc=True).limit(100).execute()

    print('Последние 10 задач (даты создания):')
    for t in all_tasks.data[:10]:
        print(f'  {t["created_at"]}')

    # Группировка по месяцам
    from collections import Counter
    months = Counter()
    for t in all_tasks.data:
        if t['created_at']:
            month = t['created_at'][:7]  # YYYY-MM
            months[month] += 1

    print('\nРаспределение по месяцам (последние 100 задач):')
    for month, count in sorted(months.items(), reverse=True)[:12]:
        print(f'  {month}: {count} задач')

except Exception as e:
    print(f'Error: {e}')

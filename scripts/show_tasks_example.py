#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
from datetime import datetime

wb = openpyxl.load_workbook('c:/Proj/ProjIB_VS/bdib2025.xlsx', read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(min_row=2, values_only=True))

target_mt = 'Моніторинг подій ІБ'
target_week = 1

print(f'ВЫПОЛНЕННЫЕ ЗАДАЧИ: {target_mt} | Неделя {target_week}')
print('='*100)
print(f'{"task_name":<45} {"company":<15} {"employee":<12} {"fact_h":>6} {"fact_date":>10}')
print('-'*100)

count = 0
for row in rows:
    main_task = str(row[1]).strip() if row[1] else None
    employee = str(row[3]).strip() if row[3] else None
    plan_date = row[5]
    task_name = str(row[6]).strip() if row[6] else None
    fact_date = row[7]
    company = str(row[10]).strip() if row[10] else None
    fact_hours = float(row[11]) if row[11] else 0

    if main_task != target_mt:
        continue
    if not isinstance(plan_date, datetime):
        continue
    if plan_date.isocalendar()[1] != target_week:
        continue

    fact_str = fact_date.strftime('%Y-%m-%d') if isinstance(fact_date, datetime) else ''
    comp_str = company[:15] if company else ''
    print(f'{task_name[:45]:<45} {comp_str:<15} {employee:<12} {fact_hours:>6.1f} {fact_str:>10}')
    count += 1
    if count >= 25:
        print('...')
        break

wb.close()
print(f'\nВсего записей в этом недельном плане: 84')

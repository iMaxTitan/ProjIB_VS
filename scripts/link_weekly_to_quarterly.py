#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Связывание недельных планов с квартальными через process_id.

Логика:
1. Для каждого недельного плана определяем:
   - process_id (через маппинг из Excel)
   - quarter (из даты)
2. Находим квартальный план с тем же process_id и quarter
3. Обновляем quarterly_id в недельном плане
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import os

SCRIPT_DIR = os.path.dirname(__file__)
IMPORT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')


def get_quarter(date_str):
    """Получить квартал из даты YYYY-MM-DD"""
    if not date_str:
        return None
    month = int(date_str.split('-')[1])
    if month <= 3: return 1
    if month <= 6: return 2
    if month <= 9: return 3
    return 4


def main():
    # Загружаем квартальные планы
    with open(os.path.join(IMPORT_DIR, 'quarterly_plans.json'), 'r', encoding='utf-8') as f:
        quarterly_plans = json.load(f)

    # Создаём индекс: (process_id, quarter) -> quarterly_id
    quarterly_index = {}
    for qp in quarterly_plans:
        key = (qp['process_id'], qp['quarter'])
        if key not in quarterly_index:
            quarterly_index[key] = qp['quarterly_id']

    print(f'Квартальных планов: {len(quarterly_plans)}')
    print(f'Уникальных пар (process_id, quarter): {len(quarterly_index)}')

    # Загружаем полные недельные планы (с _process_id)
    with open(os.path.join(IMPORT_DIR, 'weekly_plans_full.json'), 'r', encoding='utf-8') as f:
        weekly_plans = json.load(f)

    print(f'Недельных планов: {len(weekly_plans)}')

    # Обновляем quarterly_id
    linked = 0
    not_linked = 0
    no_process = 0

    for wp in weekly_plans:
        process_id = wp.get('_process_id')
        week_date = wp.get('weekly_date')
        quarter = get_quarter(week_date)

        if not process_id:
            no_process += 1
            continue

        key = (process_id, quarter)
        if key in quarterly_index:
            wp['quarterly_id'] = quarterly_index[key]
            linked += 1
        else:
            not_linked += 1

    print(f'\nРезультаты:')
    print(f'  Связано с квартальным: {linked}')
    print(f'  Не связано (нет подходящего квартального): {not_linked}')
    print(f'  Без process_id: {no_process}')

    # Сохраняем полные данные
    with open(os.path.join(IMPORT_DIR, 'weekly_plans_full.json'), 'w', encoding='utf-8') as f:
        json.dump(weekly_plans, f, ensure_ascii=False, indent=2)

    # Сохраняем чистые данные (без служебных полей)
    clean_plans = [{k: v for k, v in wp.items() if not k.startswith('_')} for wp in weekly_plans]
    with open(os.path.join(IMPORT_DIR, 'weekly_plans.json'), 'w', encoding='utf-8') as f:
        json.dump(clean_plans, f, ensure_ascii=False, indent=2)

    print(f'\nФайлы обновлены:')
    print(f'  weekly_plans_full.json')
    print(f'  weekly_plans.json')

    # Показать примеры несвязанных
    if not_linked > 0:
        print(f'\nПримеры несвязанных (первые 10):')
        count = 0
        for wp in weekly_plans:
            if not wp.get('quarterly_id') and wp.get('_process_id'):
                process_id = wp.get('_process_id')
                quarter = get_quarter(wp.get('weekly_date'))
                print(f'  Q{quarter} | {wp.get("_process_excel", "")[:40]} | {wp.get("expected_result", "")[:30]}')
                count += 1
                if count >= 10:
                    break


if __name__ == '__main__':
    main()

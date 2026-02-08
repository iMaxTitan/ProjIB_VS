#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Импорт данных из Excel для отделов ОКБ (ОІБ) и СМУР (СУР)

Структура импорта:
1. Годовой план (annual_plans) - один на отдел
2. Квартальные планы (quarterly_plans) - по процессам и кварталам
3. Недельные планы (weekly_plans) - по "Основна задача" и неделям
4. Задачи (weekly_tasks) - конкретные задачи с часами
"""

import openpyxl
import json
import urllib.request
import urllib.error
import uuid
import time
from datetime import datetime, timedelta
from collections import defaultdict

# Supabase credentials
SUPABASE_URL = 'https://lfsdttsvihyejplmzaaz.supabase.co'
SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc2R0dHN2aWh5ZWpwbG16YWF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDE4NTkyOSwiZXhwIjoyMDU5NzYxOTI5fQ.GM1wZ1rivVjrmhHhRGlq_UzlwjpOrrL-kpMjoj_Dd-4'

# Конфигурация отделов
DEPARTMENTS = {
    'ОІБ': {
        'db_name': 'ОКБ',
        'db_id': '36dab3d8-2c16-4c1c-ae8c-b62367482a7e',
        'users': {
            'Шаферистов': 'd026e474-cce7-4023-9ac8-b2d1090793db',
            'Казаков': 'bb9a7893-c095-4392-aa96-e5a788c9a02c',
            'Мартинюк': '4140507f-00fb-4943-a4bb-cfdf0d2a5acc',
            'Карчевський': 'b3a29f62-b41e-4010-ae72-bd47a4a2b74f',
            'Федяй': 'fb1a50ec-c120-42e9-84f0-aff028f7c9a5',
            'Василиненко': 'c25aea05-63ee-414b-9b50-c31815c2221e',
            'Стопінський': '0f5ceffa-3137-4d00-a84f-214aa67305a5',
            'Венгер': 'ef247c2d-bd70-44b8-bcce-2fc2a64c0dd0',
            'Андрійчук': '874b95c2-ffad-43bf-8fb8-efa989037ebf',
            'Шленськовий': 'fc74ffb0-3589-48b8-a154-bd1038230a77'
        },
        'processes': {
            'Моніторинг подій ІБ': '24bd91ff-e239-4ced-8a76-568ffee96328',
            'Управління інцидентами ІБ': '24bd91ff-e239-4ced-8a76-568ffee96328',
            'Управління правами доступу до ІС та мережевих ресурсів': 'd131d36c-05ef-4e3c-a5dc-3e52eca89947',
            'Управління документацією в сфері ІБ': '21a14ed2-1e15-407a-bae4-6d48a93bc42c',
            'Управління вразливостями в ІС та мережевому обладнанні': '693ef591-a165-49c1-a16e-26ec9cfed754',
            'Управління налаштуваннями безпеки ІC та обладнання': '535bbb05-2bcd-4884-b6f4-0610aec43db7',
            'Управління змінами в ІС': '19e0c6a4-0a3a-49c2-a4ac-27fe93447ef6',
            'Управління ризиками в сфері ІБ': 'd6504c36-dc7a-4835-b477-ef366a13347b',
            'Управління життєвим циклом ІС': '19e0c6a4-0a3a-49c2-a4ac-27fe93447ef6',
        },
        'companies': {
            'АТБи7': '48a6e00b-ef2c-4d3e-bf58-e0d1be17f3c6',
            'АТБМ': '805be13b-5cc8-4084-ab0b-3c45ca6e89e6',
            'АТБи5': 'ffdbad51-be9b-470e-a9bb-1eff1c6596a2',
            'ТЛ': '6211ed9d-dc19-4026-ad1e-b049f2e3ee3d',
            'КФК': '31d44859-64d5-4201-a36a-65d0e94e9cc8',
            'МФФ': 'd7129c09-dbb2-4da2-a6c4-f82b3fee298b',
            'ЛЮ': '5c54315a-e43d-45e6-892f-480c2e0e5d84',
        }
    },
    'СУР': {
        'db_name': 'СМУР',
        'db_id': '62f49b72-e9b2-481a-af87-3d459a8eba28',
        'users': {
            'Денисов К.': 'add0bce6-2446-47ee-b5d4-d82c837941dc',
            'Диковицький П.': 'd7063d6f-9845-46d7-94cd-d110ce5dd5e2',
            'Сухоцька Р.': 'bd9faac0-9b72-4297-b159-f6d2a52a4aaa',
            'Ігнатова К.': '71bb49b1-5980-414a-8ef3-67e409485f0c',
            'Нікітіна Є.': '865d9bb2-c054-405b-bc4e-8c74b9fb80f6',
            'Куник С.': '1c85eb0c-dd58-459b-91eb-c8bc516f3c1c',
        },
        'processes': {
            'Управління документацією в сфері ІБ': '21a14ed2-1e15-407a-bae4-6d48a93bc42c',
            'Управлінська та організаційна діяльність': '4bbb4e4c-6346-465f-8105-ff2b19043a98',
            'Управління життєвим циклом ІС': '19e0c6a4-0a3a-49c2-a4ac-27fe93447ef6',
            'Підвищення обізнаності співробітників Компанії та представників зовнішніх організацій з питань ІБ': 'a684e4d7-3e9e-4dff-a46e-79b0400f2dda',
            'Управління безперервністю інформаційної безпеки': 'd6504c36-dc7a-4835-b477-ef366a13347b',
            'Управління ризиками в сфері ІБ': 'd6504c36-dc7a-4835-b477-ef366a13347b',
        },
        'companies': {
            'АТБ7': '48a6e00b-ef2c-4d3e-bf58-e0d1be17f3c6',
            'АТБМ': '805be13b-5cc8-4084-ab0b-3c45ca6e89e6',
            'ЛЮ': '5c54315a-e43d-45e6-892f-480c2e0e5d84',
            'ТЛ': '6211ed9d-dc19-4026-ad1e-b049f2e3ee3d',
            'МФФ': 'd7129c09-dbb2-4da2-a6c4-f82b3fee298b',
        }
    }
}

# Индексы колонок Excel
COL_PROCESS = 0      # Процесс
COL_MAIN_TASK = 1    # Основна задача
COL_DEPT = 2         # Відділ
COL_RESOURCE = 3     # Ресурси
COL_PLAN_HOURS = 4   # План ч/г
COL_COMPANY = 5      # Оганізація (код)
COL_PLAN_DATE = 6    # Планова дата
COL_ORG_NAME = 7     # Організація (полное имя)
COL_TASK = 8         # Задача
COL_FACT_HOURS = 9   # Факт ч/г
COL_FACT_DATE = 10   # Дата виконання
COL_WEEK = 11        # Неделя


def supabase_request(endpoint, method='GET', data=None, max_retries=3):
    """Выполнить запрос к Supabase REST API с retry логикой"""
    url = f'{SUPABASE_URL}/rest/v1/{endpoint}'
    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

    if data:
        data = json.dumps(data).encode('utf-8')

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as response:
                time.sleep(0.05)
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            print(f'HTTP Error {e.code}: {error_body[:200]}')
            return None
        except urllib.error.URLError as e:
            print(f'Network error (attempt {attempt+1}): {e}')
            time.sleep(2)
    return None


def excel_to_date(value):
    """Конвертировать Excel serial date в datetime"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        # Excel uses 1899-12-30 as base date
        return datetime(1899, 12, 30) + timedelta(days=int(value))
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace(' 00:00:00', ''))
        except:
            return None
    return None


def get_week_number(date):
    """Получить номер недели ISO"""
    date = excel_to_date(date)
    if date is None:
        return None
    return date.isocalendar()[1]


def get_quarter(date):
    """Получить номер квартала"""
    date = excel_to_date(date)
    if date is None:
        return None
    return (date.month - 1) // 3 + 1


def get_week_dates(year, week_num):
    """Получить даты начала и конца недели"""
    jan4 = datetime(year, 1, 4)
    start = jan4 - timedelta(days=jan4.weekday())
    week_start = start + timedelta(weeks=week_num - 1)
    week_end = week_start + timedelta(days=6)
    return week_start.strftime('%Y-%m-%d'), week_end.strftime('%Y-%m-%d')


def import_department(dept_name, rows, year=2025):
    """Импорт данных для одного отдела"""
    config = DEPARTMENTS.get(dept_name)
    if not config:
        print(f'Unknown department: {dept_name}')
        return

    print(f'\n{"="*60}')
    print(f'Импорт отдела: {dept_name} -> {config["db_name"]}')
    print(f'Записей: {len(rows)}')
    print(f'{"="*60}')

    dept_id = config['db_id']
    users = config['users']
    processes = config['processes']
    companies = config['companies']

    # Статистика
    stats = {
        'annual_plans': 0,
        'quarterly_plans': 0,
        'weekly_plans': 0,
        'tasks': 0,
        'skipped_users': set(),
        'skipped_processes': set(),
    }

    # 1. Используем существующий годовой план
    print('\n=== Поиск годового плана ===')
    first_user_id = list(users.values())[0]

    # Маппинг отделов к существующим годовым планам
    ANNUAL_PLAN_MAPPING = {
        'ОКБ': '50ff0ab8-1546-4de8-98ed-fbde16fb2162',  # План роботи відділу ОКБ на 2025 рік
        'СМУР': 'c02acf2f-9e12-40d4-97d1-8d7142ea4a4d',  # План роботи відділу СМУР на 2025 рік
    }

    annual_id = ANNUAL_PLAN_MAPPING.get(config['db_name'])
    if not annual_id:
        print(f'ERROR: Не найден годовой план для {config["db_name"]}')
        return stats

    print(f'Используем годовой план: {annual_id}')
    stats['annual_plans'] = 1

    # 2. Группируем данные по процессам и кварталам
    print('\n=== Анализ квартальных планов ===')
    quarterly_data = defaultdict(lambda: defaultdict(list))  # process_id -> quarter -> rows

    for row in rows:
        process_name = row[COL_PROCESS]
        plan_date = row[COL_PLAN_DATE]

        if not process_name or not plan_date:
            continue

        process_id = processes.get(str(process_name).strip())
        if not process_id:
            stats['skipped_processes'].add(str(process_name)[:50])
            continue

        quarter = get_quarter(plan_date)
        if quarter is None:
            continue

        quarterly_data[process_id][quarter].append(row)

    # 3. Загружаем существующие или создаем квартальные планы
    print('\n=== Загрузка/создание квартальных планов ===')
    quarterly_plans = {}  # (process_id, quarter) -> quarterly_plan_id

    # Загружаем существующие квартальные планы
    existing_qp = supabase_request(f'quarterly_plans?annual_plan_id=eq.{annual_id}&select=quarterly_id,process_id,quarter')
    if existing_qp:
        for qp in existing_qp:
            key = (qp['process_id'], qp['quarter'])
            if key not in quarterly_plans:  # берем первый, если дубликаты
                quarterly_plans[key] = qp['quarterly_id']
        print(f'Загружено существующих: {len(quarterly_plans)}')

    # Создаем недостающие
    created = 0
    for process_id, quarters in quarterly_data.items():
        for quarter, qrows in quarters.items():
            key = (process_id, quarter)
            if key in quarterly_plans:
                continue  # уже есть

            qp_id = str(uuid.uuid4())
            quarterly_plan = {
                'quarterly_id': qp_id,
                'annual_plan_id': annual_id,
                'process_id': process_id,
                'quarter': quarter,
                'goal': f'Квартальний план Q{quarter}/{year}',
                'expected_result': f'Виконання задач Q{quarter}',
                'status': 'approved',
                'department_id': dept_id
            }
            result = supabase_request('quarterly_plans', 'POST', quarterly_plan)
            if result:
                quarterly_plans[key] = qp_id
                created += 1
                stats['quarterly_plans'] += 1

    print(f'Создано новых: {created}')

    # 4. Группируем по недельным планам
    print('\n=== Создание недельных планов ===')
    weekly_data = defaultdict(list)  # (process_id, quarter, week, main_task) -> rows

    for row in rows:
        process_name = row[COL_PROCESS]
        plan_date = row[COL_PLAN_DATE]
        main_task = row[COL_MAIN_TASK]

        if not process_name or not plan_date or not main_task:
            continue

        process_id = processes.get(str(process_name).strip())
        if not process_id:
            continue

        quarter = get_quarter(plan_date)
        week = get_week_number(plan_date)
        if quarter is None or week is None:
            continue

        key = (process_id, quarter, week, str(main_task).strip()[:200])
        weekly_data[key].append(row)

    # 5. Создаем недельные планы
    weekly_plans = {}  # key -> weekly_plan_id

    for key, wrows in weekly_data.items():
        process_id, quarter, week, main_task = key
        qp_key = (process_id, quarter)

        if qp_key not in quarterly_plans:
            continue

        # Собираем исполнителей для недельного плана
        assignees = set()
        for row in wrows:
            resource = row[COL_RESOURCE]
            if resource:
                user_id = users.get(str(resource).strip())
                if user_id:
                    assignees.add(user_id)
                else:
                    stats['skipped_users'].add(str(resource))

        if not assignees:
            assignees.add(first_user_id)

        week_start, week_end = get_week_dates(year, week)
        wp_id = str(uuid.uuid4())

        weekly_plan = {
            'weekly_id': wp_id,
            'quarterly_id': quarterly_plans[qp_key],
            'weekly_date': week_start,
            'expected_result': main_task[:500],
            'status': 'completed',
            'planned_hours': 0
        }

        result = supabase_request('weekly_plans', 'POST', weekly_plan)
        if result:
            weekly_plans[key] = wp_id
            stats['weekly_plans'] += 1

        if stats['weekly_plans'] % 100 == 0:
            print(f'  Создано {stats["weekly_plans"]} недельных планов...')

    print(f'Всего недельных планов: {stats["weekly_plans"]}')

    # 6. Создаем задачи
    print('\n=== Создание задач ===')

    for key, wrows in weekly_data.items():
        if key not in weekly_plans:
            continue

        wp_id = weekly_plans[key]

        for row in wrows:
            task_name = row[COL_TASK]
            resource = row[COL_RESOURCE]
            plan_hours = row[COL_PLAN_HOURS]
            fact_hours = row[COL_FACT_HOURS]
            company_code = row[COL_COMPANY]
            plan_date = row[COL_PLAN_DATE]
            fact_date = row[COL_FACT_DATE]

            if not task_name:
                continue

            # Находим user_id
            user_id = None
            if resource:
                user_id = users.get(str(resource).strip())
            if not user_id:
                user_id = first_user_id

            # Находим company_id
            company_id = None
            if company_code:
                company_id = companies.get(str(company_code).strip())

            # Форматируем даты
            due_date = None
            completed_at = None
            plan_dt = excel_to_date(plan_date)
            fact_dt = excel_to_date(fact_date)
            if plan_dt:
                due_date = plan_dt.strftime('%Y-%m-%d')
            if fact_dt:
                completed_at = fact_dt.strftime('%Y-%m-%dT%H:%M:%S')

            task = {
                'weekly_tasks_id': str(uuid.uuid4()),
                'weekly_plan_id': wp_id,
                'user_id': user_id,
                'description': str(task_name)[:500],
                'spent_hours': float(fact_hours) if fact_hours else 0,
                'completed_at': completed_at if completed_at else due_date,
            }

            result = supabase_request('weekly_tasks', 'POST', task)
            if result:
                stats['tasks'] += 1

            if stats['tasks'] % 500 == 0:
                print(f'  Создано {stats["tasks"]} задач...')

    print(f'Всего задач: {stats["tasks"]}')

    # Итоги
    print(f'\n{"="*60}')
    print(f'ИТОГИ ИМПОРТА {config["db_name"]}')
    print(f'  Годовой план: {stats["annual_plans"]}')
    print(f'  Квартальных планов: {stats["quarterly_plans"]}')
    print(f'  Недельных планов: {stats["weekly_plans"]}')
    print(f'  Задач: {stats["tasks"]}')
    if stats['skipped_users']:
        print(f'  Пропущенные сотрудники: {stats["skipped_users"]}')
    if stats['skipped_processes']:
        print(f'  Пропущенные процессы: {stats["skipped_processes"]}')
    print(f'{"="*60}')

    return stats


def main():
    print('Загрузка Excel файла...')
    wb = openpyxl.load_workbook('../bdib2025.xlsx', read_only=True, data_only=True)
    ws = wb['Лист1']

    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    data_rows = rows[1:]

    print(f'Всего строк данных: {len(data_rows)}')

    # Группируем по отделам
    dept_rows = defaultdict(list)
    for row in data_rows:
        dept = row[COL_DEPT]
        if dept:
            dept_rows[str(dept).strip()].append(row)

    print(f'\nОтделы в файле:')
    for dept, rows in dept_rows.items():
        print(f'  {dept}: {len(rows)} записей')

    # Импортируем каждый отдел
    total_stats = {
        'annual_plans': 0,
        'quarterly_plans': 0,
        'weekly_plans': 0,
        'tasks': 0
    }

    for dept_name in ['ОІБ', 'СУР']:
        if dept_name in dept_rows:
            stats = import_department(dept_name, dept_rows[dept_name])
            if stats:
                for key in total_stats:
                    total_stats[key] += stats.get(key, 0)

    print(f'\n{"="*60}')
    print('ОБЩИЕ ИТОГИ ИМПОРТА')
    print(f'  Годовых планов: {total_stats["annual_plans"]}')
    print(f'  Квартальных планов: {total_stats["quarterly_plans"]}')
    print(f'  Недельных планов: {total_stats["weekly_plans"]}')
    print(f'  Задач: {total_stats["tasks"]}')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()

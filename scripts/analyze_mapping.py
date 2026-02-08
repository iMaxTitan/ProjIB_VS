#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Анализ маппинга данных Excel -> БД справочники.
Выявляем несоответствия и создаем файлы маппинга.
"""

import openpyxl
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# === СПРАВОЧНИКИ ИЗ БД (из docs/database/SCHEMA.md) ===

DEPARTMENTS = {
    'УИБК': '2c460943-e6d1-48e3-8300-7491ef2b37d8',
    'ИБ': '2c460943-e6d1-48e3-8300-7491ef2b37d8',
    'ОКБ': '36dab3d8-2c16-4c1c-ae8c-b62367482a7e',
    'СВК': '9beab000-39d0-4d7a-952d-242cef86d0f0',
    'СМУР': '62f49b72-e9b2-481a-af87-3d459a8eba28',
}

# === ПРОЦЕССЫ В БД (актуальные названия) ===
PROCESSES_DB = {
    'Захист даних': 'f5e88dfd-07e2-47e4-a4d8-52e166ada138',
    'Управління правами доступу': 'd131d36c-05ef-4e3c-a5dc-3e52eca89947',
    'Управління безпекою інформаційних систем': '693ef591-a165-49c1-a16e-26ec9cfed754',
    'Управління безпекою обчислювальних систем': '535bbb05-2bcd-4884-b6f4-0610aec43db7',
    'Управління безпекою мережі': '4dd284c2-5054-44b8-8e69-b7453a11eaf7',
    'Моніторинг та реагування на події та інциденти ІБ': '24bd91ff-e239-4ced-8a76-568ffee96328',
    'Управління ризиками інформаційної безпеки': '19e0c6a4-0a3a-49c2-a4ac-27fe93447ef6',
    'Навчання та підвищення обізнаності у сфері ІБ': 'a684e4d7-3e9e-4dff-a46e-79b0400f2dda',
    'Управління документацією СУІБ': '21a14ed2-1e15-407a-bae4-6d48a93bc42c',
    'Безперервність інформаційної безпеки': 'd6504c36-dc7a-4835-b477-ef366a13347b',
    'Управлінська та організаційна діяльність': '4bbb4e4c-6346-465f-8105-ff2b19043a98',
}

# === МАППИНГ: название из Excel -> название в БД ===
PROCESS_MAPPING = {
    # Прямые совпадения
    'Управлінська та організаційна діяльність': 'Управлінська та організаційна діяльність',

    # Мониторинг (3 варианта в Excel -> 1 в БД)
    'Моніторинг подій ІБ': 'Моніторинг та реагування на події та інциденти ІБ',
    'Управління інцидентами ІБ': 'Моніторинг та реагування на події та інциденти ІБ',
    'Управління подіями ІБ': 'Моніторинг та реагування на події та інциденти ІБ',

    # Документация
    'Управління документацією в сфері ІБ': 'Управління документацією СУІБ',

    # Права доступа
    'Управління правами доступу до ІС та мережевих ресурсів': 'Управління правами доступу',

    # Безопасность ИС (несколько вариантов)
    'Управління життєвим циклом ІС': 'Управління безпекою інформаційних систем',
    'Управління вразливостями в ІС та мережевому обладнанні': 'Управління безпекою інформаційних систем',
    'Управління змінами в ІС': 'Управління безпекою інформаційних систем',

    # Риски
    'Управління ризиками в сфері ІБ': 'Управління ризиками інформаційної безпеки',

    # Обучение (разные варианты обрезки в Excel)
    'Підвищення обізнаності співробітників Компанії та предс': 'Навчання та підвищення обізнаності у сфері ІБ',
    'Підвищення обізнаності співробітників Компанії та представни': 'Навчання та підвищення обізнаності у сфері ІБ',
    'Підвищення обізнаності співробітників Компанії та представників зовнішніх організацій з питань ІБ': 'Навчання та підвищення обізнаності у сфері ІБ',

    # Безперервність
    'Управління безперервністю інформаційної безпеки': 'Безперервність інформаційної безпеки',

    # Безопасность обчислювальних систем
    'Управління налаштуваннями безпеки ІC та обладнання': 'Управління безпекою обчислювальних систем',

    # Проектная деятельность -> Управленческая
    'Проєктна діяльність': 'Управлінська та організаційна діяльність',

    # Управлінська діяльність (сокращенный вариант)
    'Управлінська діяльність': 'Управлінська та організаційна діяльність',
}

# === ИСПРАВЛЕНИЯ ОШИБОК КЛАССИФИКАЦИИ В EXCEL ===
# Ключ: (process_excel, main_task) -> правильный процесс БД
# СВК занимается проектной/управленческой деятельностью, а не техническими процессами ИС
PROCESS_FIXES = {
    # ОКБ (Шаферистов) работал над "Облік робочого часу" - это ИС, а не риски
    ('Управління ризиками в сфері ІБ', 'Впровадження системи Обліку робочого часу'): 'Управління безпекою інформаційних систем',
    # СВК - проекты должны быть в Управлінська та організаційна діяльність
    ('Управління життєвим циклом ІС', 'Проєкт "Система обліку робочого часу"'): 'Управлінська та організаційна діяльність',
}

# === МАППІНГ: Квартальні плани (docx) -> Процеси БД ===
# Ключ: підрядок тексту завдання (для пошуку)
# Значення: назва процесу в БД
QUARTERLY_PLAN_TO_PROCESS = {
    # СМУР
    'Організація проведення навчання': 'Навчання та підвищення обізнаності у сфері ІБ',
    'Плановий перегляд нормативної документації': 'Управління документацією СУІБ',
    'Обробка ризиків ІБ': 'Управління ризиками інформаційної безпеки',
    'Управління ризиками ІБ': 'Управління ризиками інформаційної безпеки',
    'Оновлення плану обробки ризиків': 'Управління ризиками інформаційної безпеки',

    # ОКБ
    'Забезпечення завчасне виявлення і реагування на події': 'Моніторинг та реагування на події та інциденти ІБ',
    'Забезпечення своєчасного виявлення та реагування на інциденти': 'Моніторинг та реагування на події та інциденти ІБ',
    'Забезпечення належного рівня захисту ІТ-інфраструктури': 'Управління безпекою обчислювальних систем',
    'Виявлення та усунення вразливостей': 'Управління безпекою інформаційних систем',
    'Захист компанії від кібератак': 'Управління безпекою інформаційних систем',
    'Пілотний проєкт системи виявлення': 'Моніторинг та реагування на події та інциденти ІБ',  # SOCRadar
    'Оновлення системи класу EDR': 'Моніторинг та реагування на події та інциденти ІБ',  # Crowdstrike

    # СВК
    'Забезпечення конфіденційності інформаційних активів': 'Захист даних',
    'Підготовка щомісячної звітності': 'Управлінська та організаційна діяльність',
    'Забезпечення дотримання вимог інформаційної безпеки на усіх етапах': 'Управління безпекою інформаційних систем',
}


def get_process_for_quarterly_task(task_text):
    """Визначити процес БД для завдання з квартального плану"""
    for pattern, process in QUARTERLY_PLAN_TO_PROCESS.items():
        if pattern.lower() in task_text.lower():
            return process
    return None


# === МАППІНГ: Квартальні завдання -> Річні цілі (annual_id) ===
QUARTERLY_TO_ANNUAL = {
    # СМУР
    'Організація проведення навчання': 'b232ef51-c54f-44ff-b925-99a85a28d0a0',  # Підвищення кваліфікації
    'Плановий перегляд нормативної документації': '7799e310-f6ec-4075-9b33-420eb1d8a02c',  # Документування
    'Обробка ризиків ІБ': '658db8e8-8b5f-4e31-8cc8-2d67c69c54d4',  # Діагностика процесів
    'Управління ризиками ІБ': '658db8e8-8b5f-4e31-8cc8-2d67c69c54d4',  # Діагностика процесів
    'Оновлення плану обробки ризиків': '658db8e8-8b5f-4e31-8cc8-2d67c69c54d4',  # Діагностика процесів

    # ОКБ
    'Забезпечення завчасне виявлення і реагування на події': '837054d1-51d2-4d19-96f7-e40a2cc75dc0',  # Завчасне виявлення
    'Забезпечення своєчасного виявлення та реагування на інциденти': '5b0c700b-9267-4fd0-93dc-525501cdc4af',  # Своєчасне виявлення
    'Забезпечення належного рівня захисту ІТ-інфраструктури': 'b33fd14d-8736-40f8-8c45-b68d78b917f4',  # Належний рівень захисту
    'Виявлення та усунення вразливостей': 'c75895f2-3f68-47ca-8cf5-3a32b9fe4278',  # Виявлення вразливостей
    'Захист компанії від кібератак': 'ad995098-977b-4166-b83e-838b48f6889c',  # Захист від кібератак
    'Пілотний проєкт системи виявлення': '837054d1-51d2-4d19-96f7-e40a2cc75dc0',  # SOCRadar -> Завчасне виявлення
    'Оновлення системи класу EDR': '5b0c700b-9267-4fd0-93dc-525501cdc4af',  # Crowdstrike -> Своєчасне виявлення

    # СВК
    'Забезпечення конфіденційності інформаційних активів': '1c010f2b-52e0-4133-adf7-4caea0ad172a',  # Забезпечення засобами ІБ
    'Підготовка щомісячної звітності': '7799e310-f6ec-4075-9b33-420eb1d8a02c',  # Документування
    'Забезпечення дотримання вимог інформаційної безпеки на усіх етапах': '2f7632f6-b79a-4a99-b268-a45d92065147',  # Захист на всіх етапах ЖЦ
}


def get_annual_id_for_quarterly_task(task_text):
    """Визначити annual_id для завдання з квартального плану"""
    for pattern, annual_id in QUARTERLY_TO_ANNUAL.items():
        if pattern.lower() in task_text.lower():
            return annual_id
    return None


# === КОМПАНИИ В БД ===
COMPANIES_DB = {
    'АТБ Енерго': 'ffdbad51-be9b-470e-a9bb-1eff1c6596a2',
    'АТБ Маркет': '805be13b-5cc8-4084-ab0b-3c45ca6e89e6',
    'Корпорація АТБ': '48a6e00b-ef2c-4d3e-bf58-e0d1be17f3c6',
    'КФ Квітень': '31d44859-64d5-4201-a36a-65d0e94e9cc8',
    'Логістік Юніон': '5c54315a-e43d-45e6-892f-480c2e0e5d84',
    'МФ Фаворит': 'd7129c09-dbb2-4da2-a6c4-f82b3fee298b',
    'Рітейл Девелопмент': 'a45d4458-aa01-4106-8202-675521854b21',
    'ЧП Транс Логистик': '6211ed9d-dc19-4026-ad1e-b049f2e3ee3d',
}

# === МАППИНГ: название из Excel -> название в БД (исправление опечаток) ===
COMPANY_MAPPING = {
    # Прямые совпадения
    'АТБ Енерго': 'АТБ Енерго',
    'АТБ Маркет': 'АТБ Маркет',
    'Корпорація АТБ': 'Корпорація АТБ',
    'КФ Квітень': 'КФ Квітень',
    'Логістік Юніон': 'Логістік Юніон',
    'МФ Фаворит': 'МФ Фаворит',
    'Рітейл Девелопмент': 'Рітейл Девелопмент',
    'ЧП Транс Логистик': 'ЧП Транс Логистик',

    # Исправление опечаток
    'АТБ-Маркет': 'АТБ Маркет',              # дефис -> пробел
    'ЧП Транс Логістик': 'ЧП Транс Логистик', # і -> и
    'Рітейл Девелопнент': 'Рітейл Девелопмент', # н -> м
    'КФ-Квітень': 'КФ Квітень',               # дефис -> пробел
}

# Маппинг сотрудников: короткое имя Excel -> user_id
EMPLOYEES = {
    # ОКБ
    'Казаков': 'bb9a7893-c095-4392-aa96-e5a788c9a02c',
    'Василиненко': 'c25aea05-63ee-414b-9b50-c31815c2221e',
    'Венгер': 'ef247c2d-bd70-44b8-bcce-2fc2a64c0dd0',
    'Карчевський': 'b3a29f62-b41e-4010-ae72-bd47a4a2b74f',
    'Мартинюк': '4140507f-00fb-4943-a4bb-cfdf0d2a5acc',
    'Стопінський': '0f5ceffa-3137-4d00-a84f-214aa67305a5',
    'Федяй': 'fb1a50ec-c120-42e9-84f0-aff028f7c9a5',
    'Шаферистов': 'd026e474-cce7-4023-9ac8-b2d1090793db',
    'Шленськовий': 'fc74ffb0-3589-48b8-a154-bd1038230a77',
    'Андрійчук': '874b95c2-ffad-43bf-8fb8-efa989037ebf',
    # СВК
    'Бондаренко': 'ba856d59-1b30-4bcb-8dcd-6821b97b0f1e',
    'Барановська': '4c63c960-7d05-4c09-9719-611f89a13c62',
    'Лобань Ю.': 'a88667cf-db05-4a52-8f5c-1f16878c3393',
    'Чмух': '3942dbf1-0740-4d44-8f08-23637b98cae2',
    # СМУР
    'Денисов К.': 'add0bce6-2446-47ee-b5d4-d82c837941dc',
    'Диковицький П.': 'd7063d6f-9845-46d7-94cd-d110ce5dd5e2',
    'Ігнатова К.': '71bb49b1-5980-414a-8ef3-67e409485f0c',
    'Куник С.': '1c85eb0c-dd58-459b-91eb-c8bc516f3c1c',
    'Сухоцька Р.': 'bd9faac0-9b72-4297-b159-f6d2a52a4aaa',
    'Нікітіна Є.': '865d9bb2-c054-405b-bc4e-8c74b9fb80f6',
}

# Колонки Excel
COL_PROCESS = 0
COL_MAIN_TASK = 1
COL_DEPT = 2
COL_EMPLOYEE = 3
COL_PLAN_HOURS = 4
COL_PLAN_DATE = 5
COL_TASK = 6
COL_FACT_DATE = 7
COL_DOC = 8
COL_NOTE = 9
COL_COMPANY = 10
COL_FACT_HOURS = 11


def get_process_id(excel_process, main_task=None):
    """Получить ID процесса из БД по названию из Excel

    Args:
        excel_process: название процесса из Excel
        main_task: основная задача (для исправления ошибок классификации)
    """
    if not excel_process:
        return None

    # Сначала проверяем исправления ошибок классификации
    if main_task and (excel_process, main_task) in PROCESS_FIXES:
        db_name = PROCESS_FIXES[(excel_process, main_task)]
        return PROCESSES_DB.get(db_name)

    # Потом пробуем точное совпадение через маппинг
    if excel_process in PROCESS_MAPPING:
        db_name = PROCESS_MAPPING[excel_process]
        return PROCESSES_DB.get(db_name)

    # Потом пробуем прямое совпадение с БД
    if excel_process in PROCESSES_DB:
        return PROCESSES_DB[excel_process]
    return None


def get_process_name(excel_process, main_task=None):
    """Получить название процесса БД по названию из Excel"""
    if not excel_process:
        return None

    # Сначала проверяем исправления ошибок классификации
    if main_task and (excel_process, main_task) in PROCESS_FIXES:
        return PROCESS_FIXES[(excel_process, main_task)]

    # Потом через маппинг
    if excel_process in PROCESS_MAPPING:
        return PROCESS_MAPPING[excel_process]

    # Потом прямое совпадение
    if excel_process in PROCESSES_DB:
        return excel_process
    return None


def get_company_id(excel_company):
    """Получить ID компании из БД по названию из Excel"""
    if not excel_company:
        return None
    # Сначала пробуем через маппинг (исправление опечаток)
    if excel_company in COMPANY_MAPPING:
        db_name = COMPANY_MAPPING[excel_company]
        return COMPANIES_DB.get(db_name)
    # Потом прямое совпадение
    if excel_company in COMPANIES_DB:
        return COMPANIES_DB[excel_company]
    return None


def main():
    SCRIPT_DIR = os.path.dirname(__file__)
    EXCEL_PATH = os.path.join(SCRIPT_DIR, '..', 'bdib2025.xlsx')
    OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'import')

    print(f'Loading: {EXCEL_PATH}')
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f'Total rows: {len(rows)}')

    # Собираем уникальные значения из Excel
    excel_depts = defaultdict(int)
    excel_employees = defaultdict(int)
    excel_processes = defaultdict(int)
    excel_companies = defaultdict(int)

    for row in rows:
        dept = str(row[COL_DEPT]).strip() if row[COL_DEPT] else None
        employee = str(row[COL_EMPLOYEE]).strip() if row[COL_EMPLOYEE] else None
        process = str(row[COL_PROCESS]).strip() if row[COL_PROCESS] else None
        company = str(row[COL_COMPANY]).strip() if row[COL_COMPANY] else None

        if dept:
            excel_depts[dept] += 1
        if employee:
            excel_employees[employee] += 1
        if process:
            excel_processes[process] += 1
        if company:
            excel_companies[company] += 1

    wb.close()

    # === АНАЛИЗ ОТДЕЛОВ ===
    print('\n' + '='*60)
    print('ОТДЕЛЫ (departments)')
    print('='*60)
    print(f'В Excel: {len(excel_depts)}, В БД: {len(DEPARTMENTS)}')

    unmatched_depts = []
    for dept, count in sorted(excel_depts.items(), key=lambda x: -x[1]):
        if dept in DEPARTMENTS:
            print(f'  ✅ {dept}: {count} -> {DEPARTMENTS[dept][:8]}...')
        else:
            print(f'  ❌ {dept}: {count} -> НЕТ В БД!')
            unmatched_depts.append(dept)

    # === АНАЛИЗ СОТРУДНИКОВ ===
    print('\n' + '='*60)
    print('СОТРУДНИКИ (employees)')
    print('='*60)
    print(f'В Excel: {len(excel_employees)}, В маппинге: {len(EMPLOYEES)}')

    unmatched_employees = []
    for emp, count in sorted(excel_employees.items(), key=lambda x: -x[1]):
        if emp in EMPLOYEES:
            print(f'  ✅ {emp}: {count} -> {EMPLOYEES[emp][:8]}...')
        else:
            print(f'  ❌ {emp}: {count} -> НЕТ В МАППИНГЕ!')
            unmatched_employees.append((emp, count))

    # === АНАЛИЗ ПРОЦЕССОВ ===
    print('\n' + '='*60)
    print('ПРОЦЕССЫ (processes)')
    print('='*60)
    print(f'В Excel: {len(excel_processes)}, В БД (уникальных): {len(PROCESSES_DB)}')
    print(f'Маппинг Excel->БД: {len(PROCESS_MAPPING)} правил')

    unmatched_processes = []
    for proc, count in sorted(excel_processes.items(), key=lambda x: -x[1]):
        process_id = get_process_id(proc)
        if process_id:
            db_name = PROCESS_MAPPING.get(proc, proc)
            print(f'  ✅ {proc[:50]}: {count}')
            print(f'      -> {db_name[:50]} ({process_id[:8]}...)')
        else:
            print(f'  ❌ {proc[:60]}: {count}')
            unmatched_processes.append((proc, count))

    # === АНАЛИЗ КОМПАНИЙ ===
    print('\n' + '='*60)
    print('КОМПАНИИ (companies)')
    print('='*60)
    print(f'В Excel: {len(excel_companies)}, В БД: {len(COMPANIES_DB)}')

    unmatched_companies = []
    for comp, count in sorted(excel_companies.items(), key=lambda x: -x[1]):
        company_id = get_company_id(comp)
        if company_id:
            db_name = COMPANY_MAPPING.get(comp, comp)
            if db_name != comp:
                print(f'  ⚠️ {comp}: {count} -> {db_name} ({company_id[:8]}...)')
            else:
                print(f'  ✅ {comp}: {count} -> {company_id[:8]}...')
        else:
            print(f'  ❌ {comp}: {count} -> НЕТ В БД!')
            unmatched_companies.append((comp, count))

    # === ИТОГИ ===
    print('\n' + '='*60)
    print('ИТОГИ')
    print('='*60)
    print(f'Отделы без маппинга: {len(unmatched_depts)}')
    print(f'Сотрудники без маппинга: {len(unmatched_employees)}')
    print(f'Процессы без маппинга: {len(unmatched_processes)}')
    print(f'Компании без маппинга: {len(unmatched_companies)}')

    if unmatched_employees:
        print('\n❌ НУЖНО ДОБАВИТЬ МАППИНГ ДЛЯ СОТРУДНИКОВ:')
        for emp, count in unmatched_employees:
            print(f'    "{emp}": "???",  # {count} записей')

    if unmatched_processes:
        print('\n❌ НУЖНО ДОБАВИТЬ МАППИНГ ДЛЯ ПРОЦЕССОВ:')
        for proc, count in unmatched_processes:
            print(f'    "{proc[:60]}": "???",  # {count} записей')

    if unmatched_companies:
        print('\n❌ НУЖНО ДОБАВИТЬ МАППИНГ ДЛЯ КОМПАНИЙ:')
        for comp, count in unmatched_companies:
            print(f'    "{comp}": "???",  # {count} записей')


if __name__ == '__main__':
    main()

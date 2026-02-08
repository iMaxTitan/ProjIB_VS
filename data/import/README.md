# Данные для импорта

Файлы CSV сгенерированы из `bdib2025.xlsx`.

## Файлы

| Файл | Отдел | Строк |
|------|-------|-------|
| `ОКБ.csv` | ОКБ | 12,520 |
| `СМУР.csv` | СМУР | 11,285 |
| `СВК.csv` | СВК | 2,113 |
| `all_data.csv` | Все | 25,918 |

## Структура CSV

```
process,main_task,department,employee,plan_hours,plan_date,task,fact_date,document,note,company,fact_hours,week
```

| Колонка | Описание | Пример |
|---------|----------|--------|
| process | Процесс | Управління документацією |
| main_task | Основна задача | Перегляд НД |
| department | Відділ | ОКБ |
| employee | Сотрудник | Шаферистов |
| plan_hours | План годин | 8 |
| plan_date | Планова дата (ISO) | 2025-01-06 |
| task | Задача | Аналіз документа |
| fact_date | Дата виконання (ISO) | 2025-01-07 |
| document | Документ | |
| note | Примітка | |
| company | Предприятие | Фоззі |
| fact_hours | Факт годин | 8 |
| week | Номер тижня | 2 |

## Регенерация

```bash
python scripts/excel_to_csv.py
```

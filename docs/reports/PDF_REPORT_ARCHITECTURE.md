# Архітектура генерації PDF звітів

## Огляд

Система генерує офіційні акти виконаних робіт (Додаток до Акту) для SOC-послуг з AI-форматуванням описів.

## Структура файлів

```
src/
├── app/api/reports/
│   ├── generate/route.ts          # API endpoint для генерації PDF
│   └── format-descriptions/route.ts # API для AI форматування (не використовується)
│
├── lib/services/
│   ├── pdf-report.service.ts      # ГОЛОВНИЙ: генерація PDF документів
│   ├── monthly-report.service.ts  # Типи та RPC виклики до Supabase
│   └── contract-services.ts       # Маппінг процесів та допоміжні функції
│
scripts/migrations/
└── fix_report_include_other_tasks.sql  # RPC функція get_company_report_data
```

## Потік даних

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   UI (Reports)  │────▶│  API /generate   │────▶│  RPC Supabase   │
│   page.tsx      │     │   route.ts       │     │  get_company_   │
└─────────────────┘     └──────────────────┘     │  report_data    │
                               │                 └─────────────────┘
                               │                         │
                               ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │ pdf-report.ts    │◀────│   JSON Data     │
                        │ generateCompany  │     │   (CompanyRe-   │
                        │ ReportPDF()      │     │   portData)     │
                        └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   AI API Call    │
                        │ (Claude/OpenAI)  │
                        └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   PDFKit        │
                        │   Buffer         │
                        └──────────────────┘
```

## Компоненти

### 1. RPC функція `get_company_report_data`

**Файл:** `scripts/migrations/fix_report_include_other_tasks.sql`

**Вхідні параметри:**
- `p_company_id` (UUID) - ID компанії
- `p_year` (INTEGER) - рік
- `p_month` (INTEGER) - місяць

**Повертає JSONB:**
```json
{
  "company": {
    "company_id": "uuid",
    "company_name": "string"
  },
  "period": {
    "year": 2025,
    "month": 12
  },
  "summary": {
    "tasks_count": 2079,
    "total_hours": 2616.5,
    "employees_count": 18,
    "plans_count": 45
  },
  "employees": [
    {
      "user_id": "uuid",
      "full_name": "string",
      "department_id": "uuid",
      "department_name": "string",
      "position": "string",
      "hours": 120.5
    }
  ],
  "processes": [
    {
      "process_id": "uuid",
      "process_name": "Моніторинг та реагування...",
      "hours": 783.0
    }
  ],
  "tasks": [
    {
      "task_id": "uuid",
      "description": "string",
      "spent_hours": 2.5,
      "completed_at": "timestamp",
      "employee_name": "string",
      "plan_name": "string",
      "process_name": "string"
    }
  ]
}
```

**Особливості:**
- `employees` - агреговані години по кожному співробітнику з відділом та посадою
- `processes` - агреговані години по кожному процесу (включає "Інші роботи")
- `tasks` - LIMIT 200 задач (для AI описів, сортовані по spent_hours DESC)

### 2. TypeScript типи

**Файл:** `src/lib/services/monthly-report.service.ts`

```typescript
interface CompanyReportData {
  company: { company_id: string; company_name: string };
  period: { year: number; month: number };
  summary: CompanyReportSummary;
  employees: EmployeeInReport[];
  processes: ProcessInReport[];
  tasks: TaskInReport[];
}

interface EmployeeInReport {
  user_id: string;
  full_name: string;
  hours: number;
  department_id?: string;
  department_name?: string;
  position?: string;
}

interface ProcessInReport {
  process_id: string;
  process_name: string;
  hours: number;
}
```

### 3. PDF генератор

**Файл:** `src/lib/services/pdf-report.service.ts`

**Головна функція:** `generateCompanyReportPDF(data: CompanyReportData): Promise<Buffer>`

**Структура PDF документа:**

| Сторінка | Розділ | Опис |
|----------|--------|------|
| 1 | Заголовок | "Додаток до Акту", "ЗВІТ", період, сторони |
| 1 | Зведена інформація | Загальні метрики (робіт, годин, фахівців) |
| 1 | Таблиця послуг | 4 колонки: №, Назва, Л/год, Фахівців |
| 2+ | Детальний опис | Кожен процес: заголовок, метрики, 4-6 абзаців |
| N | Залучені фахівці | Групування по відділах з посадами |
| N | Підписи | Від Виконавця / Від Замовника |

### 4. AI інтеграція

**Провайдери:**
- Anthropic Claude (claude-3-haiku-20240307) - пріоритетний
- OpenAI (gpt-4o-mini) - fallback

**Конфігурація (.env):**
```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

**Промпт для AI:**
```
Створи ДЕТАЛЬНІ описи виконаних робіт для офіційного акту.

ЗАМОВНИК: {companyName}

ПЕРЕЛІК ПОСЛУГ:
1. ПОСЛУГА: "{serviceName}"
   • Обсяг: {taskCount} задач
   • Трудовитрати: {totalHours} л/год
   • Фахівців: {employeesCount}
   ПРИКЛАДИ РОБІТ: ...

ВИМОГИ:
- 4-6 абзаців (400-600 слів) кожен опис
- Офіційно-діловий стиль
- Конкретні цифри

JSON відповідь: [{"serviceId": 1, "text": "..."}]
```

**Fallback:** Якщо AI недоступний, використовується `generateDetailedDescription()` з шаблонами.

### 5. Шрифти

**Шлях:** `public/fonts/`
- `Roboto-Regular.ttf` - основний текст
- `Roboto-Bold.ttf` - заголовки

**Важливо:** PDFKit потребує TTF шрифти для кирилиці.

## Конфігурація

### next.config.js

```javascript
{
  serverExternalPackages: ['pdfkit'], // Важливо для AFM файлів
}
```

### Розміри та відступи

```typescript
const PDF_CONFIG = {
  margin: 40,
  fontSize: {
    header: 11,
    title: 14,
    subtitle: 12,
    heading: 10,
    body: 9,
    small: 8,
    table: 8,
  }
};
```

## Можливі покращення

### 1. Дані
- [ ] Збільшити LIMIT для tasks (зараз 200)
- [ ] Додати розбивку по компаніях в RPC
- [ ] Кешувати AI відповіді

### 2. AI
- [ ] Використати claude-3-sonnet для кращої якості
- [ ] Batch запити для великих звітів
- [ ] Retry логіка при помилках API

### 3. PDF
- [ ] Додати логотипи компаній
- [ ] Графіки/діаграми (pie chart годин по процесах)
- [ ] Водяний знак
- [ ] Нумерація сторінок

### 4. UX
- [ ] Прев'ю PDF в браузері
- [ ] Вибір формату (PDF/DOCX/Excel)
- [ ] Кастомізація шаблону

## Тестування

```bash
# Перевірити RPC
node scripts/test_rpc.js

# Build
npm run build

# Генерація тестового PDF
curl -X POST https://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"company","id":"uuid","year":2025,"month":12}'
```

## Діагностика

**Логи в консолі сервера:**
```
[PDF] Процесів з агрегованими годинами: 8
[PDF] Запит AI форматування для 8 процесів
[PDF] AI повернув 8 описів
[API/reports/generate] PDF згенеровано, розмір: 125432
```

**Типові помилки:**
| Помилка | Причина | Рішення |
|---------|---------|---------|
| ENOENT Helvetica.afm | PDFKit шукає стандартні шрифти | serverExternalPackages: ['pdfkit'] |
| AI не повернув описи | Немає API ключа або помилка мережі | Перевірити .env, fallback працює |
| Години не співпадають | RPC має LIMIT або фільтри | Перевірити SQL функцію |

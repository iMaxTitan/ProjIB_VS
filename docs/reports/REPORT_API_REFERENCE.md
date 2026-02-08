# API Reference: Генерація звітів

## REST API

### POST /api/reports/generate

Генерує PDF звіт.

**Request:**
```json
{
  "type": "company" | "employee",
  "id": "uuid",
  "year": 2025,
  "month": 12
}
```

**Response:** `application/pdf` (binary)

**Помилки:**
- `400` - відсутні параметри
- `404` - дані не знайдено
- `500` - помилка генерації

---

## Supabase RPC

### get_company_report_data

```sql
SELECT * FROM get_company_report_data(
  p_company_id := 'uuid'::uuid,
  p_year := 2025,
  p_month := 12
);
```

### get_employee_report_data

```sql
SELECT * FROM get_employee_report_data(
  p_user_id := 'uuid'::uuid,
  p_year := 2025,
  p_month := 12
);
```

---

## TypeScript API

### pdf-report.service.ts

```typescript
// Генерація PDF для компанії
async function generateCompanyReportPDF(
  data: CompanyReportData
): Promise<Buffer>

// Генерація PDF для співробітника
async function generateEmployeeReportPDF(
  data: EmployeeReportData
): Promise<Buffer>
```

### monthly-report.service.ts

```typescript
// Отримати дані для звіту компанії
async function getCompanyReportData(
  companyId: string,
  year: number,
  month: number
): Promise<CompanyReportData | null>

// Отримати дані для звіту співробітника
async function getEmployeeReportData(
  userId: string,
  year: number,
  month: number
): Promise<EmployeeReportData | null>

// Отримати список доступних звітів
async function getAvailableCompanyReports(
  year?: number,
  month?: number
): Promise<MonthlyReportListItem[]>
```

### contract-services.ts

```typescript
// Групування задач по процесах
function groupTasksByProcess(
  tasks: TaskInReport[]
): Map<string, ProcessGroup>

// Підготовка даних для AI
function prepareProcessDataForAI(
  tasksByProcess: Map<string, ProcessGroup>
): TaskDataForAI[]

// Знайти послугу по ключовим словам
function findServiceByKeywords(
  text: string
): ContractService | undefined
```

---

## Типи даних

### CompanyReportData

```typescript
interface CompanyReportData {
  company: {
    company_id: string;
    company_name: string;
  };
  period: {
    year: number;
    month: number;
  };
  summary: {
    tasks_count: number;
    total_hours: number;
    employees_count: number;
    plans_count: number;
  };
  employees: EmployeeInReport[];
  processes: ProcessInReport[];
  tasks: TaskInReport[];
}
```

### EmployeeInReport

```typescript
interface EmployeeInReport {
  user_id: string;
  full_name: string;
  hours: number;
  department_id?: string;
  department_name?: string;
  position?: string;
}
```

### ProcessInReport

```typescript
interface ProcessInReport {
  process_id: string;
  process_name: string;
  hours: number;
}
```

### TaskInReport

```typescript
interface TaskInReport {
  task_id: string;
  description: string;
  spent_hours: number;
  completed_at: string;
  employee_name?: string;
  plan_name?: string;
  process_name?: string;
  company_names?: string[];
}
```

### TaskDataForAI

```typescript
interface TaskDataForAI {
  serviceName: string;
  serviceId: number;
  categoryName: string;
  taskCount: number;
  totalHours: number;
  employees: string[];
  taskDescriptions: string[];
  processName?: string;
}
```

---

## Приклад використання

```typescript
import { getCompanyReportData } from '@/lib/services/monthly-report.service';
import { generateCompanyReportPDF } from '@/lib/services/pdf-report.service';

// 1. Отримати дані
const data = await getCompanyReportData(
  'company-uuid',
  2025,
  12
);

if (!data) {
  throw new Error('Дані не знайдено');
}

// 2. Згенерувати PDF
const pdfBuffer = await generateCompanyReportPDF(data);

// 3. Відправити клієнту
return new Response(pdfBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="report.pdf"'
  }
});
```

---

## Змінні середовища

```bash
# AI провайдер (anthropic або openai)
AI_PROVIDER=anthropic

# API ключі
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

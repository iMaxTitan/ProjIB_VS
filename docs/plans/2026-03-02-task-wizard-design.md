# Дизайн: Додавання щоденних задач через Telegram-бот

**Дата:** 2026-03-02
**Статус:** Затверджено, готово до реалізації
**Канал:** Telegram (Teams — окремо, пізніше)

---

## Мета

Дозволити співробітнику додавати щоденну задачу (списання годин) прямо з Telegram-бота, без відкриття веб-інтерфейсу.

---

## Що НЕ входить в scope

- Місячні плани (створення, редагування) — залишаються у веб-інтерфейсі
- Teams — окрема задача після MVP
- Редагування / видалення вже доданих задач
- Вибір дати (завжди сьогодні)

---

## Стан-машина (6 кроків)

```
[➕ Завдання]
      ↓
SELECT_PROCESS      → inline-кнопки по групах процесів
      ↓ (пропускається якщо процес один)
SELECT_PLAN         → inline-кнопки з планами + прогрес годин
      ↓ (пропускається якщо план один)
INPUT_DESCRIPTION   → кнопка-шаблон АБО «Написати своє»
      ↓ (якщо своє → чекаємо текст від користувача)
INPUT_HOURS         → чекаємо текст-число від користувача
      ↓
CONFIRM             → картка + [✅ Підтвердити] [❌ Скасувати]
      ↓
DONE                → збережено, сесія очищена
```

---

## UX-приклад діалогу

```
Бот: Оберіть напрямок роботи:
     [🖥 Адміністрування] [📡 Мережі] [🔧 Обслуговування]

Бот: Оберіть план:
     [📋 Сервери ТОВ Альфа  2/8г]
     [📋 Backup щоденний    0/2г]
     [📋 Оновлення ПЗ       1/4г]

Бот: Опис задачі:
     [📝 «Обслуговування серверів»] [✏️ Написати своє]

Бот: Скільки годин витрачено? (напр. 3 або 1.5)
Юзер: 3

Бот: ✅ Підтвердження
     📅 05.03.2026 | План: Сервери ТОВ Альфа
     📝 Обслуговування серверів | ⏱ 3 год
     [✅ Підтвердити] [❌ Скасувати]

Бот: ✅ Задачу додано!
```

**Ключове UX-рішення:** бот **редагує одне повідомлення** на кожному кроці (`editMessageText`) — не засмічує чат. Тільки фінальний «Задачу додано ✅» — нове повідомлення.

---

## Зберігання стану

```typescript
interface TaskWizardState {
  step: 'select_process' | 'select_plan' |
        'input_description' | 'input_hours' | 'confirm';
  processId?: string;
  processName?: string;
  planId?: string;
  planTitle?: string;
  procedureName?: string;   // для шаблону опису
  description?: string;
  hours?: number;
  wizardMessageId?: number; // ID повідомлення для editMessageText
  expiresAt: number;        // Date.now() + 10 хв
}

// Ключ = chatId (string), незалежно від conversation memory
const wizardSessions = new Map<string, TaskWizardState>();
```

TTL: 10 хвилин (якщо не завершив — сесія очищується автоматично).

---

## Завантаження планів

```sql
SELECT
  mp.monthly_plan_id,
  mp.title,
  mp.planned_hours,
  pr.name      AS procedure_name,
  ps.process_id,
  ps.name      AS process_name,
  COALESCE(SUM(dt.spent_hours), 0) AS spent_hours
FROM monthly_plans mp
JOIN monthly_plan_assignees mpa ON mpa.monthly_plan_id = mp.monthly_plan_id
JOIN quarterly_plans qp         ON qp.quarterly_plan_id = mp.quarterly_id
JOIN processes ps                ON ps.process_id = qp.process_id
JOIN procedures pr               ON pr.procedure_id = mp.procedure_id
LEFT JOIN daily_tasks dt         ON dt.monthly_plan_id = mp.monthly_plan_id
WHERE mpa.user_id = :userId
  AND mp.year  = :year
  AND mp.month = :month
  AND mp.status = 'active'
GROUP BY mp.monthly_plan_id, pr.name, ps.process_id, ps.name
```

Результат групується: `Map<processName, Plan[]>` перед показом кнопок.

---

## Файлова структура

### Нові файли

```
src/lib/bot/telegram/task-wizard/
  ├── session.ts     ← Map<chatId, WizardState> + TTL cleanup
  ├── queries.ts     ← завантаження планів співробітника
  ├── steps.ts       ← handleTaskCallback() + handleWizardTextInput()
  └── index.ts       ← barrel export
```

### Зміни в існуючих файлах

| Файл | Зміна |
|------|-------|
| `src/lib/bot/telegram/bot.ts` | Перехват тексту для візарда (перед AI-роутером) + обробка `task:*` callback |
| `src/lib/bot/telegram/direct-router.ts` | Реєстрація кнопки ➕ як прямої команди (`task:start`) |
| `src/components/dashboard/activity/ActivityContent.tsx` | Запис у changelog |

### НЕ потрібно

- Нові API-роути
- Зміни в `lib/bot/core/registry.ts` (не BotTool)
- Зміни в Teams

---

## Збереження задачі

Прямий виклик існуючого сервісу без API-роута:

```typescript
import { manageDailyTask } from '@/lib/ops/plans/write';

await manageDailyTask({
  action: 'create',
  monthlyPlanId: wizard.planId,
  userId,
  taskDate: new Date().toISOString().slice(0, 10), // сьогодні
  description: wizard.description,
  spentHours: wizard.hours,
});
```

---

## Callback data схема

| Дія | callback_data |
|-----|--------------|
| Старт візарда | `task:start` |
| Вибір процесу | `task:process:{processId}` |
| Вибір плану | `task:plan:{planId}` |
| Шаблон опису | `task:desc:template` |
| Свій опис | `task:desc:custom` |
| Підтвердити | `task:confirm` |
| Скасувати | `task:cancel` |

---

## Граничні випадки

| Ситуація | Поведінка |
|----------|-----------|
| Нема активних планів | «У вас немає активних планів на березень» |
| Один процес | Крок SELECT_PROCESS пропускається |
| Один план | Крок SELECT_PLAN пропускається |
| Не число в полі годин | «Введіть число, напр. 3 або 1.5» — повторна спроба |
| Години = 0 або > 24 | Валідаційна помилка, повторна спроба |
| TTL сесії вийшов | «Сесію скасовано. Почніть знову: ➕ Завдання» |
| План став неактивним до підтвердження | Помилка при збереженні, бот повідомляє |

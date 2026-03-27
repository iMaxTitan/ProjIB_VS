# Модуль "Законодавство" в Базі знань

> Дата: 2026-03-25
> Статус: approved

## Цель

Новая вкладка "Законодавство" в разделе "База знаний" для поиска, импорта и управления законами Украины и связанными подзаконными актами в RAG.

## Архитектура

### Микросервис law-fetcher (DB VPS, порт 3100)

Express, 4 эндпоинта. Playwright для работы с zakon.rada.gov.ua.

- `POST /search` — поиск по запросу → `[{ title, url, docNumber, date, docType }]`
- `POST /fetch` — скачивание + конвертация в MD → `{ title, markdown, charCount, lineCount }`
- `POST /related` — парсинг вкладки "Зв'язки" → `[{ title, url, docNumber, date, docType, relation }]`
- `POST /check-update` — дата останньої редакції → `{ lastRevisionDate }`

Авторизация: `X-Service-Key` (внутренняя сеть 10.0.0.x).

### API Routes (App VPS)

- `POST /api/kb/laws/search` — проксирует /search
- `POST /api/kb/laws/fetch` — проксирует /fetch
- `POST /api/kb/laws/related` — проксирует /related
- `POST /api/kb/laws/check-update` — проксирует /check-update
- `POST /api/kb/laws/import` — основной: fetch → шапка → kb_documents → валідація → чанкінг → ембеддінг
- `GET /api/kb/laws` — список законів з KB (группировка parent-children)

Все: isRequestAuthorized + getDbUserId + rate limit.

### UI

- `KBLawsContent.tsx` — вкладка, две зоны
- `LawSearchPanel.tsx` — поиск + результаты + зв'язки с чекбоксами + "Імпортувати обрані"
- `LawLibraryTable.tsx` — таблица-дерево (закон → постанови → зміни), статусы обновлений
- `LawImportProgress.tsx` — прогресс-бар автоматического импорта

### Hooks

- `useLawSearch.ts` — поиск + related
- `useLawLibrary.ts` — список + check-update
- `useLawImport.ts` — импорт + прогресс

## Data Flow

### Импорт нового закона

1. Пользователь вводит запрос → search → результаты
2. Выбирает документ → автоматически related → список постанов с чекбоксами
3. "Імпортувати обрані" → для каждого:
   - fetch → MD с шапкой (тип, номер, зв'язки)
   - Сохранение в kb_documents с metadata (doc_type, doc_number, source_url, related_docs, fetched_at)
   - Валідація → чанкінг → ембеддінг
   - Прогресс: "Імпортовано 2/4..."

### Проверка обновлений

1. "Перевірити оновлення" → для каждого документа check-update
2. Сравнение lastRevisionDate с metadata.fetched_at
3. Если новее → жёлтый статус, кнопка "Оновити" → переимпорт

## Метаданные документов

```json
{
  "doc_type": "Закон України | Постанова КМУ | Наказ",
  "doc_number": "3543-XII",
  "source_url": "https://zakon.rada.gov.ua/laws/show/3543-12",
  "related_docs": ["uuid-1", "uuid-2"],
  "parent_doc_id": "uuid-parent",
  "fetched_at": "2026-03-25"
}
```

## Шапка MD для RAG

```markdown
# Назва документа

> **Тип:** Закон України
> **Номер:** 3543-XII від 21.10.1993
> **Редакція:** актуальна станом на 25.03.2026
> **Джерело:** https://zakon.rada.gov.ua/laws/show/3543-12
> **Пов'язані акти:** КМУ №76 (бронювання), КМУ №560 (призов)
```

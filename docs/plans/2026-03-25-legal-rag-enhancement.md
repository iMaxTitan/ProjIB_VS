# Legal RAG Enhancement — збагачення пошуку юридичних документів

> Дата: 2026-03-25
> Статус: approved

## Проблема
Бот не знаходить юридичні чанки без contextual prefix. Запити побутовою мовою не матчать юридичну термінологію. Зв'язки між законами і постановами не використовуються при пошуку.

## Три рівні покращення

### Рівень 1 — Збагачений embedding
- `buildContextualContent` додає doc_type, doc_number, parent_law, related_acts в embedding текст
- Для ВСІХ категорій (legal, ib, hr, it) де є metadata
- Потребує reindex після зміни

### Рівень 2 — Cross-reference retrieval
- В search.ts після rerank — підтягнути чанки зі зв'язаних документів (parent_doc_id, related_docs)
- Max 4 додаткових чанки, visited set проти циклів
- Для всіх категорій де є зв'язки

### Рівень 3 — Query expansion через metadata
- Детерміністично (без AI): якщо перші результати legal → витягти related doc_numbers → додати в пошук
- Без галюцинацій номерів документів

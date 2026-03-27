---
name: git-workflow
description: "Правила git workflow для проекта CS Platform. Коммиты, ветки, PR. Используй при /commit, создании PR, git push, и любых git-операциях. Обязательно используй когда пользователь говорит 'закоммить', 'сделай коммит', 'пуш', 'создай ветку', 'PR' — этот скилл определяет формат сообщений и правила."
---

# Git Workflow — проект CS Platform

## Ветки

| Ветка | Назначение |
|-------|-----------|
| `main` | Продакшн. Деплой автоматический. |
| `feature/*` | Новая фича. Мержится в main через PR. |
| `fix/*` | Багфикс. Мержится в main через PR. |
| `refactor/*` | Рефакторинг без изменения поведения. |

## Формат коммитов

### Conventional Commits (обязательно)

```
<type>: <описание на украинском или русском>

[Тело — опционально, детали изменений]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Типы коммитов

| Тип | Когда |
|-----|-------|
| `feat` | Новая функциональность |
| `fix` | Исправление бага |
| `refactor` | Рефакторинг без изменения поведения |
| `perf` | Оптимизация производительности |
| `docs` | Только документация |
| `style` | Форматирование, пробелы (без изменения логики) |
| `chore` | Обновление зависимостей, конфиги |
| `test` | Добавление/изменение тестов |

### Примеры

```
feat: KPI система — розрахунок по формулі actual/planned × 100%

fix: PDF звіт — виправлено дату договору з company_infrastructure

refactor: measures → procedures (rename таблиці + 25 файлів)

perf: v_monthly_plan_hours view замість 21K row запитів

docs: оновлено DEVELOPER_GUIDE — секція KPI формули
```

## Правила коммитов

### 1. Атомарность
- **Один коммит = одно логическое изменение**
- НЕ мешать фичу + рефакторинг + фикс в одном коммите
- Миграции БД — отдельный коммит (или включены в feat если неразрывно связаны)

### 2. Что коммитить
```bash
# ✅ Добавляем конкретные файлы
git add src/components/kpi/KPIGauge.tsx src/hooks/useKPI.ts

# ❌ НЕ делать
git add -A          # Может захватить .env, секреты
git add .           # То же самое
```

### 3. Что НИКОГДА не коммитить
- `.env`, `.env.local`, `.env.test` — секреты
- `node_modules/` — зависимости
- `.next/` — билд артефакты
- `tests/.auth/` — сохранённые сессии
- `*.pem`, `*.key` — сертификаты
- `tsconfig.tsbuildinfo` — кеш TS (в .gitignore)

### 4. Перед коммитом — проверки
```bash
# Проверить что пойдёт в коммит
git status
git diff --staged

# Typecheck
npx tsc --noEmit

# Build (если значительные изменения)
npm run build
```

## Создание PR

### Формат

```
Title: feat: Короткое описание (до 70 символов)

Body:
## Summary
- Что сделано (1-3 пункта)

## Test plan
- [ ] Проверить X
- [ ] Проверить Y

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Правила PR
- PR всегда в `main` (если не указано иное)
- Один PR = одна фича/фикс
- Push с `-u` для нового бранча
- Обязательно `git diff main...HEAD` перед созданием PR

## Опасные команды — ЗАПРЕЩЕНЫ без явного запроса

```bash
# ❌ НИКОГДА без прямой просьбы пользователя
git push --force
git reset --hard
git checkout .
git clean -f
git branch -D
```

## Типичный workflow

```bash
# 1. Создать ветку (если нужна)
git checkout -b feature/kpi-system

# 2. Работа...

# 3. Проверка
git status
git diff

# 4. Stage конкретных файлов
git add src/hooks/useKPI.ts src/app/api/kpi/route.ts

# 5. Коммит с HEREDOC
git commit -m "$(cat <<'EOF'
feat: KPI система — розрахунок по формулі actual/planned × 100%

- Три рівні: employee (місяць), head (квартал), chief (рік)
- Bench: unique_employees × norm (70%)
- Пороги: ≥130% amber, ≥100% green, ≥70% orange, <70% red

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

# 6. Push + PR (если нужно)
git push -u origin feature/kpi-system
gh pr create --title "feat: KPI система" --body "..."
```

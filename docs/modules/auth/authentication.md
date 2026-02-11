# Модуль авторизации

> Последнее обновление: 2026-02-11

## 1. Область модуля

Авторизация в ReportIB объединяет:

- Microsoft 365 / Azure AD (MSAL)
- резолвинг профиля в Supabase через `v_user_details`

Цель:

- корпоративный вход + прикладной контекст роли/департамента

## 2. Основные файлы

- `src/lib/auth/index.ts`
- `src/lib/auth/config.ts`
- `src/middleware.ts`
- `src/app/login/page.tsx`

## 3. Рабочий поток

1. пользователь проходит вход через MSAL (`loginRedirect`)
2. приложение получает Azure identity и access token
3. по email ищется внутренний профиль в `v_user_details`
4. формируется `UserInfo` (`user_id`, role, department и т.д.)
5. токен синхронизируется в серверную cookie (`/api/auth/token`)
6. защищенные маршруты проходят проверку middleware

## 4. Клиентский контракт (`useAuth`)

`useAuth()` возвращает:

- `user`
- `isLoading`
- `error`
- `isAuthenticated`
- `authErrorType`
- `login()`
- `logout()`
- `getToken()`
- `refreshToken()`

## 5. Кэш и сессия

- кэш пользователя в localStorage (`auth_user_cache`)
- TTL кэша пользователя: 5 минут
- периодический refresh встроен в хук авторизации
- серверная cookie авторизации синхронизируется для защиты API и middleware

## 6. Важные правила

1. `useAuth()` — единый источник состояния авторизации в страницах/оболочке приложения
2. в доменной логике использовать `user.user_id` (Supabase id)
3. не использовать Azure account id как доменный идентификатор
4. если пользователь есть в Azure, но отсутствует в Supabase, доступ запрещается

## 7. Известные типы ошибок авторизации

- `interaction_required`
- `supabase_user_not_found`
- `other`

## 8. Связанные документы

- `docs/DEVELOPER_GUIDE.md`
- `docs/database/SCHEMA.md`





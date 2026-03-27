# APP_ENV guard for Supabase migrations

Use a DB-level setting to mark environment and block unsafe migrations in production.

## 1) Set environment flag in each DB

Run once per environment:

```sql
-- dev DB
ALTER DATABASE postgres SET app.settings.app_env = 'dev';

-- stage DB
ALTER DATABASE postgres SET app.settings.app_env = 'stage';

-- prod DB
ALTER DATABASE postgres SET app.settings.app_env = 'prod';
```

Open a new SQL session after changing this setting.

## 2) Verify current value

```sql
SELECT current_setting('app.settings.app_env', true) AS app_env;
```

Expected values: `dev`, `stage`, `prod`.

## 3) Behavior

Migrations that intentionally create permissive `anon` policies now include a guard:

- `supabase/migrations/20260211_fix_rls_and_security_definer_views.sql`
- `supabase/migrations/20260212_enable_rls_missing_tables.sql`

They will fail immediately when `app.settings.app_env = 'prod'`.

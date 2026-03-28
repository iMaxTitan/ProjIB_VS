/**
 * Централизованная конфигурация из environment variables.
 * ЕДИНСТВЕННЫЙ файл в проекте где разрешён process.env (server-side).
 *
 * Исключения (Next.js constraint — NEXT_PUBLIC_* должны быть inline):
 *   - src/lib/shared/supabase.ts — uses /api/db proxy (no env vars needed)
 *   - src/lib/shared/auth/config.ts — NEXT_PUBLIC_AZURE_* (client-side MSAL)
 *   - src/lib/shared/logger.ts  — NODE_ENV (нужен до инициализации config)
 */

export const config = {
  db: {
    url:            process.env.NEXT_PUBLIC_API_URL ?? '',
    /** Direct PostgREST URL for server-side (bypasses HTTPS proxy loop) */
    serverUrl:      process.env.POSTGREST_URL || process.env.NEXT_PUBLIC_API_URL || '',
    anonKey:        process.env.POSTGREST_ANON_KEY ?? '',
    serviceRoleKey: process.env.POSTGREST_SERVICE_KEY ?? '',
    jwtSecret:      process.env.POSTGREST_JWT_SECRET ?? '',
  },

  azure: {
    tenantId:     process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ?? '',
    clientId:     process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    baseUrl:      process.env.NEXT_PUBLIC_BASE_URL ?? '',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
  },

  voyage: {
    apiKey: process.env.VOYAGE_API_KEY ?? '',
  },

  telegram: {
    botToken:      process.env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    encryptionKey: process.env.TELEGRAM_ENCRYPTION_KEY ?? '',
  },

  microsoft: {
    appId:       process.env.MICROSOFT_APP_ID ?? '',
    appPassword: process.env.MICROSOFT_APP_PASSWORD ?? '',
  },

  elevenlabs: {
    apiKey:        process.env.ELEVENLABS_API_KEY ?? '',
    agentId:       process.env.ELEVENLABS_AGENT_ID ?? '',
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET ?? '',
    signingSecret: process.env.ELEVENLABS_SIGNING_SECRET ?? '',
  },

  app: {
    nodeEnv:          process.env.NODE_ENV ?? 'development',
    cronSecret:       process.env.CRON_SECRET ?? '',
    aiProvider:       process.env.AI_PROVIDER ?? 'anthropic',
    voiceBotEnabled:  process.env.VOICE_BOT_ENABLED === 'true',
  },

  executor: {
    name:           process.env.EXECUTOR_NAME ?? 'ТОВ "Центр кібербезпеки"',
    representative: process.env.EXECUTOR_REPRESENTATIVE ?? '',
    position:       process.env.EXECUTOR_POSITION ?? 'Директор',
  },
} as const;

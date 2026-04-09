---
paths:
  - "src/lib/**/*.ts"
  - "src/app/api/**/*.ts"
  - "src/hooks/**/*.ts"
  - "src/components/**/*.tsx"
---

# Task Map — Which Files to Edit

## Dashboard layout and section shell
```
src/app/page.tsx                             ← main authenticated shell on `/`
src/components/dashboard/DashboardContent.tsx ← section switcher/content host
src/components/dashboard/sections.tsx        ← path/section mapping
src/components/navigation/HorizontalNav.tsx  ← top navigation
src/components/dashboard/shared/ThreePanelLayout.tsx ← default desktop multi-panel layout
src/components/dashboard/shared/TwoPanelLayout.tsx   ← simpler/legacy split layout only
```

## Add new bot tool
```
lib/<domain>/bot-adapter.ts        ← new tool (follow kpi/bot-adapter.ts pattern)
lib/bot/core/registry.ts           ← register (import from domain/bot-adapter)
lib/bot/core/permissions.ts        ← add roles
lib/bot/shared/                    ← format helpers (esc, fmtHours, miniBar, ...)
```

## Telegram bot
```
lib/bot/telegram/bot.ts            ← webhook handler, menu builder
lib/bot/telegram/direct-router.ts  ← direct commands (buttons without AI)
lib/bot/telegram/ai-router.ts      ← AI routing via runBotRouter()
app/api/telegram/webhook/route.ts  ← entry point
```

## Teams bot
```
lib/bot/teams/bot.ts               ← CloudAdapter handler
lib/bot/teams/direct-router.ts     ← direct commands
lib/bot/teams/ai-router.ts         ← AI routing
app/api/teams/webhook/route.ts     ← entry point
```

## KB search (independent system)
```
lib/kb/bot-adapter.ts              ← bot integration (kbSearchTool)
lib/kb/search.ts                   ← searchAndAnswer() — core logic
lib/kb/embedder.ts                 ← embedding (Voyage)
lib/kb/chunker.ts                  ← chunking strategy
lib/kb/processor.ts                ← parse → chunk → embed → store
components/dashboard/kb/           ← UI
app/api/kb/                        ← API endpoints
```

## Reports
```
lib/ops/reports/                   ← data + generation
lib/ops/reports/bot-adapter.ts     ← bot integration
lib/ops/reports/pdf*.ts            ← PDF rendering (PDFKit)
components/dashboard/reports/      ← UI
app/api/reports/                   ← API endpoints
```

## KPI
```
lib/ops/kpi/service.ts             ← calculation logic
hooks/useKPI.ts                    ← client-side query
components/dashboard/kpi/          ← UI
app/api/kpi/route.ts               ← API endpoint
```

## Plans
```
lib/ops/plans/                     ← CRUD operations
hooks/usePlans.ts                  ← client-side state
components/dashboard/plans/        ← UI views
components/dashboard/plans/v2/     ← active complex plans UI and three-panel work surfaces
components/dashboard/plans/details/ ← older Monthly/Quarterly/Annual details areas where still used
```

## Auth
```
lib/shared/auth/                   ← MSAL + JWT + session
app/api/auth/token/route.ts        ← JWT generation
hooks/useAuthRefresh.ts            ← Token refresh (40min)
```

## References
```
components/dashboard/references/   ← UI tabs + subfolders (calendar/, companies/, employees/, procedures/)
hooks/useCompanies.ts, useEmployees.ts
lib/ops/reference-queries.ts       ← SQL helpers
```

## Shared dashboard UI
```
src/components/dashboard/shared/   ← canonical shared UI building blocks
ThreePanelLayout.tsx               ← default desktop pattern for list/work area/details
TwoPanelLayout.tsx                 ← secondary pattern for simpler split screens
DashboardTopTabs.tsx               ← section and sub-section tabs
FilterBar.tsx                      ← search and filter header
GradientDetailCard.tsx             ← header/detail emphasis card
ReportTableStyles.ts               ← report table styling helpers
```

## Bot settings (UI)
```
components/dashboard/bot/BotSettingsContent.tsx
app/api/bot/notification-channel/route.ts
```

## Diagnostics
```
lib/shared/logger.ts               ← structured logging
app/api/debug/                     ← debug endpoints
App VPS: ssh -i ~/.ssh/id_nas root@91.99.156.163 'pm2 logs cs-platform --lines 50 --nostream'
```

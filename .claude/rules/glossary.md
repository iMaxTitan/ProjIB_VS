# Глоссарий — Русские термины → файлы проекта

> Когда пользователь упоминает модуль/функцию на русском — сразу иди в указанные файлы.
> Не ищи по всему проекту — используй эту карту.

## База знаний / БЗ / KB / Knowledge Base

| Термин | Файлы |
|--------|-------|
| **валидатор** (БЗ), проверка документов | `lib/kb/validator.ts`, `lib/kb/validator-checks.ts`, `lib/kb/validator-stats.ts` |
| валидатор UI | `components/dashboard/kb/KBValidatorContent.tsx`, `KBValidatorChat.tsx` |
| валидатор API | `app/api/kb/validate/` (route, chat/, download/, index/, normalize/) |
| **нормализатор**, нормализация | `lib/kb/normalizer.ts` |
| нормализатор UI | `components/dashboard/kb/KBNormalizerPanel.tsx`, `KBNormalizerIndexForm.tsx` |
| **поиск** (БЗ), RAG, ответы на вопросы | `lib/kb/search.ts`, `lib/kb/synthesizer.ts`, `lib/kb/reranker.ts` |
| эмбеддинги, индексация, Voyage | `lib/kb/embedder.ts` |
| чанкинг, разбивка документов | `lib/kb/chunker.ts`, `lib/kb/table-converter.ts` |
| загрузка документов, парсинг | `lib/kb/processor.ts`, `lib/kb/processor-html.ts` |
| **bold heading detection**, smart parser | `lib/kb/processor-html.ts:detectBoldHeadings()` |
| **Document Guide v2**, гайд | `docs/Document_Guide_v2.md` |
| документы (БЗ) UI | `components/dashboard/kb/KBContent.tsx` |
| документы (БЗ) API | `app/api/kb/documents/` |
| аналитика запросов (БЗ) | `lib/kb/analytics.ts`, `app/api/kb/query-log/` |
| кластеры, gap-анализ | `app/api/kb/clusters/`, `app/api/kb/gap-analysis/` |
| категории (БЗ) | `app/api/kb/categories/` |
| транслятор запросов | `lib/kb/query-translator.ts` |
| DOCX-экспорт (БЗ) | `lib/kb/docx-builder.ts` |
| бот + БЗ, kbSearchTool | `lib/kb/bot-adapter.ts` |
| **локатори**, мета-запит, пошук по статті | `lib/kb/search-locators.ts` |
| **законодавство**, закони, законы, law-fetcher | `lib/ops/laws/fetcher-client.ts`, `app/api/kb/laws/` |
| законодавство UI | `components/dashboard/kb/KBLawsContent.tsx`, `LawSearchPanel.tsx`, `LawLibraryTable.tsx`, `LawChildUploadModal.tsx` |
| повнота законів, completeness | `app/api/kb/laws/completeness/`, `hooks/useLawLibrary.ts:checkCompleteness` |
| законодавство хуки | `hooks/useLawSearch.ts`, `hooks/useLawLibrary.ts`, `hooks/useLawImport.ts` |
| law-fetcher мікросервіс | `law-fetcher/` (Express, DB VPS порт 3100, Playwright) |
| контекстний префікс, contextual prefix | `lib/kb/contextual-prefix.ts` |

## Планы / Планирование

| Термин | Файлы |
|--------|-------|
| **планы** (общее) | `lib/ops/plans/` (service-core, read, write, delete, status) |
| **план 2**, plans v2 | `components/dashboard/plans/v2/PlansV2Content.tsx` |
| план 2 матрица | `docs/plans/plans-v2-matrix.md` |
| план 2 звіт по процесу | `components/dashboard/plans/v2/ProcessReportView.tsx` |
| план 2 деталі плану | `components/dashboard/plans/v2/PlanDetailPanel.tsx`, `PlanDetailView.tsx` |
| план 2 список процесів | `components/dashboard/plans/v2/ProcessListPanel.tsx` |
| план 2 річні плани | `components/dashboard/plans/v2/AnnualPlanViews.tsx` |
| план 2 квартальні плани | `components/dashboard/plans/v2/QuarterlyPlanViews.tsx` |
| план 2 місячні плани | `components/dashboard/plans/v2/MonthlyPlanViews.tsx` |
| план 2 співробітники | `components/dashboard/plans/v2/EmployeeTasksPanel.tsx` |
| план 2 хуки | `hooks/usePlansV2.ts`, `hooks/usePlansV2Detail.ts` |
| план 2 API статус | `app/api/plans/status/route.ts` |
| план 2 API місячний | `app/api/plans/monthly/route.ts` |
| месячный план | `lib/ops/plans/monthly-mappers.ts`, `monthly-plan-helpers.ts` |
| месячный план UI | `components/dashboard/plans/details/MonthlyPlanDetails.tsx` |
| квартальный план | `lib/ops/plans/quarterly-fetcher.ts`, `quarterly-mappers.ts` |
| квартальный план UI | `components/dashboard/plans/details/QuarterlyPlanDetails.tsx` |
| годовой план | `components/dashboard/plans/details/AnnualPlanDetails.tsx` |
| копирование плана | `hooks/usePlanCopy.ts`, `components/.../PlanCopyModal.tsx` |
| задачи (ежедневные) | `lib/ops/tasks/task-service.ts`, `hooks/useTaskOps.ts` |
| задачи UI | `components/dashboard/plans/Tasks/` (AddTaskModal и др.) |
| **accept/reject задач**, прийняти/відхилити | `hooks/planning/useMonthlyPlanHandlers.ts` (handleAcceptTask/handleRejectTask), `components/.../PlanWorkLog.tsx` |
| задачи source, бейдж CHIEF/HEAD | `PlanWorkLog.tsx`, `AddTaskModal.tsx` (creatorRole prop) |
| фильтры планов | `hooks/planning/usePlanFilters.ts` |
| навигация планов | `hooks/planning/usePlanNavigation.ts` |
| планы бот | `lib/ops/plans/bot-adapter.ts` |
| планы хуки | `hooks/usePlans.ts`, `hooks/usePlanOperations.ts`, `hooks/planning/` |
| планы API | `app/api/plans/` |

## Отчёты / Рапорты

| Термин | Файлы |
|--------|-------|
| **отчёты** (общее) | `lib/ops/reports/service.ts`, `lib/ops/reports/types.ts` |
| PDF отчёт | `lib/ops/reports/pdf.ts`, `pdf-helpers.ts`, `pdf-employee.ts`, `pdf-company.ts`, `pdf-quarterly.ts` |
| Excel отчёт | `lib/ops/reports/excel.ts`, `excel-builders.ts`, `excel-data.ts` |
| DOCX отчёт | `lib/ops/reports/docx.ts` |
| квартальный отчёт | `lib/ops/reports/quarterly-plan.ts`, `quarterly-dept.ts`, `quarterly-notes.ts` |
| отчёт по сотруднику | `lib/ops/reports/employee-report.ts`, `employee-list.ts` |
| отчёт по компании | `lib/ops/reports/company-report.ts`, `company-list.ts`, `company-notes.ts` |
| распределение часов | `lib/ops/reports/hour-distribution.ts` |
| отчёты UI | `components/dashboard/reports/` (QuarterlyReportTab и др.) |
| сводный отчёт, пивот | `hooks/usePivotReport.ts`, `app/api/reports/pivot/` |
| отчёты бот | `lib/ops/reports/bot-adapter.ts` |
| отчёты API | `app/api/reports/` |

## KPI / Показатели

| Термин | Файлы |
|--------|-------|
| **KPI**, показатели, эффективность | `lib/ops/kpi/service.ts`, `lib/ops/kpi/types.ts`, `lib/ops/kpi/helpers.ts` |
| KPI роли | `lib/ops/kpi/compute-roles.ts` |
| KPI UI | `components/dashboard/kpi/` |
| KPI хук | `hooks/useKPI.ts` |
| KPI API | `app/api/kpi/route.ts` |
| KPI бот | `lib/ops/kpi/bot-adapter.ts` |

## Боты / Telegram / Teams

| Термин | Файлы |
|--------|-------|
| **телеграм бот** | `lib/bot/telegram/bot.ts` (main), `direct-router.ts`, `ai-router.ts` |
| телеграм авторизация | `lib/bot/telegram/auth.ts`, `crypto.ts` |
| телеграм вебхук | `app/api/telegram/webhook/route.ts` |
| **визард задач**, wizard, добавление задач через бота | `lib/bot/telegram/task-wizard/` (index, steps, session, queries) |
| **Teams бот** | `lib/bot/teams/bot.ts`, `direct-router.ts`, `ai-router.ts` |
| Teams авторизация | `lib/bot/teams/auth.ts` |
| Teams вебхук | `app/api/teams/webhook/route.ts` |
| **ядро бота**, роутер бота | `lib/bot/core/router.ts`, `tool-registry.ts`, `registry.ts` |
| права бота, пермишены | `lib/bot/core/permissions.ts` |
| системный промпт бота | `lib/bot/core/system-prompt.ts` |
| **уведомления** (бот) | `lib/bot/notifications/send.ts` |
| форматирование (бот) | `lib/bot/shared/format-helpers.ts`, `format-base.ts` |
| настройки бота UI | `components/dashboard/bot/BotSettingsContent.tsx` |
| секция бота (таби) | `components/dashboard/bot/BotSectionContent.tsx` |
| **голосовой бот**, voice bot | `lib/bot/voice/elevenlabs-client.ts`, `session-logger.ts` |
| голосовой бот UI | `components/dashboard/voice/VoiceBotContent.tsx` |
| голосовой бот API | `app/api/voice/` (signed-url, kb-search, webhook, sessions) |
| голосовой чат, voice chat | `app/voice-chat/page.tsx` |
| транскрипция аудио | `lib/bot/audio/transcriber.ts` |

## Справочники / Референсы

| Термин | Файлы |
|--------|-------|
| **справочники** (общее) | `components/dashboard/references/`, `lib/ops/reference-queries.ts` |
| **сотрудники** | `lib/ops/employees.service.ts`, `hooks/useEmployees.ts` |
| сотрудники UI | `components/dashboard/references/employees/EmployeeDetails.tsx` |
| **компании** | `hooks/useCompanies.ts` |
| компании UI | `components/dashboard/references/companies/` |
| **инфраструктура** | `lib/ops/infrastructure.service.ts`, `hooks/useInfrastructure.ts` |
| инфраструктура UI | `components/dashboard/references/companies/infrastructure/` |
| **процедуры**, эталоны | `hooks/useProcedures.ts` |
| процедуры UI | `components/dashboard/references/procedures/ProceduresReferenceContent.tsx` |
| эталоны UI | `components/dashboard/references/procedures/EtalonsReferenceContent.tsx` |
| **календарь**, рабочие дни | `lib/ops/calendar-queries.ts`, `lib/ops/working-days.ts`, `hooks/useWorkCalendar.ts` |
| календарь UI | `components/dashboard/references/calendar/CalendarReferenceContent.tsx` |
| календарь API | `app/api/calendar/` |
| **совещания**, митинги | `lib/ops/graph/meetings-service.ts`, `meetings.ts` |
| совещания UI | `components/dashboard/references/MeetingsContent.tsx` |
| совещания API | `app/api/meetings/` |
| транскрипции (совещаний) | `lib/ops/graph/transcriptions-service.ts`, `transcription-chat.ts` |
| процессы | `hooks/useProcesses.ts` |
| проекты | `hooks/useProjects.ts` |

## Активность / Лента

| Термин | Файлы |
|--------|-------|
| **активность**, лента, фид | `lib/ops/activity/feed.ts`, `stats.ts`, `mappers.ts` |
| активность UI | `components/dashboard/activity/ActivityContent.tsx` |
| активность бот | `lib/ops/activity/bot-adapter.ts` |
| чейнджлог | `MANUAL_BUILD_CHANGELOG_ITEMS` в `ActivityContent.tsx` |

## Планувальник / Planner

| Термін | Файли |
|--------|-------|
| **планувальник**, planner, тижневий план | `components/dashboard/planner/PlannerContent.tsx` |
| планувальник сітка, grid | `components/dashboard/planner/PlannerGrid.tsx`, `PlannerBlocks.tsx` |
| планувальник сайдбар, процедури | `components/dashboard/planner/PlannerSidebar.tsx` |
| планувальник тулбар | `components/dashboard/planner/PlannerToolbar.tsx` |
| планувальник фільтри | `components/dashboard/planner/PlannerFilters.tsx` (якщо існує) або PlannerToolbar |
| планувальник статистика | `components/dashboard/planner/PlannerStats.tsx` |
| мої задачі, tasks panel | `components/dashboard/planner/TasksPanel.tsx` |
| деталі задач, tasks detail | `components/dashboard/planner/PlannerTasksDetail.tsx` |
| модалка задач, tasks modal | `components/dashboard/planner/TasksModal.tsx` |
| task picker, вибір задачі | `components/dashboard/planner/TaskPickerDropdown.tsx` |
| додати задачу, add task modal | `components/dashboard/planner/AddTaskModal.tsx` |
| шаблони задач, task templates | `components/dashboard/planner/TaskTemplatePicker.tsx`, `lib/ops/planner/task-templates.ts` |
| розподіл компаній | `components/dashboard/planner/CompanyDistributionSelector.tsx` |
| calendar entries, запис подій | `lib/ops/planner/calendar-entries.ts`, `calendar-entries-write.ts` |
| calendar shared, time utils | `lib/ops/planner/calendar-shared.ts` |
| calendar sync, PULL, delta query | `lib/ops/planner/calendar-sync.ts`, `calendar-sync-reconcile.ts`, `calendar-sync-backfill.ts` |
| calendar push, batch sync, Outlook push | `lib/ops/planner/calendar-push.ts` |
| suggest, автозаповнення | `lib/ops/planner/weekly-suggest.ts`, `weekly-suggest-strategies.ts` |
| meeting info, зустріч деталі | `lib/ops/planner/meeting-details.ts` |
| meeting summary, AI саммарі | `lib/ops/planner/meeting-summary.ts` |
| task service, CRUD задач | `lib/ops/planner/task-service.ts` |
| task validation | `lib/ops/planner/task-validation.ts` |
| **збір задач**, collect, ClipboardCheck | `lib/ops/planner/collect-tasks.ts`, `app/api/planner/entries/collect/` |
| статуси плиток, entryStatus | `components/dashboard/planner/PlannerBlocks.tsx:entryStatus()` |
| needs_push, синхронізація | колонка `weekly_calendar_entries.needs_push` — локальні зміни потребують Push |

| чернетки, drafts | `lib/ops/planner/drafts.ts` |
| планувальник хуки | `hooks/usePlanner.ts`, `hooks/usePlannerSync.ts`, `hooks/usePlannerTasks.ts`, `hooks/usePlannerDrafts.ts`, `hooks/useTaskTemplates.ts` |
| планувальник API | `app/api/planner/` (entries/, tasks/, drafts/, templates/, meetings/, sync/) |

## Кабинет / Cabinet

| Термин | Файлы |
|--------|-------|
| **кабинет**, кабінет, дашборд сотрудника | `components/dashboard/cabinet/CabinetContent.tsx` |
| кабинет карточки | `components/dashboard/cabinet/CabinetSummaryCards.tsx` |
| кабинет дедлайны | `components/dashboard/cabinet/CabinetDeadlines.tsx` |
| кабинет профиль | `components/dashboard/cabinet/CabinetProfile.tsx` |
| кабинет настройки бота | `components/dashboard/cabinet/CabinetBotSettings.tsx` |
| кабинет хук | `hooks/useCabinetStats.ts` |
| кабинет API | `app/api/cabinet/stats/` |
| кабинет сервис | `lib/ops/cabinet/stats.ts` |
| **відпустка**, отпуск, планирование отпуска | `lib/ops/cabinet/absences.ts` |
| відпустка UI | `components/dashboard/cabinet/CabinetVacation.tsx` |
| заявки на відпустку, затвердження | `components/dashboard/cabinet/CabinetApprovals.tsx` |
| відпустка хук | `hooks/useAbsences.ts` |
| відпустка API | `app/api/cabinet/absences/`, `app/api/cabinet/absences/approve/` |
| тижневий план, calendar, sync | -> перенесено в Планувальник |
| Outlook sync (запис подій) | `lib/ops/graph/calendar-write.ts` |

## Дайджест

| Термин | Файлы |
|--------|-------|
| **дайджест**, еженедельная сводка | `lib/ops/digest/service.ts` |
| дайджест API | `app/api/digest/weekly/` |
| дайджест крон | `scripts/digest-cron.mjs` |

## Контракты / СОЦ

| Термин | Файлы |
|--------|-------|
| **контракты**, СОЦ, сопоставление | `lib/ops/contracts/soc-matcher.ts`, `soc-catalog.ts` |

## Microsoft Graph / SharePoint

| Термин | Файлы |
|--------|-------|
| **Graph API**, Microsoft Graph | `lib/ops/graph/client.ts`, `auth-service.ts` |
| **SharePoint**, файлы | `lib/ops/graph/sharepoint-service.ts`, `sharepoint-drive.ts` |
| SharePoint отчёты | `lib/ops/graph/sharepoint-reports.ts` |
| SharePoint вложения | `lib/ops/graph/sharepoint-attachments.ts` |
| пользователи AD | `lib/ops/graph/users-service.ts` |
| календарь Graph | `lib/ops/graph/calendar-service.ts` |

## Авторизация / Auth

| Термин | Файлы |
|--------|-------|
| **авторизация**, JWT, MSAL | `lib/shared/auth/` |
| токен API | `app/api/auth/token/route.ts` |
| проверка авторизации | `app/api/auth/check/` |
| куки | `app/api/auth/set-auth-cookie/` |
| рефреш токена | `hooks/useAuthRefresh.ts` |
| middleware | `src/middleware.ts` |

## Присутствие / Online

| Термин | Файлы |
|--------|-------|
| **присутствие**, онлайн, хартбит | `lib/ops/presence/store.ts`, `seed.ts`, `employee-cache.ts` |
| присутствие хук | `hooks/usePresence.ts` |
| присутствие API | `app/api/presence/` |

## AI / ИИ

| Термин | Файлы |
|--------|-------|
| **AI ассистент задач** | `app/api/ai/task-assistant/` |
| AI анализ активности | `app/api/ai/activity-analysis/` |
| AI очистка задач | `app/api/ai/task-cleanup/` |
| AI эмбеддинги | `app/api/ai/embeddings/` |

## Утилиты

| Термин | Файлы |
|--------|-------|
| **роли**, пермишены, группы ролей | `lib/shared/auth/role-groups.ts`, `types/supabase.ts:1`, `types/azure.ts:4` |
| логгер | `lib/shared/logger.ts` |
| форматирование имён | `lib/ops/format-name.ts` |
| номера документов | `lib/ops/document-number.ts` |
| ресайз фото | `lib/ops/photo-resize.ts` |
| статусы (задач) | `hooks/useAvailableStatuses.ts` |
| медиа-запросы | `hooks/useMediaQuery.ts` |
| дебаг API | `app/api/debug/` |
| извлечение текста | `app/api/files/extract-text/` |

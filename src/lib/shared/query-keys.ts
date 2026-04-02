/**
 * Centralized query key registry for TanStack Query.
 *
 * Rules:
 * - Every queryKey in the app MUST be defined here
 * - Use factory functions for parameterized keys
 * - Invalidation should reference these keys, not string literals
 */

export const queryKeys = {
  // ─── References (static data, staleTime: Infinity) ───────────────────
  references: {
    companies: ['companies'] as const,
    processes: ['processes'] as const,
    employees: ['employees'] as const,
    departments: ['departments'] as const,
    projects: ['projects'] as const,
    procedures: ['procedures'] as const,
    annualPlans: ['annual-plans'] as const,
  },

  // ─── Calendar / Working Days ─────────────────────────────────────────
  calendar: {
    workingDays: (year: number) => ['working-days', year] as const,
    timesheet: (year: number, month: number) => ['timesheet', year, month] as const,
  },

  // ─── Plans V2 (hierarchical: ['plans', ...] for prefix invalidation) ──
  plans: {
    all: ['plans'] as const,
    monthly: (year: number) => ['plans', 'monthly', year] as const,
    hours: (planIds: string[]) => ['plans', 'hours', planIds] as const,
    budgetItems: ['plans', 'budget-items'] as const,
    taskTemplates: ['plans', 'task-templates'] as const,
    employees: (role?: string, deptId?: string) => ['plans', 'employees', role, deptId] as const,
    annual: (year: number) => ['plans', 'annual', year] as const,
    annualBudgetsAll: (annualIds: string[]) => ['plans', 'annual-budgets-all', annualIds] as const,
    annualBudget: (annualId?: string) => ['plans', 'annual-budget', annualId] as const,
    quarterly: (year: number) => ['plans', 'quarterly', year] as const,
    quarterlyInitiativesAll: (qIds: string[]) => ['plans', 'quarterly-initiatives-all', qIds] as const,
    initiativesCatalog: ['plans', 'initiatives-catalog'] as const,
    processGoals: (processId?: string, year?: number) => ['plans', 'process-goals', processId, year] as const,
    monthlyAssignees: (planIds: string[]) => ['plans', 'monthly-assignees', planIds] as const,
    monthlyOverview: (year: number, month: number) => ['plans', 'monthly-overview', year, month] as const,
    companyNames: (ids: string[]) => ['plans', 'company-names', ids] as const,
    // Detail (single RPC)
    details: (planIds: string[]) => ['plans', 'details', planIds] as const,
  },

  // ─── Planner ─────────────────────────────────────────────────────────
  planner: {
    entries: ['planner', 'entries'] as const,
    entriesWeek: (weekStart: string) => ['planner', 'entries', weekStart] as const,
    tasks: ['planner', 'tasks'] as const,
    tasksDetail: (monthlyPlanId: string) => ['planner', 'tasks', 'detail', monthlyPlanId] as const,
    tasksPicker: (procedureId: string, monthlyPlanId: string) => ['planner', 'tasks', 'picker', procedureId, monthlyPlanId] as const,
    drafts: ['planner', 'drafts'] as const,
    templates: ['planner', 'templates'] as const,
    templatesByProc: (procedureId: string) => ['planner', 'templates', procedureId] as const,
  },

  // ─── Cabinet ─────────────────────────────────────────────────────────
  cabinet: {
    stats: ['cabinet', 'stats'] as const,
    absences: (year: number) => ['cabinet', 'absences', year] as const,
    absencesTeam: (year: number) => ['cabinet', 'absences', 'team', year] as const,
  },

  // ─── Reports ─────────────────────────────────────────────────────────
  reports: {
    pivot: (year: number, quarter: number, scope: string, extra?: string) =>
      ['pivot-report', year, quarter, scope, extra] as const,
  },

  // ─── KB ──────────────────────────────────────────────────────────────
  kb: {
    documents: (categorySlug?: string) => ['kb-documents', categorySlug] as const,
    laws: ['kb-laws'] as const,
  },

  // ─── Meetings ────────────────────────────────────────────────────────
  meetings: {
    list: (startDate: string, endDate: string, all: boolean) =>
      ['meetings-list', startDate, endDate, all] as const,
  },

  // ─── Bot / Telegram / Teams ──────────────────────────────────────────
  bot: {
    telegramStatus: ['telegram-status'] as const,
    telegramPermissions: ['telegram-permissions'] as const,
    telegramNotificationSettings: ['telegram-notification-settings'] as const,
    teamsStatus: ['teams-status'] as const,
    botStatus: (userId: string) => ['bot-status', userId] as const,
  },
} as const;

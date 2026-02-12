# Claude AI Instructions - ReportIB Project

## Project Overview

**ReportIB** - enterprise information security management system for a large retail company. Built with Next.js 15 (App Router), Supabase, Azure AD authentication, and Tailwind CSS.

The system manages annual/quarterly/monthly plans, daily tasks, KPI metrics, employee management, company partners, and automated reporting for the Information Security department.

**Language**: UI and comments are in Russian/Ukrainian. Code identifiers are in English.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) with React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3.3 + tailwindcss-animate |
| UI Components | Custom components + Radix UI primitives + CVA |
| Database | Supabase (PostgreSQL) |
| Auth | Azure AD (MSAL) + Supabase user profiles |
| Icons | Lucide React, Heroicons |
| Animations | Framer Motion |
| Reports | ExcelJS, PDFKit |
| Deployment | Vercel (with cron jobs) |
| Date handling | Day.js |

---

## Commands

```bash
npm run dev           # Next.js dev server (HTTP, port 3000)
npm run dev:https     # HTTPS dev server via server.js (REQUIRED for Azure AD!)
npm run build         # Production build
npm run start         # Production server
npm run lint          # ESLint
npx tsc --noEmit      # Type checking
```

**IMPORTANT**: Azure AD requires HTTPS. Use `npm run dev:https` for auth-related development. The app is served at `https://maxtitan.me:3000`.

---

## Project Structure

```
src/
  app/                          # Next.js App Router pages
    page.tsx                    # Root page (redirect)
    layout.tsx                  # Root layout (Inter font, lang="ru")
    login/page.tsx              # Login page
    dashboard/                  # Main app pages
      page.tsx                  # Dashboard container
      plans/page.tsx            # Plans page
      employees/page.tsx        # Employees page
      companies/page.tsx        # Companies page
      kpi/page.tsx              # KPI page
      reports/page.tsx          # Reports page
    api/                        # API routes (Route Handlers)
      auth/                     # Auth endpoints (token sync, cookie)
      ai/                       # AI endpoints (task assistant, activity analysis)
      reports/                  # Report generation (monthly, excel, PDF)
      plans/                    # Plans API (count)
    env-check/page.tsx          # Environment diagnostic page

  components/                   # React components
    ui/                         # Reusable UI components (Button, Modal, Card, Badge, Spinner, BottomDrawer)
    auth/                       # Login components (LoginForm, AzureLoginButton, LoginHeader)
    dashboard/                  # Dashboard sections
      content/                  # Tab content (Activity, Companies, Employees, KPI, Reports, etc.)
      Tasks/                    # Task management components
      reports/                  # Quarterly reports UI
    plans/                      # Plans management (PlansPageNew, tree, details)
      details/                  # Plan detail views (Annual, Quarterly, Monthly)
      tree/                     # Plan tree navigation
    employees/                  # Employee management (Card, Details, FormModal, Layout)
    infrastructure/             # Infrastructure charts and modals
    navigation/                 # HorizontalNav (notebook-style tabs)

  lib/                          # Core business logic
    auth/                       # MSAL + Supabase auth (config.ts, index.ts with useAuth hook)
    plans/                      # Plan CRUD service (plan-service.ts)
    tasks/                      # Task service (task-service.ts)
    services/                   # Domain services (employees, reports, infrastructure, etc.)
    reports/                    # Excel report generator
    ai/                         # AI client configuration
    api/                        # Request guards
    utils/                      # Utility functions (fetch-with-timeout, error-message, planning-utils)
    supabase.ts                 # Supabase client initialization
    utils.ts                    # cn() utility (clsx + twMerge)
    logger.ts                   # Logging utility
    user-profiles.ts            # User profile helpers

  modules/                      # Feature modules
    plans/                      # Plans module (read, write, delete, types, status, service-core)

  services/
    graph/                      # Microsoft Graph API services
      auth-service.ts           # Graph auth
      calendar-service.ts       # Calendar integration
      meetings-service.ts       # Meetings
      transcriptions-service.ts # Meeting transcriptions
      sharepoint-service.ts     # SharePoint integration
      users-service.ts          # Graph users

  context/                      # React contexts
    PlansContext.tsx             # Plans state (view, selection, filters)

  hooks/                        # Custom React hooks
    useMonthlyPlans.ts          # Monthly plans data
    useDailyTasks.ts            # Daily tasks data
    usePlans.ts                 # General plans
    useEmployees.ts             # Employees data
    useCompanies.ts             # Companies data
    useProcesses.ts             # Processes data
    useProjects.ts              # Projects data
    usePresence.ts              # User presence tracking
    useInfrastructure.ts        # Infrastructure data
    useMediaQuery.ts            # Responsive breakpoints
    useAvailableStatuses.ts     # Status options
    planning/                   # Plan-specific hooks (filters, navigation)

  types/                        # TypeScript type definitions
    supabase.ts                 # Database types (Database, UserRole, UserStatus, etc.)
    planning.ts                 # Plan types
    azure.ts                    # Azure AD types
    graph-types.ts              # Microsoft Graph types
    projects.ts                 # Project types
    infrastructure.ts           # Infrastructure types

  styles/
    globals.css                 # Global styles, CSS custom properties, utility classes
    design-system.ts            # Design system tokens in TS

  middleware.ts                 # Auth middleware (JWT validation, route protection)

docs/                           # Project documentation
  DEVELOPER_GUIDE.md            # Main developer guide
  BUSINESS_REQUIREMENTS.md      # Business requirements spec
  UI_DESIGN_SYSTEM.md           # Full design system docs
  UI_CHEATSHEET.md              # Quick UI reference
  database/SCHEMA.md            # Database schema
  architecture/                 # Architecture docs
  modules/                      # Module-level docs (auth, companies, kpi, etc.)
  reports/                      # Report docs

supabase/migrations/            # Database migrations (SQL)
scripts/                        # Utility scripts (Python, JS) for data migration/analysis
server.js                       # Custom HTTPS server (for Azure AD dev)
```

---

## Critical Rules

### 1. User Identifiers
- **ALWAYS** use Supabase `user_id` (UUID) for business logic
- **NEVER** use Azure AD ID for data operations
- Email is only for lookup/linking with Azure AD

### 2. Data Access
- Read data through Supabase Views: `v_annual_plans`, `v_quarterly_plans`, `v_monthly_plans`, `v_user_details`, `v_kpi_current`
- Mutations via RPC or service functions in `src/lib/plans/plan-service.ts`
- Always cast `departmentId` to string

### 3. Authentication Architecture
- Dual system: Azure AD (corporate SSO via MSAL redirect) + Supabase (user profiles)
- User must exist in BOTH systems to log in
- Auth flow: Azure AD login -> get token -> lookup Supabase profile by email -> set JWT cookie
- Caching: user data 5 min (localStorage), Graph tokens 30 min
- Config: `src/lib/auth/config.ts`
- **Pages get user via `useAuth()` hook, NOT via direct `getCurrentUser()` call**
- **Service functions receive `userRole`/`userDepartmentId` as parameters, NOT from DB**
- Middleware (`src/middleware.ts`) validates `auth_token` cookie for protected routes

### 4. Path Aliases
```typescript
// tsconfig.json: "@/*" -> "./src/*"
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
```

### 5. Plan Hierarchy (Monthly Planning System)

```
Annual Plan (amber) -> Quarterly Plan (purple) -> Monthly Plan (indigo) -> Daily Task
```

- Quarterly can exist without annual (ad-hoc work)
- Monthly can exist without quarterly (operational tasks)
- Daily tasks are ALWAYS linked to a monthly plan
- Deletion: children must be deleted first (bottom-up)

### 6. User Roles

| Role | Can Create Plans | Can Approve | Visibility |
|------|-----------------|-------------|-----------|
| **Chief** | No | All plans | All departments |
| **Head** | Own department | No | Own dept full, others read-only |
| **Employee** | No (only tasks) | No | Own tasks and assigned plans |

### 7. Color Coding (Semantic Palette)

| Entity | Color | Tailwind |
|--------|-------|----------|
| Annual Plan | Amber | `bg-amber-50`, `text-amber-900` |
| Quarterly Plan | Purple | `bg-purple-50`, `text-purple-900` |
| Monthly Plan | Indigo | `bg-indigo-50`, `text-indigo-900` |
| Status: Done | Emerald | `bg-emerald-*` |
| Status: In Progress | Violet | `bg-violet-*` |
| Status: Overdue | Red | `bg-red-*` |
| Status: Under Review | Blue | `bg-blue-*` |
| Status: Returned | Amber | `bg-amber-*` |

---

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=<azure-client-id>
NEXT_PUBLIC_AZURE_AD_TENANT_ID=<azure-tenant-id>
NEXT_PUBLIC_AZURE_AD_REDIRECT_URI=https://maxtitan.me:3000
NEXT_PUBLIC_AZURE_AD_LOGOUT_REDIRECT_URI=https://maxtitan.me:3000/login
NEXT_PUBLIC_USE_HTTPS=true
NEXT_PUBLIC_BASE_URL=https://maxtitan.me:3000
```

---

## Deployment

- **Platform**: Vercel
- **Cron Jobs** (`vercel.json`): Monthly report generation at `0 6 1 * *` (1st of each month, 6 AM UTC)
- **Server External Packages**: `pdfkit` (requires AFM files, excluded from client bundle)

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `src/lib/auth/index.ts` | Auth logic + `useAuth()` hook |
| `src/lib/auth/config.ts` | MSAL config, scopes, routes |
| `src/lib/supabase.ts` | Supabase client |
| `src/lib/plans/plan-service.ts` | Plan CRUD operations |
| `src/lib/tasks/task-service.ts` | Task CRUD operations |
| `src/lib/utils.ts` | `cn()` helper (clsx + twMerge) |
| `src/middleware.ts` | Route protection middleware |
| `src/components/ui/Button.tsx` | Button component (CVA variants) |
| `src/components/ui/Modal.tsx` | Modal with focus trap + portal |
| `src/components/navigation/HorizontalNav.tsx` | Main dashboard navigation |
| `src/components/plans/PlansPageNew.tsx` | Plans management page |
| `src/context/PlansContext.tsx` | Plans state context |
| `server.js` | HTTPS dev server |
| `tailwind.config.js` | Custom tokens, colors, animations |

---

## UI Design System Rules

When working with this project, **ALWAYS** follow the design system.

### Quick checklist for EVERY UI component:

```tsx
// Minimum correct component:
<button
  onClick={handler}
  aria-label="Action description"
  className="
    px-3 sm:px-4              // responsive padding
    py-2 sm:py-2.5            // responsive padding
    text-sm sm:text-base       // responsive text
    bg-indigo-600             // color from tokens
    rounded-lg                // standard rounding
    transition-[transform,background-color]  // optimized transitions
    duration-base             // duration token
    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
    hover:bg-indigo-700
    active:scale-95
    disabled:opacity-50 disabled:cursor-not-allowed
  "
>
  <Icon aria-hidden="true" className="h-4 w-4" />
  <span className="hidden xs:inline">Full text</span>
  <span className="xs:hidden">Short</span>
</button>
```

### Quick Rules

1. **Colors** - ONLY from tokens (`bg-indigo-600`, NOT `bg-[#4f46e5]`)
2. **Responsive** - ALWAYS (`px-3 sm:px-4 md:px-6`, NOT just `px-4`)
3. **Accessibility** - NO EXCEPTIONS (`aria-label`, `aria-hidden="true"` for icons, `focus:ring-*`, `role="button"` for clickable divs)
4. **Components** - use existing ones (`Button`, `Modal`, `Card`, `Badge`, `Spinner`, `BottomDrawer`)
5. **Gradients** - use utility classes (`gradient-primary`, `gradient-glass`)
6. **Animations** - optimize (`transition-[transform,opacity]`, NOT `transition-all`)

### Ready-to-use Components

```tsx
// Button (CVA-based)
import { Button } from '@/components/ui/Button';
<Button variant="default" size="md">Click</Button>
// Sizes: xs, sm, md, lg, xl, icon
// Variants: default, destructive, outline, secondary, ghost, link, success, warning

// Modal (with focus trap + portal)
import { Modal } from '@/components/ui/Modal';
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Title">
  {children}
</Modal>
```

### CSS Utility Classes (globals.css)

```
gradient-primary        // indigo-to-blue gradient
gradient-glass          // glass effect gradient
gradient-card           // subtle card gradient
glass-effect            // bg-white/30 backdrop-blur-sm
glass-effect-strong     // bg-white/20 backdrop-blur-md
focus-ring              // standard focus ring
focus-ring-error        // red focus ring
animate-press           // active:scale-95
card-base               // base card styles
card-hover              // hover card styles
```

### Spacing Tokens

```
px-xs (4px), px-sm (8px), px-md (16px), px-lg (24px), px-xl (32px), px-2xl (48px), px-3xl (64px)
```

### Custom Breakpoints

```
xs: 480px, sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
```

### Z-Index System

```
dropdown: 1000, sticky: 1020, fixed: 1030, modal-backdrop: 1040, modal: 1050, popover: 1060, tooltip: 1070
```

### What NOT to do

1. Create UI without responsive classes
2. Forget `aria-label` on interactive elements
3. Use `transition-all`
4. Use arbitrary colors `bg-[#...]`
5. Forget focus states
6. Create modals manually (use `Modal`)
7. Create buttons manually (use `Button`)
8. Forget `aria-hidden="true"` on decorative icons

When modifying existing components, **ALWAYS** improve them to match the design system if they don't already.

---

## Common Errors & Solutions

| Problem | Solution |
|---------|----------|
| Plan not creating | Verify Supabase `user_id` is used (not Azure AD ID) |
| Plan not deleting | Delete children first; verify you are the creator |
| Author not displayed | View must return `author_name`, `author_email` |
| Task not linking | Check `monthly_plan_id` and `user_id` |
| Profile update error | Use RPC `upsert_user_profile`; email is immutable |

---

## Documentation Index

| Document | Description |
|----------|-------------|
| `docs/DEVELOPER_GUIDE.md` | Main developer guide |
| `docs/BUSINESS_REQUIREMENTS.md` | Business requirements |
| `docs/database/SCHEMA.md` | Database schema |
| `docs/UI_DESIGN_SYSTEM.md` | Full design system |
| `docs/UI_CHEATSHEET.md` | UI quick reference |
| `docs/architecture/` | Architecture docs |
| `docs/modules/auth/` | Authentication docs |
| `src/lib/auth/README.md` | Auth module README |

---

**CRITICAL: These UI design rules are NOT optional. Follow them with EVERY UI change.**

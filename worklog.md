# Worklog — سامانه مدیریت پروژه‌های سازمانی (Organizational Project Management System)

Project: Convert organizational Excel (165 sheets, 1148 tasks, 1405 programs) into a structured, normalized database + MS-Project-like web application (Next.js 16, Prisma/SQLite, RTL Persian, Jalali calendar).

## Analysis Summary (from Excel inspection)

**Main file** `(v27-1) برنامه عملیاتی های 1405.xlsx`:
- 165 sheets — each sheet = one operational program (برنامه عملیاتی)
- 1148 total tasks across all sheets
- Sheet name pattern: `<management-area><seq>` e.g. `بانک بیمه7`, `پولشویی4`, `حراست3`
- Two layout variants:
  - **Variant A** (بانک بیمه style): cols A=ردیف, B=شرح عملیات, H=وزن, I=واحدهای مجری, J=هدف کمی, K-V=12 months, W=ملاحظات. Dates as Persian month names (فروردین..اسفند 1405).
  - **Variant B** (پولشویی style): adds col K=پیش‌نیازی گام‌های برنامه, months shift to L-W. Dates as `1405/MM/DD`.
- Row 3 = project title + شماره برنامه + هدف
- Row 4 = مدیر پروژه + وزن برنامه
- Row 5 = عنوان برنامه + تاریخ شروع/خاتمه
- Row 6 = column headers
- Row 7 = month names (فروردین..اسفند)
- Row 8+ = task rows

**Synonym file** `نام نظیر مدیریت ها.xlsx`:
- 33 canonical management names, each with dash-separated aliases
- e.g. `فناوری اطلاعات` ← `فاوا-آی تی- IT-مدیریت فناوری اطلاعات-فن آوری اطلاعات-مرکز نوآوری`
- Confirms heavy name variation in raw data (39 manager strings, 141 executor strings, many duplicates/typos)

## Decisions
- Use Prisma + SQLite, normalized to 3NF
- Raw layer preserves exact Excel content; Clean layer maps via dictionary
- Jalali calendar handled with `jalaali-js`
- RTL layout + Vazirmatn font
- Custom Gantt built with CSS grid (Persian months on x-axis)
- Single `/` route with tabbed/sectioned SPA-style navigation


---
Task ID: 2 + 3
Agent: main
Task: Design Prisma schema + write & run ETL seed script

Work Log:
- Designed 16-table normalized Prisma schema (Organization tree, UnitDictionary, DictionaryTerm, StatusDictionary, User, Project, ProjectUnit, Task, TaskUnit, TaskDependency, TaskProgressHistory, ProjectProgressHistory, AuditLog, ImportBatch, RawSheetImport, RawProgramRow)
- Built org hierarchy: 1 company + 6 deputies + 28 managements + 1 group = 36 nodes
- Wrote normalize() (handles ZWNJ, ی/ي, ک/ك, diacritics, separators) + greedy dictionary-driven matcher matchOrgs() with boundary checking
- Wrote prisma/seed.ts ETL: reads both Excel files with exceljs, builds dictionary (217 entries), imports 160 programs + 1046 tasks + 1460 task-unit links + 12552 monthly progress records
- Simulated planned vs actual progress (delayFactor 0.78-0.98) for S-curve / trend charts
- Ran db:push + seed successfully

Stage Summary:
- DB seeded: 36 orgs, 217 dict entries, 160 projects, 1046 tasks, 1460 task-units, 12552 progress records, 160 raw sheets, 1046 raw rows
- Only 6 unmapped executor strings (signature rows + 1 typo "مدیریت بازیافت")
- Sample project verified: PRG-1405-M-BANKINS-7 owner=مرکز بانک-بیمه, 5 tasks, 43.9% progress
- Jalali date conversion via jalaali-js (named imports: toGregorian, isValidJalaaliDate, jalaaliMonthLength)

---
Task ID: 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12
Agent: main
Task: Build backend APIs + all 8 frontend views + verify with Agent Browser

Work Log:
- Backend: 10 API routes — /api/dashboard, /api/orgs/tree, /api/projects (list+detail), /api/gantt, /api/dictionary, /api/reports/progress-trend, /api/reports/management-performance, /api/schema (ERD metadata), /api/raw (list+detail)
- Rollup helper (src/lib/rollup.ts): hierarchical weighted progress roll-up Company→Deputy→Management, monthly trend aggregation
- Jalali utilities (src/lib/jalali.ts): toGregorian/toJalaali, Persian digits, month/year parsing, status colors
- Shared UI (src/components/pmo/shared.tsx): KpiCard, ProgressBar, StatusBadge, SectionCard, Spinner, EmptyState
- Main shell (src/app/page.tsx): RTL Persian, sidebar nav (8 views), sticky topbar + footer (mt-auto pattern), theme toggle (light/dark), Vazirmatn font, mobile hamburger
- 8 views built:
  • DashboardView: 6 KPI cards, S-Curve (Area), status distribution, deputy bar chart, top-10 management ranking, low-progress projects table
  • ProjectTreeView: hierarchical expand/collapse (Company→Deputy→Management→Project→Task), lazy-loaded, roll-up progress
  • GanttView: custom CSS-grid Gantt with 12 Jalali months, project+task bars, milestone diamonds, active-months overlay, zoom, owner filter
  • ProgramsView: card grid with search/deputy/status filters, pagination, detail dialog (meta, goal, units, tasks, progress)
  • DictionaryView: canonical units list + aliases with type badges (CANONICAL/ALIAS/SYNONYM/ABBREVIATION/TYPO...)
  • ReportsView: scope selector (company/deputy/management), S-Curve, variance bar chart, top/bottom performers, stacked status-by-management
  • DataModelView: ERD relationships + full data dictionary (16 tables, grouped: Master/Dictionary/Transaction/Audit/Raw), PK/FK/UQ badges
  • RawDataView: raw sheet list with mapping status, detail dialog showing raw Excel fields + mapped Clean entity (Trace)
- Fixed lint: react-hooks/set-state-in-effect rule — refactored to derived-key + loadedId patterns
- Fixed seed: rich-text cell extraction (cellText helper) — eliminated 17 "[object Object]" titles; aggressive prefix stripping — eliminated 87 "1- عنوان برنامه" / "2- مدیر پروژه" prefixes
- Agent Browser verification: all 8 views render, program detail dialog loads tasks/units, no console errors, footer sticky (no gap below), mobile menu works

Stage Summary:
- 160 programs, 1046 tasks, 1460 task-unit links, 12552 progress records, 217 dictionary entries
- Overall company progress: 52% (weighted roll-up)
- All views browser-verified, zero runtime/hydration errors, lint clean
- RTL + Jalali + dark mode + responsive + sticky footer all working

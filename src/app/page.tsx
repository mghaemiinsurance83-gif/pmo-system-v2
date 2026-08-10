"use client";
import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Network,
  GanttChartSquare,
  FolderKanban,
  BookMarked,
  BarChart3,
  Database,
  FileSpreadsheet,
  Handshake,
  UsersRound,
  Moon,
  Sun,
  Menu,
  X,
  CalendarClock,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DashboardView } from "@/components/pmo/views/dashboard-view";
import { ProjectTreeView } from "@/components/pmo/views/project-tree-view";
import { GanttView } from "@/components/pmo/views/gantt-view";
import { ProgramsView } from "@/components/pmo/views/programs-view";
import { DictionaryView } from "@/components/pmo/views/dictionary-view";
import { ReportsView } from "@/components/pmo/views/reports-view";
import { DataModelView } from "@/components/pmo/views/data-model-view";
import { RawDataView } from "@/components/pmo/views/raw-data-view";
import { ParticipationView } from "@/components/pmo/views/participation-view";
import { CollaborationView } from "@/components/pmo/views/collaboration-view";
import { apiFetch } from "@/lib/api";

type ViewId =
  | "dashboard"
  | "tree"
  | "gantt"
  | "programs"
  | "participation"
  | "collaboration"
  | "dictionary"
  | "reports"
  | "datamodel"
  | "rawdata";

const NAV: { id: ViewId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "داشبورد", icon: LayoutDashboard, desc: "نمای کلی و KPI‌های شرکت" },
  { id: "tree", label: "درخت سازمان و پروژه", icon: Network, desc: "ساختار سلسله‌مراتبی و Roll-up" },
  { id: "gantt", label: "گانت چارت", icon: GanttChartSquare, desc: "تایم‌لاین ماهانه شمسی" },
  { id: "programs", label: "برنامه‌ها", icon: FolderKanban, desc: "فهرست برنامه‌های عملیاتی" },
  { id: "participation", label: "سهم مشارکت مدیریت‌ها", icon: Handshake, desc: "سهم هر مدیریت در برنامه‌ها و گام‌ها" },
  { id: "collaboration", label: "مشارکت مدیریت در برنامه‌ها", icon: UsersRound, desc: "برنامه‌های همکاری هر معاونت/مدیریت و سهم آن‌ها" },
  { id: "dictionary", label: "فرهنگ‌نامه واحدها", icon: BookMarked, desc: "نگاشت نام‌ها و مترادف‌ها" },
  { id: "reports", label: "گزارش‌ها", icon: BarChart3, desc: "S-Curve و عملکرد مدیریت‌ها" },
  { id: "datamodel", label: "مدل داده", icon: Database, desc: "ERD و Data Dictionary" },
  { id: "rawdata", label: "داده خام", icon: FileSpreadsheet, desc: "لایه Raw و نگاشت" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      suppressHydrationWarning
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">تغییر تم</span>
    </Button>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refLabel, setRefLabel] = useState<string>("");

  useEffect(() => {
    apiFetch<{ dayLabel: string; monthLabel: string }>("/api/system/settings")
      .then((s) => setRefLabel(s.dayLabel || s.monthLabel))
      .catch(() => {});
  }, []);

  const changeView = useCallback((v: ViewId) => {
    setView(v);
    setMobileOpen(false);
  }, []);

  const current = NAV.find((n) => n.id === view)!;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            className="lg:hidden -mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="منو"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <Network className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-foreground truncate">سامانه مدیریت برنامه‌های سازمانی</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">سال عملیاتی ۱۴۰۵ — بیمه تجارت‌نو</p>
            </div>
          </div>
          <div className="mr-auto flex items-center gap-1.5">
            {refLabel && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300" title="تاریخ امروز سیستم — همه گزارش‌ها بر اساس این تاریخ به‌روز می‌شوند">
                <CalendarClock className="h-3.5 w-3.5" />
                امروز: {refLabel}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:sticky top-14 z-30 h-[calc(100vh-3.5rem)] w-64 shrink-0 border-l bg-sidebar transition-transform lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          )}
        >
          <nav className="flex h-full flex-col gap-1 overflow-y-auto custom-scroll p-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => changeView(item.id)}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg px-3 py-2.5 text-right transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-sidebar-accent text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{item.label}</div>
                    <div className={cn("text-[11px] leading-tight mt-0.5 truncate", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {item.desc}
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="mt-auto rounded-lg border bg-card/50 p-3 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground mb-1">دربارهٔ سامانه</p>
              <p className="leading-relaxed">
                تبدیل Excel سازمانی به مدل دادهٔ نرمال‌شده برای مدیریت پروژه به سبک MS Project.
              </p>
            </div>
          </nav>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 top-14 z-20 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <current.icon className="h-5 w-5 text-primary" />
                  {current.label}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{current.desc}</p>
              </div>
            </div>

            {view === "dashboard" && <DashboardView />}
            {view === "tree" && <ProjectTreeView />}
            {view === "gantt" && <GanttView />}
            {view === "programs" && <ProgramsView />}
            {view === "participation" && <ParticipationView />}
            {view === "collaboration" && <CollaborationView />}
            {view === "dictionary" && <DictionaryView />}
            {view === "reports" && <ReportsView />}
            {view === "datamodel" && <DataModelView />}
            {view === "rawdata" && <RawDataView />}
          </div>
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">سامانه مدیریت برنامه‌های سازمانی</span>
            <span className="opacity-50">•</span>
            <span>۱۶۳ برنامه</span>
            <span className="opacity-50">•</span>
            <span>۱٬۰۷۱ فعالیت</span>
            <span className="opacity-50">•</span>
            <span>۳۷ واحد سازمانی</span>
          </p>
          <p className="flex items-center gap-1.5">
            <span>مدل دادهٔ نرمال‌شده ۳NF</span>
            <span className="opacity-50">•</span>
            <span>تقویم شمسی</span>
            <span className="opacity-50">•</span>
            <span>Next.js 16 + Prisma</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

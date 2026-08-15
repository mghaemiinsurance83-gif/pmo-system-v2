"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, FolderKanban, ListTodo, BarChart3, FileText, ScrollText, Settings,
  LogOut, Menu, X, Moon, Sun, CalendarClock, ChevronLeft, Shield,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminDashboard } from "./admin-dashboard";
import { AdminUsers } from "./admin-users";
import { AdminUserEdit } from "./admin-user-edit";
import { AdminProjects } from "./admin-projects";
import { AdminTasks } from "./admin-tasks";
import { AdminAuditLog } from "./admin-audit-log";

type AdminView = "dashboard" | "users" | "projects" | "tasks" | "reports" | "audit";

const NAV: { id: AdminView; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "داشبورد", icon: LayoutDashboard, desc: "نمای کلی سامانه" },
  { id: "users", label: "مدیریت کاربران", icon: Users, desc: "لیست کاربران و نقش‌ها" },
  { id: "projects", label: "مدیریت پروژه‌ها", icon: FolderKanban, desc: "ایجاد و ویرایش پروژه‌ها" },
  { id: "tasks", label: "مدیریت گام‌ها", icon: ListTodo, desc: "ایجاد و ویرایش گام‌ها" },
  { id: "reports", label: "گزارشات کل", icon: BarChart3, desc: "آمار کل شرکت" },
  { id: "audit", label: "لاگ ممیزی", icon: ScrollText, desc: "تاریخچه تغییرات" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" suppressHydrationWarning onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="تغییر تم">
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

export function AdminApp({ onExit }: { onExit: () => void }) {
  const { data: session } = useSession();
  const [view, setView] = useState<AdminView>("dashboard");
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refLabel, setRefLabel] = useState("");

  useEffect(() => {
    fetch("/api/system/settings").then(r => r.json()).then(s => setRefLabel(s.dayLabel || s.monthLabel)).catch(() => {});
  }, []);

  const changeView = useCallback((v: AdminView) => { setView(v); setMobileOpen(false); setEditUserId(null); }, []);
  const current = NAV.find(n => n.id === view)!;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button className="lg:hidden -mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent" onClick={() => setMobileOpen(o => !o)} aria-label="منو">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-sm">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-foreground truncate">پنل مدیریت سیستم</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{session?.user?.name} — ادمین</p>
            </div>
          </div>
          <div className="mr-auto flex items-center gap-1.5">
            {refLabel && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-rose-200/60 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                <CalendarClock className="h-3.5 w-3.5" /> امروز: {refLabel}
              </span>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={async () => { await signOut({ redirect: false }); onExit(); }} title="خروج"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className={cn("fixed lg:sticky top-14 z-30 h-[calc(100vh-3.5rem)] w-64 shrink-0 border-l bg-sidebar transition-transform lg:translate-x-0", mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
          <nav className="flex h-full flex-col gap-1 overflow-y-auto custom-scroll p-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button key={item.id} onClick={() => changeView(item.id)} className={cn("group flex items-start gap-3 rounded-lg px-3 py-2.5 text-right transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-sidebar-accent text-sidebar-foreground")}>
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{item.label}</div>
                    <div className={cn("text-[11px] leading-tight mt-0.5 truncate", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{item.desc}</div>
                  </div>
                </button>
              );
            })}
            <div className="mt-auto space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={onExit}>
                <ChevronLeft className="ml-2 h-4 w-4" /> مشاهده داشبورد عمومی
              </Button>
              <div className="rounded-lg border bg-card/50 p-3 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground mb-1">{session?.user?.name}</p>
                <Badge variant="secondary">ادمین سیستم</Badge>
              </div>
            </div>
          </nav>
        </aside>

        {mobileOpen && <div className="fixed inset-0 top-14 z-20 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <current.icon className="h-5 w-5 text-primary" />{current.label}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{current.desc}</p>
            </div>

            {view === "dashboard" && <AdminDashboard />}
            {view === "users" && !editUserId && <AdminUsers onEdit={(id) => setEditUserId(id)} />}
            {view === "users" && editUserId && <AdminUserEdit userId={editUserId} onBack={() => setEditUserId(null)} />}
            {view === "projects" && <AdminProjects />}
            {view === "tasks" && <AdminTasks />}
            {view === "reports" && <AdminDashboard />}
            {view === "audit" && <AdminAuditLog />}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 text-[11px] text-muted-foreground flex justify-between">
          <span>پنل مدیریت سامانه PMO</span>
          <span>دسترسی کامل — ادمین سیستم</span>
        </div>
      </footer>
    </div>
  );
}

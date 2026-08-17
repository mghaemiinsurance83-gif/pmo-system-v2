"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  FileText,
  BarChart3,
  LogOut,
  Bell,
  Menu,
  X,
  Moon,
  Sun,
  CalendarClock,
  ChevronLeft,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PortalDashboard } from "./portal-dashboard";
import { PortalProjects } from "./portal-projects";
import { PortalTasks } from "./portal-tasks";
import { PortalDocuments } from "./portal-documents";
import { PortalReports } from "./portal-reports";

type PortalView = "dashboard" | "projects" | "tasks" | "documents" | "reports";

const NAV: { id: PortalView; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "داشبورد شخصی", icon: LayoutDashboard, desc: "خلاصه پروژه‌های واحد شما" },
  { id: "projects", label: "پروژه‌های من", icon: FolderKanban, desc: "فهرست پروژه‌های حوزه شما" },
  { id: "tasks", label: "گام‌های کاری", icon: ListTodo, desc: "گام‌ها با فیلتر وضعیت" },
  { id: "documents", label: "مستندات من", icon: FileText, desc: "فایل‌های بارگذاری‌شده" },
  { id: "reports", label: "گزارش‌ها", icon: BarChart3, desc: "آمار و انحراف از برنامه" },
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

export function PortalApp({ onExit }: { onExit: () => void }) {
  const { data: session } = useSession();
  const [view, setView] = useState<PortalView>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [refLabel, setRefLabel] = useState("");

  useEffect(() => {
    fetch("/api/system/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((s) => setRefLabel(s.dayLabel || s.monthLabel))
      .catch(() => {});
    fetch("/api/portal/notifications", { credentials: "include" })
      .then((r) => r.json())
      .then((n) => setUnread(n.meta?.unread ?? 0))
      .catch(() => {});
  }, []);

  const changeView = useCallback((v: PortalView) => {
    setView(v);
    setMobileOpen(false);
  }, []);

  const current = NAV.find((n) => n.id === view)!;
  const user = session?.user;
  const roleLabel = user?.role === "ADMIN" ? "ادمین" : user?.role === "MANAGER" ? "مدیر واحد" : user?.role === "LIAISON" ? "رابط مدیریت" : "مشاهده‌گر";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button type="button" className="lg:hidden -mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent" onClick={() => setMobileOpen((o) => !o)} aria-label="منو">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <ShieldIcon />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-foreground truncate">پورتال واحدها</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{user?.name} — {roleLabel}</p>
            </div>
          </div>
          <div className="mr-auto flex items-center gap-1.5">
            {refLabel && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                <CalendarClock className="h-3.5 w-3.5" />
                امروز: {refLabel}
              </span>
            )}
            <Button variant="ghost" size="icon" className="relative" title="اعلان‌ها">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unread > 9 ? "۹+" : unread}
                </span>
              )}
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={async () => {
              try {
                const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
                const { csrfToken } = await csrfRes.json();
                await fetch("/api/auth/signout", {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({ csrfToken, callbackUrl: window.location.origin + "/", json: "true" }).toString(),
                  credentials: "include",
                });
                await new Promise((r) => setTimeout(r, 300));
              } catch (e) {}
              onExit();
              window.location.href = "/";
            }} title="خروج">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className={cn("fixed lg:sticky top-14 z-30 h-[calc(100vh-3.5rem)] w-64 shrink-0 border-l bg-sidebar transition-transform lg:translate-x-0", mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
          <nav className="flex h-full flex-col gap-1 overflow-y-auto custom-scroll p-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button key={item.id} type="button" onClick={() => changeView(item.id)} className={cn("group flex items-start gap-3 rounded-lg px-3 py-2.5 text-right transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-sidebar-accent text-sidebar-foreground")}>
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
                <ChevronLeft className="ml-2 h-4 w-4" />
                مشاهده داشبورد عمومی
              </Button>
              <div className="rounded-lg border bg-card/50 p-3 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground mb-1">{user?.name}</p>
                <p className="truncate">{user?.username}</p>
                <Badge variant="secondary" className="mt-1.5">{roleLabel}</Badge>
              </div>
            </div>
          </nav>
        </aside>

        {mobileOpen && <div className="fixed inset-0 top-14 z-20 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

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

            {view === "dashboard" && <PortalDashboard />}
            {view === "projects" && <PortalProjects />}
            {view === "tasks" && <PortalTasks />}
            {view === "documents" && <PortalDocuments />}
            {view === "reports" && <PortalReports />}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between text-[11px] text-muted-foreground">
          <p>پورتال مدیریت پروژه‌ها و گام‌های کاری</p>
          <p>احراز هویت: {user?.role === "ADMIN" ? "ادمین سیستم" : "پورتال واحد"}</p>
        </div>
      </footer>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, ListTodo, FileText, AlertTriangle, TrendingUp } from "lucide-react";

interface MeData {
  user: { id: string; username: string; name: string; role: string; orgId: string | null; orgName: string | null; orgCode: string | null };
  kpis: { totalProjects: number; totalTasks: number; documents: number; unreadNotifications: number };
  taskStatusDist: { NOT_STARTED: number; IN_PROGRESS: number; COMPLETED: number; DELAYED: number };
  isAllScope: boolean;
}

function fa(n: number | string) {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function PortalDashboard() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((d) => { if (reqId.current === sig) { setData(d.data); setLoading(false); } })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-6"><div className="h-20 animate-pulse bg-muted rounded" /></CardContent></Card>)}</div>;
  if (!data) return <div className="text-muted-foreground">خطا در بارگذاری</div>;

  const statusColors: Record<string, string> = {
    NOT_STARTED: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    IN_PROGRESS: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    DELAYED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };
  const statusLabels: Record<string, string> = {
    NOT_STARTED: "شروع نشده",
    IN_PROGRESS: "در حال اجرا",
    COMPLETED: "تکمیل شده",
    DELAYED: "تأخیر",
  };

  const total = data.taskStatusDist.NOT_STARTED + data.taskStatusDist.IN_PROGRESS + data.taskStatusDist.COMPLETED + data.taskStatusDist.DELAYED;
  const avgProgress = total > 0 ? Math.round((data.taskStatusDist.COMPLETED / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="border-teal-200/60 dark:border-teal-900/40">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-foreground">{data.user.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {data.user.orgName ? `واحد: ${data.user.orgName}` : "بدون واحد متبوع"}
                {data.isAllScope && " — دسترسی کل شرکت"}
              </p>
            </div>
            <Badge variant="outline" className="self-start">
              {data.user.role === "ADMIN" ? "ادمین" : data.user.role === "MANAGER" ? "مدیر" : data.user.role === "LIAISON" ? "رابط" : "مشاهده‌گر"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FolderKanban} label="پروژه‌های حوزه شما" value={fa(data.kpis.totalProjects)} color="teal" />
        <KpiCard icon={ListTodo} label="کل گام‌ها" value={fa(data.kpis.totalTasks)} color="emerald" />
        <KpiCard icon={FileText} label="مستندات" value={fa(data.kpis.documents)} color="amber" />
        <KpiCard icon={AlertTriangle} label="گام‌های تأخیری" value={fa(data.taskStatusDist.DELAYED)} color="rose" />
      </div>

      {/* Status distribution */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">توزیع وضعیت گام‌ها</h3>
            <span className="text-xs text-muted-foreground">{fa(total)} گام</span>
          </div>
          <div className="space-y-3">
            {Object.entries(data.taskStatusDist).map(([key, val]) => {
              const pct = total > 0 ? (val / total) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-muted-foreground">{statusLabels[key]}</div>
                  <div className="flex-1">
                    <Progress value={pct} className="h-2.5" />
                  </div>
                  <div className="w-16 text-left text-sm font-mono">{fa(val)} ({fa(pct.toFixed(1))}٪)</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Progress summary */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold text-foreground">پیشرفت کلی (نسبت تکمیل)</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={avgProgress} className="h-3" />
            </div>
            <span className="text-2xl font-bold text-emerald-600">{fa(avgProgress)}٪</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">درصد گام‌های تکمیل‌شده در حوزه شما</p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    teal: "from-teal-500 to-teal-600",
    emerald: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-amber-600",
    rose: "from-rose-500 to-rose-600",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colors[color]} text-white`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

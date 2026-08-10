"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { KpiCard, SectionCard, ProgressBar, StatusBadge, Spinner, EmptyState } from "@/components/pmo/shared";
import { toFa, faPercent } from "@/lib/jalali";
import { FolderKanban, CheckCircle2, Building2, Network, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  Area,
  AreaChart,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

interface DashboardData {
  referenceLabel?: string;
  referenceMonth?: number;
  kpis: {
    totalProjects: number;
    totalTasks: number;
    totalOrgs: number;
    totalManagements: number;
    totalDeputies: number;
    totalIndependents: number;
    overallProgress: number;
    avgProgress: number;
  };
  projectStatusDist: Record<string, number>;
  taskStatusDist: Record<string, number>;
  deputyRollup: { id: string; code: string; name: string; progress: number; projectCount: number; taskCount: number }[];
  managementRollup: { id: string; code: string; name: string; deputy: string; progress: number; projectCount: number; taskCount: number }[];
  trend: { month: string; monthIdx: number; planned: number; actual: number }[];
  lowProgressProjects: { id: string; code: string; name: string; owner: string; progress: number; taskCount: number; status: string }[];
}

const STATUS_FA: Record<string, string> = {
  NOT_STARTED: "شروع نشده",
  IN_PROGRESS: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  DELAYED: "تأخیر",
  ON_HOLD: "متوقف",
  CANCELLED: "لغو شده",
};

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#14b8a6",
  COMPLETED: "#10b981",
  DELAYED: "#f43f5e",
  ON_HOLD: "#f59e0b",
  CANCELLED: "#71717a",
};

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <EmptyState title="خطا در بارگذاری داشبورد" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!data) return <Spinner className="py-16" />;

  const { kpis } = data;

  // status pie data
  const statusData = Object.entries(data.taskStatusDist).map(([k, v]) => ({ name: STATUS_FA[k] || k, value: v, color: STATUS_COLORS[k] || "#94a3b8" }));
  const totalTasks = statusData.reduce((s, d) => s + d.value, 0);

  // deputy bar (top 8) — truncate long names for the Y-axis
  const deputyBars = data.deputyRollup.slice(0, 8).map((d) => {
    const short = d.name.replace("معاونت ", "");
    return {
      name: short.length > 18 ? short.slice(0, 17) + "…" : short,
      fullName: short,
      progress: d.progress,
      projects: d.projectCount,
    };
  });

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="پیشرفت کلی شرکت" value={faPercent(kpis.overallProgress)} accent="teal" icon={<TrendingUp className="h-5 w-5" />} hint="وزنی Roll-up" />
        <KpiCard label="تعداد برنامه‌ها" value={kpis.totalProjects} accent="violet" icon={<FolderKanban className="h-5 w-5" />} hint={`سال ${toFa(kpis.totalProjects ? 1405 : 1405)}`} />
        <KpiCard label="تعداد فعالیت‌ها" value={kpis.totalTasks} accent="amber" icon={<Activity className="h-5 w-5" />} hint="در همه برنامه‌ها" />
        <KpiCard label="مدیریت‌های متولی" value={kpis.totalManagements} accent="emerald" icon={<Building2 className="h-5 w-5" />} hint="واحد سازمانی" />
        <KpiCard label="معاونت‌ها + مستقل" value={`${toFa(kpis.totalDeputies)}+${toFa(kpis.totalIndependents)}`} accent="rose" icon={<Network className="h-5 w-5" />} hint={`${toFa(kpis.totalDeputies)} معاونت، ${toFa(kpis.totalIndependents)} مدیریت مستقل`} />
        <KpiCard label="میانگین پیشرفت" value={faPercent(kpis.avgProgress)} accent="teal" icon={<CheckCircle2 className="h-5 w-5" />} hint="ساده (غیروزنی)" />
      </div>

      {/* Trend + status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="منحنی پیشرفت (Planned vs Actual)"
          description="پیشرفت وزنی ماهانه کل شرکت — سال ۱۴۰۵"
          className="lg:col-span-2"
          bodyClassName="pt-2"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPlanned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "inherit" }} interval={0} angle={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                <Tooltip
                  formatter={(v: number, n) => [`${toFa(v)}٪`, n === "planned" ? "برنامه‌ریزی‌شده" : "واقعی"]}
                  contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8, border: "1px solid oklch(0.9 0 0)" }}
                />
                <Legend formatter={(v) => (v === "planned" ? "برنامه‌ریزی‌شده" : "واقعی")} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="planned" stroke="#14b8a6" strokeWidth={2} fill="url(#gPlanned)" />
                <Area type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2} fill="url(#gActual)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="توزیع وضعیت فعالیت‌ها" description={`${toFa(totalTasks)} فعالیت در کل سامانه`}>
          <div className="space-y-3">
            {statusData.map((s) => {
              const pct = totalTasks > 0 ? (s.value / totalTasks) * 100 : 0;
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{toFa(s.value)} ({faPercent(pct)})</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Deputy + management performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="پیشرفت معاونت‌ها" description="Roll-up وزنی از مدیریت‌های زیرمجموعه">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deputyBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontFamily: "inherit" }} width={130} />
                <Tooltip
                  formatter={(v: number) => [`${toFa(v)}٪`, "پیشرفت"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""}
                  contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="progress" radius={[0, 6, 6, 0]} barSize={18}>
                  {deputyBars.map((d, i) => (
                    <Cell key={i} fill={d.progress >= 70 ? "#10b981" : d.progress >= 50 ? "#14b8a6" : d.progress >= 30 ? "#f59e0b" : "#f43f5e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="عملکرد مدیریت‌ها (برتر)" description="۲۰ مدیریت برتر بر اساس پیشرفت وزنی">
          <div className="max-h-72 overflow-y-auto custom-scroll -mx-2 px-2 space-y-2">
            {data.managementRollup.slice(0, 20).map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card/50 px-3 py-2">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums", i < 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                  {toFa(i + 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
                    <span className="text-xs tabular-nums font-semibold text-foreground">{faPercent(m.progress)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <ProgressBar value={m.progress} size="sm" />
                    <span className="text-[10px] text-muted-foreground shrink-0">{toFa(m.projectCount)} برنامه</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Low progress projects */}
      <SectionCard title="برنامه‌های نیازمند توجه" description={`کمترین پیشرفت در میان ${toFa(kpis.totalProjects)} برنامه — بر اساس تاریخ مرجع ${data.referenceLabel || ""}`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">کد برنامه</th>
                <th className="px-4 py-2.5 font-medium">عنوان</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">مدیریت متولی</th>
                <th className="px-4 py-2.5 font-medium text-center">فعالیت‌ها</th>
                <th className="px-4 py-2.5 font-medium">پیشرفت</th>
                <th className="px-4 py-2.5 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.lowProgressProjects.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{p.code}</td>
                  <td className="px-4 py-2.5 max-w-xs"><span className="line-clamp-1">{p.name}</span></td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-muted-foreground">{p.owner}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{toFa(p.taskCount)}</td>
                  <td className="px-4 py-2.5 w-32"><ProgressBar value={p.progress} size="sm" showLabel /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

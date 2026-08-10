"use client";
import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar, StatusBadge, KpiCard } from "@/components/pmo/shared";
import { toFa, faPercent, statusColor } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp, Trophy, Gauge, Target, CalendarClock, Building2, Network, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  Line,
  ComposedChart,
} from "recharts";

interface TrendPoint {
  month: string;
  monthIdx: number;
  planned: number;
  actual: number;
  actualRaw: number;
  hasActual: boolean;
  isFuture: boolean;
}

interface TrendData {
  scope: string;
  label: string;
  referenceDate: string;
  referenceLabel: string;
  referenceMonth: number;
  trend: TrendPoint[];
  statusDist: Record<string, number>;
  kpis: {
    totalPrograms: number;
    weightedProgress: number;
    plannedAtRef: number;
    actualAtRef: number;
    varianceAtRef: number;
    spi: number;
  };
}

interface MgmtPerf {
  items: {
    id: string;
    code: string;
    name: string;
    deputy: string;
    progress: number;
    projectCount: number;
    taskCount: number;
    completed: number;
    inProgress: number;
    delayed: number;
    notStarted: number;
  }[];
  referenceLabel: string;
}

interface OrgNode { id: string; code: string; name: string; orgType: string; children: OrgNode[] }

const STATUS_FA: Record<string, string> = {
  NOT_STARTED: "شروع نشده",
  IN_PROGRESS: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  DELAYED: "تأخیر",
  ON_HOLD: "متوقف",
  CANCELLED: "لغو شده",
};

export function ReportsView() {
  const [scope, setScope] = useState("company");
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [perf, setPerf] = useState<MgmtPerf | null>(null);
  const [deputies, setDeputies] = useState<OrgNode[]>([]);
  const [independents, setIndependents] = useState<OrgNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // /api/orgs/tree returns a bare array (roots), NOT { items: [...] }.
    apiFetch<OrgNode[]>("/api/orgs/tree").then((tree) => {
      const root = tree[0];
      if (!root) return;
      const deps = root.children.filter((c) => c.orgType === "DEPUTY" || c.orgType === "CENTER");
      setDeputies(deps);
      setIndependents(root.children.filter((c) => c.orgType === "MANAGEMENT"));
    });
    apiFetch<MgmtPerf>("/api/reports/management-performance").then(setPerf).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<TrendData>(`/api/reports/progress-trend?scope=${encodeURIComponent(scope)}`)
      .then((d) => {
        if (cancelled) return;
        setTrend(d);
        setLoadedScope(scope);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [scope]);

  // Variance data — only meaningful up to the reference month (after that there
  // is no actual data to compare against; carry-forward actual == last actual,
  // so variance would be misleadingly constant).
  const varianceData = useMemo(() => {
    if (!trend) return [];
    return trend.trend
      .filter((t) => !t.isFuture)
      .map((t) => ({
        month: t.month,
        monthIdx: t.monthIdx,
        variance: Math.round((t.planned - t.actual) * 10) / 10,
        planned: t.planned,
        actual: t.actual,
      }));
  }, [trend]);

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!perf || (!trend && loadedScope !== scope)) return <Spinner className="py-16" />;

  const topPerformers = perf.items.filter((i) => i.projectCount > 0).slice(0, 10);
  const bottomPerformers = [...perf.items].filter((i) => i.projectCount > 0).reverse().slice(0, 10);

  // Deputy rollup for the comparison table
  const deputySummary = deputies.map((d) => {
    const mgmts = d.children;
    const childIds = new Set(mgmts.map((m) => m.id));
    const childItems = perf.items.filter((i) => childIds.has(i.id));
    const totalPrograms = childItems.reduce((s, m) => s + m.projectCount, 0);
    const completed = childItems.reduce((s, m) => s + m.completed, 0);
    const inProgress = childItems.reduce((s, m) => s + m.inProgress, 0);
    const delayed = childItems.reduce((s, m) => s + m.delayed, 0);
    const notStarted = childItems.reduce((s, m) => s + m.notStarted, 0);
    const wSum = childItems.reduce((s, m) => s + m.progress * m.projectCount, 0);
    const avgProgress = totalPrograms > 0 ? Math.round((wSum / totalPrograms) * 10) / 10 : 0;
    return { id: d.id, name: d.name, mgmtCount: mgmts.length, totalPrograms, completed, inProgress, delayed, notStarted, avgProgress };
  });

  // Indeps summary
  const indepIds = new Set(independents.map((m) => m.id));
  const indepItems = perf.items.filter((i) => indepIds.has(i.id));
  const indepSummary = {
    name: "مدیریت‌های مستقل",
    mgmtCount: independents.length,
    totalPrograms: indepItems.reduce((s, m) => s + m.projectCount, 0),
    completed: indepItems.reduce((s, m) => s + m.completed, 0),
    inProgress: indepItems.reduce((s, m) => s + m.inProgress, 0),
    delayed: indepItems.reduce((s, m) => s + m.delayed, 0),
    notStarted: indepItems.reduce((s, m) => s + m.notStarted, 0),
    avgProgress: indepItems.length > 0 ? Math.round(indepItems.reduce((s, m) => s + m.progress, 0) / indepItems.length * 10) / 10 : 0,
  };

  // status stacked data for managements (top 12 with projects)
  const statusStack = perf.items.filter((i) => i.projectCount > 0).slice(0, 12).map((m) => ({
    name: m.name.replace("مدیریت ", "").slice(0, 18),
    completed: m.completed,
    inProgress: m.inProgress,
    delayed: m.delayed,
    notStarted: m.notStarted,
  }));

  const k = trend?.kpis;
  const refMonth = trend?.referenceMonth ?? 5;
  const refLabel = trend?.referenceLabel || "";

  return (
    <div className="space-y-4">
      {/* Reference + scope selector */}
      <SectionCard
        title="کنترل محدوده گزارش"
        description="محدوده گزارش را انتخاب کنید — پیشرفت وزنی و S-Curve در آن سطح محاسبه می‌شود"
        bodyClassName="p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          {refLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-950/30 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
              <CalendarClock className="h-3.5 w-3.5" />
              مرجع: {refLabel}
            </span>
          )}
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9 w-full sm:w-72 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>سطح سازمانی</SelectLabel>
                <SelectItem value="company">کل شرکت</SelectItem>
                <SelectItem value="independent">مدیریت‌های مستقل</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>معاونت‌ها</SelectLabel>
                {deputies.map((d) => <SelectItem key={d.id} value={`deputy:${d.id}`}>{d.name}</SelectItem>)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>مدیریت‌ها</SelectLabel>
                {deputies.flatMap((d) => d.children.map((m) => (
                  <SelectItem key={m.id} value={`management:${m.id}`}>{m.name}</SelectItem>
                )))}
                {independents.map((m) => (
                  <SelectItem key={m.id} value={`management:${m.id}`}>{m.name} (مستقل)</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* KPI summary cards */}
      {k && trend && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            label="تعداد برنامه‌ها"
            value={k.totalPrograms}
            unit="برنامه"
            icon={<Target className="h-5 w-5" />}
            accent="teal"
            hint={trend.label}
          />
          <KpiCard
            label="پیشرفت وزنی"
            value={faPercent(k.weightedProgress)}
            icon={<Activity className="h-5 w-5" />}
            accent="emerald"
            hint="Roll-up وزنی"
          />
          <KpiCard
            label="پیشرفت برنامه‌ریزی‌شده"
            value={faPercent(k.plannedAtRef)}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="violet"
            hint={`تا ماه ${toFa(refMonth)}`}
          />
          <KpiCard
            label="انحراف از برنامه"
            value={faPercent(k.varianceAtRef)}
            icon={<AlertTriangle className="h-5 w-5" />}
            accent={k.varianceAtRef > 15 ? "rose" : k.varianceAtRef > 5 ? "amber" : "emerald"}
            hint={`Planned − Actual در ${toFa(refMonth)} ماه`}
          />
          <KpiCard
            label="شاخص عملکرد زمانی (SPI)"
            value={toFa(k.spi)}
            icon={<Gauge className="h-5 w-5" />}
            accent={k.spi >= 0.9 ? "emerald" : k.spi >= 0.7 ? "amber" : "rose"}
            hint={k.spi >= 1 ? "Ahead of schedule" : k.spi >= 0.9 ? "مطابق برنامه" : "عقب‌تر از برنامه"}
          />
        </div>
      )}

      {/* S-Curve + Variance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="منحنی S — پیشرفت وزنی"
          description={trend?.label || "کل شرکت"}
          className="lg:col-span-2"
          bodyClassName="pt-2"
        >
          {loadedScope !== scope || !trend ? <Spinner /> : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rPlanned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="rActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                  <Tooltip
                    formatter={(v: number, n: string) => {
                      const lbl = n === "planned" ? "برنامه‌ریزی‌شده" : n === "actual" ? "واقعی" : n;
                      return [`${toFa(v)}٪`, lbl];
                    }}
                    contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend formatter={(v) => (v === "planned" ? "برنامه‌ریزی‌شده" : "واقعی")} wrapperStyle={{ fontSize: 12 }} />
                  {/* Reference month vertical line */}
                  <ReferenceLine x={trend.trend.find((t) => t.monthIdx === refMonth)?.month} stroke="#6366f1" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: `مرجع: ${toFa(refMonth)} ماه`, position: "top", fill: "#6366f1", fontSize: 10 }} />
                  <Area type="monotone" dataKey="planned" stroke="#14b8a6" strokeWidth={2.5} fill="url(#rPlanned)" />
                  <Area type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2.5} fill="url(#rActual)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            خط نقطه‌چین نیلی = ماه مرجع (امروز). پیشرفت واقعی پس از ماه مرجع به‌صورت خط‌افقی (carry-forward) نمایش داده می‌شود — داده‌ای ثبت نشده است.
          </p>
        </SectionCard>

        <SectionCard
          title="انحراف از برنامه"
          description={`تفاضل Planned − Actual تا ماه ${toFa(refMonth)}`}
        >
          {loadedScope !== scope || !trend ? <Spinner /> : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={varianceData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                  <Tooltip
                    formatter={(v: number) => [`${toFa(v)}٪`, "انحراف (Planned − Actual)"]}
                    contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
                  />
                  <ReferenceLine y={0} stroke="oklch(0.5 0 0)" />
                  <Bar dataKey="variance" radius={[4, 4, 0, 0]}>
                    {varianceData.map((d, i) => (
                      <Cell key={i} fill={d.variance > 20 ? "#f43f5e" : d.variance > 10 ? "#f59e0b" : d.variance > 0 ? "#fbbf24" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            مثبت = تأخیر (واقعی کمتر از برنامه). تنها ماه‌های قبل از مرجع نمایش داده می‌شوند — پس از آن داده واقعی موجود نیست.
          </p>
        </SectionCard>
      </div>

      {/* Status distribution for scope */}
      {trend && (
        <SectionCard
          title="توزیع وضعیت برنامه‌ها در محدوده انتخاب‌شده"
          description={`${toFa(trend.statusDist.NOT_STARTED + trend.statusDist.IN_PROGRESS + trend.statusDist.COMPLETED + trend.statusDist.DELAYED)} برنامه — بر اساس تاریخ مرجع ${refLabel}`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatusMiniCard label="شروع نشده" value={trend.statusDist.NOT_STARTED || 0} color="slate" />
            <StatusMiniCard label="در حال اجرا" value={trend.statusDist.IN_PROGRESS || 0} color="teal" />
            <StatusMiniCard label="تأخیر" value={trend.statusDist.DELAYED || 0} color="rose" />
            <StatusMiniCard label="تکمیل شده" value={trend.statusDist.COMPLETED || 0} color="emerald" />
          </div>
        </SectionCard>
      )}

      {/* Deputy comparison table */}
      <SectionCard
        title="مقایسه عملکرد معاونت‌ها"
        description="پیشرفت وزنی و توزیع وضعیت برنامه‌ها به‌تفکیک معاونت"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/40">
              <tr className="text-right">
                <th className="px-3 py-2 font-medium text-muted-foreground">معاونت / واحد</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">مدیریت‌ها</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">برنامه‌ها</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">پیشرفت وزنی</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">تکمیل</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">در حال اجرا</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">تأخیر</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-center">شروع نشده</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deputySummary.map((d) => (
                <tr key={d.id} className="hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{toFa(d.mgmtCount)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{toFa(d.totalPrograms)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24"><ProgressBar value={d.avgProgress} size="sm" /></div>
                      <span className="text-[11px] font-semibold tabular-nums">{faPercent(d.avgProgress)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{toFa(d.completed)}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-teal-600 dark:text-teal-400">{toFa(d.inProgress)}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">{toFa(d.delayed)}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-500">{toFa(d.notStarted)}</td>
                </tr>
              ))}
              {/* Indeps row */}
              <tr className="hover:bg-accent/30 border-t-2">
                <td className="px-3 py-2 font-medium text-foreground flex items-center gap-1.5">
                  <Network className="h-3.5 w-3.5 text-violet-500" />
                  {indepSummary.name}
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{toFa(indepSummary.mgmtCount)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{toFa(indepSummary.totalPrograms)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-24"><ProgressBar value={indepSummary.avgProgress} size="sm" /></div>
                    <span className="text-[11px] font-semibold tabular-nums">{faPercent(indepSummary.avgProgress)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{toFa(indepSummary.completed)}</td>
                <td className="px-3 py-2 text-center tabular-nums text-teal-600 dark:text-teal-400">{toFa(indepSummary.inProgress)}</td>
                <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">{toFa(indepSummary.delayed)}</td>
                <td className="px-3 py-2 text-center tabular-nums text-slate-500">{toFa(indepSummary.notStarted)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Management performance ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="عملکرد برتر مدیریت‌ها"
          description="۱۰ مدیریت برتر بر اساس پیشرفت وزنی"
          actions={<Trophy className="h-4 w-4 text-amber-500" />}
        >
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scroll">
            {topPerformers.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card/50 px-3 py-2">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                  i === 1 ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" :
                  i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" :
                  "bg-muted text-muted-foreground")}>
                  {toFa(i + 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">{m.deputy} • {toFa(m.projectCount)} برنامه</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20"><ProgressBar value={m.progress} size="sm" /></div>
                  <span className="text-xs font-semibold tabular-nums w-10 text-left">{faPercent(m.progress)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="نیازمند توجه"
          description="۱۰ مدیریت با کمترین پیشرفت"
          actions={<AlertTriangle className="h-4 w-4 text-rose-500" />}
        >
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scroll">
            {bottomPerformers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card/50 px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-xs font-bold">
                  !
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">{m.deputy} • {toFa(m.projectCount)} برنامه • {toFa(m.delayed)} تأخیر</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20"><ProgressBar value={m.progress} size="sm" /></div>
                  <span className="text-xs font-semibold tabular-nums w-10 text-left">{faPercent(m.progress)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Status stacked by management */}
      <SectionCard
        title="توزیع وضعیت برنامه‌ها به‌تفکیک مدیریت"
        description="برنامه‌های تکمیل‌شده، در حال اجرا، تأخیر و شروع‌نشده به ازای هر مدیریت"
      >
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusStack} margin={{ top: 8, right: 8, left: -8, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-40} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => toFa(v)} />
              <Tooltip
                formatter={(v: number, n: string) => [toFa(v), STATUS_FA[n] || n]}
                contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
              />
              <Legend formatter={(v) => STATUS_FA[v] || v} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" stackId="a" fill="#10b981" name="تکمیل شده" />
              <Bar dataKey="inProgress" stackId="a" fill="#14b8a6" name="در حال اجرا" />
              <Bar dataKey="delayed" stackId="a" fill="#f43f5e" name="تأخیر" />
              <Bar dataKey="notStarted" stackId="a" fill="#94a3b8" name="شروع نشده" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}

function StatusMiniCard({ label, value, color }: { label: string; value: number; color: "slate" | "teal" | "rose" | "emerald" }) {
  const colors = {
    slate: { bg: "bg-slate-50 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-400", border: "border-slate-200 dark:border-slate-800" },
    teal: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500", border: "border-teal-200 dark:border-teal-900" },
    rose: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500", border: "border-rose-200 dark:border-rose-900" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-900" },
  }[color];
  return (
    <div className={cn("rounded-lg border p-3 flex items-center gap-3", colors.bg, colors.border)}>
      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", colors.dot)} />
      <div className="min-w-0">
        <p className={cn("text-xl font-bold leading-none tabular-nums", colors.text)}>{toFa(value)}</p>
        <p className="text-[10px] mt-0.5 text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

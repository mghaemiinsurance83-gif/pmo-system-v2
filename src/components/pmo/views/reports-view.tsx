"use client";
import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar } from "@/components/pmo/shared";
import { toFa, faPercent } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, BarChart3, TrendingUp, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface TrendData {
  scope: string;
  label: string;
  trend: { month: string; monthIdx: number; planned: number; actual: number }[];
  statusDist: Record<string, number>;
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
}

interface OrgNode { id: string; code: string; name: string; children: OrgNode[] }

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
  const [managements, setManagements] = useState<{ id: string; name: string; deputy: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: OrgNode[] }>("/api/orgs/tree").then((t) => {
      const deps = t.items[0]?.children || [];
      setDeputies(deps);
      const mgmts: { id: string; name: string; deputy: string }[] = [];
      for (const d of deps) for (const m of d.children) mgmts.push({ id: m.id, name: m.name, deputy: d.name });
      setManagements(mgmts);
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

  // variance data (planned - actual)
  const varianceData = useMemo(() => {
    if (!trend) return [];
    return trend.trend.map((t) => ({
      month: t.month,
      variance: Math.round((t.planned - t.actual) * 10) / 10,
      planned: t.planned,
      actual: t.actual,
    }));
  }, [trend]);

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!perf) return <Spinner className="py-16" />;

  const topPerformers = perf.items.slice(0, 10);
  const bottomPerformers = [...perf.items].reverse().slice(0, 10).filter((i) => i.projectCount > 0);

  // status stacked data for managements (top 12)
  const statusStack = perf.items.slice(0, 12).map((m) => ({
    name: m.name.replace("مدیریت ", "").slice(0, 18),
    completed: m.completed,
    inProgress: m.inProgress,
    delayed: m.delayed,
    notStarted: m.notStarted,
  }));

  return (
    <div className="space-y-4">
      <SectionCard
        title="کنترل محدوده گزارش"
        description="محدوده گزارش را انتخاب کنید — پیشرفت وزنی در آن سطح محاسبه می‌شود"
        bodyClassName="p-3"
      >
        <div className="flex flex-wrap gap-2">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9 w-full sm:w-72 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">کل شرکت</SelectItem>
              {deputies.map((d) => <SelectItem key={d.id} value={`deputy:${d.id}`}>{d.name}</SelectItem>)}
              {managements.map((m) => <SelectItem key={m.id} value={`management:${m.id}`}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* S-Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="منحنی S — پیشرفت وزنی"
          description={trend?.label || "کل شرکت"}
          className="lg:col-span-2"
          bodyClassName="pt-2"
        >
          {loadedScope !== scope ? <Spinner /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rPlanned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="rActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                  <Tooltip
                    formatter={(v: number, n) => [`${toFa(v)}٪`, n === "planned" ? "برنامه‌ریزی‌شده" : "واقعی"]}
                    contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend formatter={(v) => (v === "planned" ? "برنامه‌ریزی‌شده" : "واقعی")} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="planned" stroke="#14b8a6" strokeWidth={2.5} fill="url(#rPlanned)" />
                  <Area type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2.5} fill="url(#rActual)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="انحراف از برنامه" description="تفاضل Planned − Actual (مثبت = تأخیر)">
          {loadedScope !== scope ? <Spinner /> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={varianceData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}٪`} />
                  <Tooltip
                    formatter={(v: number) => [`${toFa(v)}٪`, "انحراف"]}
                    contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="variance" radius={[4, 4, 0, 0]}>
                    {varianceData.map((d, i) => (
                      <Cell key={i} fill={d.variance > 20 ? "#f43f5e" : d.variance > 10 ? "#f59e0b" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

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
      </div>

      {/* Status stacked by management */}
      <SectionCard
        title="توزیع وضعیت برنامه‌ها به‌تفکیک مدیریت"
        description="برنامه‌های تکمیل‌شده، در حال اجرا، و… به ازای هر مدیریت"
      >
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusStack} margin={{ top: 8, right: 8, left: -8, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-40} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => toFa(v)} />
              <Tooltip
                formatter={(v: number, n) => [toFa(v), STATUS_FA[n] || n]}
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

"use client";
import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar, StatusBadge } from "@/components/pmo/shared";
import { toFa, faPercent, PERSIAN_MONTHS_SHORT } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, ZoomIn, ZoomOut, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GanttProject {
  id: string;
  code: string;
  name: string;
  owner: string;
  ownerCode: string | null;
  startMonth: number;
  endMonth: number;
  progress: number;
  status: string;
  weight: number;
  tasks: {
    id: string;
    name: string;
    seq: number;
    weight: number;
    progress: number;
    status: string;
    startMonth: number;
    endMonth: number;
    activeMonths: number[];
    isMilestone: boolean;
  }[];
}

interface GanttData {
  months: string[];
  year: number;
  projects: GanttProject[];
}

const MONTHS = PERSIAN_MONTHS_SHORT;

export function GanttView() {
  const [data, setData] = useState<GanttData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [zoom, setZoom] = useState(60);
  const [showTasks, setShowTasks] = useState<Record<string, boolean>>({});
  const [refMonth, setRefMonth] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<GanttData>("/api/gantt")
      .then(setData)
      .catch((e) => setError(e.message));
    // Fetch the reference month ("today") so we can draw a marker on the gantt.
    apiFetch<{ jm: number }>("/api/system/settings")
      .then((s) => { if (s.jm) setRefMonth(s.jm); })
      .catch(() => {});
  }, []);

  // owners list for filter
  const owners = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const p of data.projects) {
      if (p.ownerCode) map.set(p.ownerCode, p.owner);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "fa"));
  }, [data]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.projects;
    return data.projects.filter((p) => p.ownerCode === filter);
  }, [data, filter]);

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!data) return <Spinner className="py-16" />;

  const colWidth = zoom;
  const labelWidth = 300;

  return (
    <div className="space-y-4">
      <SectionCard
        title="گانت چارت برنامه‌های عملیاتی"
        description={`تایم‌لاین ماهانه شمسی ${toFa(data.year)} — ${toFa(filteredProjects.length)} برنامه`}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(32, z - 12))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(140, z + 12))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <Filter className="h-3.5 w-3.5 ml-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه مدیریت‌ها</SelectItem>
                {owners.map(([code, name]) => (
                  <SelectItem key={code} value={code}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto custom-scroll">
          <div style={{ minWidth: labelWidth + 12 * colWidth + 16 }}>
            {/* Header: months */}
            <div className="sticky top-0 z-20 flex border-b bg-card">
              <div className="sticky right-0 z-10 shrink-0 border-l bg-card px-3 py-2 text-xs font-semibold text-muted-foreground" style={{ width: labelWidth }}>
                برنامه / فعالیت
              </div>
              <div className="flex">
                {data.months.map((m, i) => {
                  const isRef = refMonth === i + 1;
                  return (
                    <div
                      key={m}
                      className={cn(
                        "border-l px-1 py-2 text-center text-[11px] font-medium tabular-nums relative",
                        isRef ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300" : (i + 1) % 3 === 0 ? "bg-muted/40" : "bg-card"
                      )}
                      style={{ width: colWidth }}
                    >
                      {m}
                      {isRef && <span className="absolute -top-0.5 right-0.5 text-[8px] font-bold text-indigo-600 dark:text-indigo-400">امروز</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            <div>
              {filteredProjects.map((p) => {
                const isOpen = showTasks[p.id];
                return (
                  <div key={p.id} className="border-b last:border-b-0">
                    {/* Project row */}
                    <div
                      className="flex items-stretch cursor-pointer hover:bg-accent/30"
                      onClick={() => setShowTasks((s) => ({ ...s, [p.id]: !s[p.id] }))}
                    >
                      <div className="sticky right-0 z-10 shrink-0 border-l bg-card px-3 py-2" style={{ width: labelWidth }}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-[10px] transition-transform", isOpen && "rotate-[-90deg]")}>◀</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{p.owner} • {toFa(p.tasks.length)} فعالیت</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-semibold tabular-nums">{faPercent(p.progress)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="relative flex-1" style={{ minWidth: 12 * colWidth }}>
                        {/* month grid */}
                        <div className="absolute inset-0 flex">
                          {data.months.map((_, i) => (
                            <div key={i} className={cn("border-l", (i + 1) % 3 === 0 ? "bg-muted/20" : "")} style={{ width: colWidth }} />
                          ))}
                        </div>
                        {/* reference (today) vertical line */}
                        {refMonth && (
                          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ right: (refMonth - 1) * colWidth, width: colWidth }} title="ماه مرجع (امروز)">
                            <div className="h-full border-r-2 border-dashed border-indigo-400/70 dark:border-indigo-500/60" />
                          </div>
                        )}
                        {/* project bar */}
                        <GanttBar
                          startMonth={p.startMonth}
                          endMonth={p.endMonth}
                          progress={p.progress}
                          colWidth={colWidth}
                          color="primary"
                          label={p.name}
                        />
                      </div>
                    </div>

                    {/* Task rows */}
                    {isOpen && p.tasks.map((t) => (
                      <div key={t.id} className="flex items-stretch hover:bg-accent/20 bg-muted/10">
                        <div className="sticky right-0 z-10 shrink-0 border-l bg-muted/10 px-3 py-1.5" style={{ width: labelWidth, paddingRight: 32 }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground tabular-nums w-5">{toFa(t.seq)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] truncate">{t.name}</p>
                              <p className="text-[9px] text-muted-foreground tabular-nums">وزن {toFa(t.weight)}</p>
                            </div>
                            <span className="text-[10px] font-semibold tabular-nums shrink-0">{faPercent(t.progress)}</span>
                          </div>
                        </div>
                        <div className="relative flex-1" style={{ minWidth: 12 * colWidth }}>
                          <div className="absolute inset-0 flex">
                            {data.months.map((_, i) => (
                              <div key={i} className={cn("border-l", (i + 1) % 3 === 0 ? "bg-muted/10" : "")} style={{ width: colWidth }} />
                            ))}
                          </div>
                          {/* reference (today) vertical line */}
                          {refMonth && (
                            <div className="pointer-events-none absolute inset-y-0 z-10" style={{ right: (refMonth - 1) * colWidth, width: colWidth }}>
                              <div className="h-full border-r-2 border-dashed border-indigo-400/70 dark:border-indigo-500/60" />
                            </div>
                          )}
                          <GanttBar
                            startMonth={t.startMonth}
                            endMonth={t.endMonth}
                            progress={t.progress}
                            colWidth={colWidth}
                            color={t.isMilestone ? "milestone" : "task"}
                            activeMonths={t.activeMonths}
                            isMilestone={t.isMilestone}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-primary" /> <span>برنامه</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-teal-400" /> <span>فعالیت</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 bg-violet-500" /> <span>نقطه عطف (Milestone)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border border-teal-400 bg-teal-400/30" /> <span>ماه‌های فعال</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-emerald-500/40 border-r-2 border-emerald-600" /> <span>پیشرفت واقعی</span>
        </div>
        {refMonth && (
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 border-r-2 border-dashed border-indigo-400" /> <span>ماه مرجع (امروز)</span>
          </div>
        )}
      </div>
    </div>
  );
}

function GanttBar({
  startMonth,
  endMonth,
  progress,
  colWidth,
  color,
  activeMonths,
  isMilestone,
}: {
  startMonth: number;
  endMonth: number;
  progress: number;
  colWidth: number;
  color: "primary" | "task" | "milestone";
  activeMonths?: number[];
  isMilestone?: boolean;
}) {
  const s = Math.max(1, startMonth);
  const e = Math.min(12, endMonth);
  // RTL: month 1 is on the RIGHT, so position bars from the right edge.
  const right = (s - 1) * colWidth;
  const width = Math.max(colWidth * 0.6, (e - s + 1) * colWidth - 4);

  if (isMilestone) {
    return (
      <div className="absolute inset-y-0 flex items-center" style={{ right: right + width / 2 - 6 }}>
        <div className="h-3 w-3 rotate-45 bg-violet-500 shadow-sm ring-2 ring-violet-200 dark:ring-violet-900" />
      </div>
    );
  }

  const baseColor =
    color === "primary" ? "bg-primary/80 border-primary" : "bg-teal-400/70 border-teal-500";
  const progColor = color === "primary" ? "bg-primary" : "bg-teal-600";

  return (
    <div className="absolute inset-y-1.5 flex items-center" style={{ right: right + 2, width: width - 4 }}>
      <div className={cn("relative h-5 w-full overflow-hidden rounded border", baseColor)}>
        {/* active months overlay */}
        {activeMonths && activeMonths.length > 0 && (
          <div className="absolute inset-0 flex">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const inRange = m >= s && m <= e;
              const active = activeMonths.includes(m);
              if (!inRange) return null;
              return (
                <div
                  key={m}
                  className={cn("h-full border-l border-white/30 first:border-l-0", active ? "bg-teal-300/40" : "")}
                  style={{ width: colWidth }}
                />
              );
            })}
          </div>
        )}
        {/* progress fill */}
        <div
          className={cn("absolute inset-y-0 right-0 transition-all", progColor)}
          style={{ width: `${Math.max(2, progress)}%` }}
        />
        {/* label */}
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white tabular-nums drop-shadow">
          {progress > 15 ? faPercent(progress) : ""}
        </span>
      </div>
    </div>
  );
}

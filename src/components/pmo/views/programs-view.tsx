"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar, StatusBadge } from "@/components/pmo/shared";
import { toFa, faPercent, PERSIAN_MONTHS } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, X, ChevronRight, ChevronLeft, Target, Calendar, Weight, Building2, Layers, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  programTitle: string;
  owner: string;
  ownerCode: string | null;
  ownerOrgId: string;
  progress: number;
  weight: number;
  status: string;
  priority: string;
  startJalali: string;
  endJalali: string;
  startMonth: number | null;
  endMonth: number | null;
  goal: string;
  taskCount: number;
  unitCount: number;
}

interface Deputy {
  id: string;
  code: string;
  name: string;
  children: { id: string; name: string; code: string }[];
}

interface ProjectDetail {
  id: string;
  name: string;
  programTitle: string;
  owner: { name: string; code: string } | null;
  goal: string;
  year: number;
  programNumber: number;
  startJalali: string;
  endJalali: string;
  plannedDuration: number;
  status: string;
  storedStatus: string;
  progress: number;
  overallWeight: number;
  taskCount: number;
  totalWeight: number;
  referenceLabel: string;
  referenceMonth: number;
  unitLinks: { id: string; org: { name: string; code: string }; roleType: string; isPrimary: boolean; participationPercent: number }[];
  tasks: {
    id: string;
    name: string;
    sequenceNo: number;
    weight: number;
    progress: number;
    status: string;
    storedStatus: string;
    startJalali: string;
    endJalali: string;
    isMilestone: boolean;
    taskType: string;
    target: string;
    prereq: string;
    notes: string;
    activeMonths: number[];
    units: { org: { name: string }; roleType: string; isPrimary: boolean }[];
  }[];
  trend: { month: string; planned: number; actual: number }[];
}

interface ProgramsResponse {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: ProjectListItem[];
  summary?: Record<string, number>;
  referenceDate?: string;
  referenceMonth?: number;
  referenceLabel?: string;
}

const STATUS_OPTS = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "NOT_STARTED", label: "شروع نشده" },
  { value: "IN_PROGRESS", label: "در حال اجرا" },
  { value: "DELAYED", label: "تأخیر" },
  { value: "COMPLETED", label: "تکمیل شده" },
];

export function ProgramsView() {
  const [deputies, setDeputies] = useState<Deputy[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [refLabel, setRefLabel] = useState<string>("");
  const [search, setSearch] = useState("");
  const [deputyFilter, setDeputyFilter] = useState("all");
  const [managementFilter, setManagementFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromMonth, setFromMonth] = useState("all");
  const [toMonth, setToMonth] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectListItem | null>(null);
  const pageSize = 12;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: OrgNode[] }>("/api/orgs/tree").then((t) => {
      const deps = (t.items[0]?.children || []).map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        children: d.children.map((c) => ({ id: c.id, name: c.name, code: c.code })),
      }));
      setDeputies(deps);
    });
  }, []);

  // Available managements depend on the selected deputy.
  const availableManagements =
    deputyFilter === "all"
      ? deputies.flatMap((d) => d.children.map((m) => ({ ...m, deputyName: d.name })))
      : deputies.find((d) => d.id === deputyFilter)?.children || [];

  // Reset management filter when the deputy changes (derived-key pattern —
  // setState during render is allowed and avoids the set-state-in-effect rule).
  const [prevDep, setPrevDep] = useState(deputyFilter);
  if (prevDep !== deputyFilter) {
    setPrevDep(deputyFilter);
    setManagementFilter("all");
  }

  // Reset to page 1 when filters change — derived-key pattern.
  const filterKey = `${search}|${deputyFilter}|${managementFilter}|${statusFilter}|${fromMonth}|${toMonth}`;
  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey);
  if (filterKey !== appliedFilterKey) {
    setAppliedFilterKey(filterKey);
    setPage(1);
  }

  const loadKey = `${page}|${filterKey}`;
  const loading = loadedKey !== loadKey;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), summary: "1" });
    if (search) params.set("search", search);
    if (deputyFilter !== "all") params.set("deputyId", deputyFilter);
    if (managementFilter !== "all") params.set("managementId", managementFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fromMonth !== "all") params.set("fromMonth", fromMonth);
    if (toMonth !== "all") params.set("toMonth", toMonth);
    apiFetch<ProgramsResponse>(`/api/projects?${params}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setSummary(data.summary || null);
        setRefLabel(data.referenceLabel || "");
        setLoadedKey(loadKey);
        setError(null);
      })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const resetFilters = () => {
    setSearch("");
    setDeputyFilter("all");
    setManagementFilter("all");
    setStatusFilter("all");
    setFromMonth("all");
    setToMonth("all");
  };

  const hasActiveFilter = search || deputyFilter !== "all" || managementFilter !== "all" || statusFilter !== "all" || fromMonth !== "all" || toMonth !== "all";

  return (
    <div className="space-y-4">
      {/* Reference date banner */}
      {refLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-teal-200/60 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-950/20 px-3 py-2 text-xs">
          <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="text-muted-foreground">تاریخ مرجع گزارش‌ها:</span>
          <span className="font-semibold text-foreground">{refLabel}</span>
          <span className="text-muted-foreground mr-1">— وضعیت برنامه‌ها بر اساس این تاریخ محاسبه می‌شود</span>
        </div>
      )}

      {/* Summary stat chips */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip label="شروع نشده" value={summary.NOT_STARTED || 0} color="slate" active={statusFilter === "NOT_STARTED"} onClick={() => setStatusFilter(statusFilter === "NOT_STARTED" ? "all" : "NOT_STARTED")} />
          <StatChip label="در حال اجرا" value={summary.IN_PROGRESS || 0} color="teal" active={statusFilter === "IN_PROGRESS"} onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "all" : "IN_PROGRESS")} />
          <StatChip label="تأخیر" value={summary.DELAYED || 0} color="rose" active={statusFilter === "DELAYED"} onClick={() => setStatusFilter(statusFilter === "DELAYED" ? "all" : "DELAYED")} />
          <StatChip label="تکمیل شده" value={summary.COMPLETED || 0} color="emerald" active={statusFilter === "COMPLETED"} onClick={() => setStatusFilter(statusFilter === "COMPLETED" ? "all" : "COMPLETED")} />
        </div>
      )}

      {/* Filters */}
      <SectionCard bodyClassName="p-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجو در عنوان، کد، هدف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8 h-9 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={deputyFilter} onValueChange={setDeputyFilter}>
              <SelectTrigger className="h-9 w-full sm:w-52 text-sm"><SelectValue placeholder="معاونت" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه معاونت‌ها</SelectItem>
                {deputies.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={managementFilter} onValueChange={setManagementFilter}>
              <SelectTrigger className="h-9 w-full sm:w-52 text-sm"><SelectValue placeholder="مدیریت" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه مدیریت‌ها</SelectItem>
                {availableManagements.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-36 text-sm"><SelectValue placeholder="وضعیت" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <Calendar className="h-3.5 w-3.5" />
              <span>بازه زمانی:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">از ماه —</SelectItem>
                  {PERSIAN_MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs">تا</span>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">تا ماه —</SelectItem>
                  {PERSIAN_MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                  <X className="h-3.5 w-3.5 ml-1" />
                  پاک کردن فیلترها
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{toFa(total)} برنامه یافت شد</span>
          <span>صفحه {toFa(page)} از {toFa(totalPages)}</span>
        </div>
      </SectionCard>

      {error && <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />}
      {(loading || !items) && !error && <Spinner className="py-16" />}

      {items && !loading && items.length === 0 && (
        <EmptyState title="برنامه‌ای یافت نشد" hint="فیلترها را تغییر دهید" />
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const isDelayed = p.status === "DELAYED";
            const isNotStarted = p.status === "NOT_STARTED";
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={cn(
                  "group text-right rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/40",
                  isDelayed && "border-rose-200/70 dark:border-rose-900/40",
                  isNotStarted && "opacity-90"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono text-muted-foreground mb-0.5 truncate">{p.code}</p>
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{p.programTitle || p.name}</h3>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="space-y-1.5 text-[11px] text-muted-foreground mb-3">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">متولی: {p.owner}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span className="tabular-nums">{p.startJalali} ← {p.endJalali}</span>
                    {isDelayed && (
                      <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-medium mr-auto">
                        <AlertTriangle className="h-3 w-3" />
                        گذشته از موعد
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {toFa(p.taskCount)} فعالیت</span>
                    <span className="flex items-center gap-1"><Weight className="h-3 w-3" /> {toFa(p.unitCount)} واحد همکار</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={p.progress} size="sm" />
                  <span className="text-xs font-semibold tabular-nums shrink-0">{faPercent(p.progress)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums px-2">{toFa(page)} / {toFa(totalPages)}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <ProgramDetailDialog project={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatChip({ label, value, color, active, onClick }: { label: string; value: number; color: "slate" | "teal" | "rose" | "emerald"; active: boolean; onClick: () => void }) {
  const colors = {
    slate: { bg: "bg-slate-100 dark:bg-slate-800/60", text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-400", ring: "ring-slate-400" },
    teal: { bg: "bg-teal-100 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500", ring: "ring-teal-500" },
    rose: { bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500", ring: "ring-rose-500" },
    emerald: { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  }[color];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-right transition-all",
        colors.bg, colors.text,
        active ? `ring-2 ${colors.ring} border-transparent` : "border-border hover:border-primary/40"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", colors.dot)} />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{toFa(value)}</p>
        <p className="text-[10px] mt-0.5 opacity-80">{label}</p>
      </div>
    </button>
  );
}

function ProgramDetailDialog({ project, onClose }: { project: ProjectListItem | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = !!project && loadedId !== project.id;

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    apiFetch<ProjectDetail>(`/api/projects/${project.id}`).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setLoadedId(project.id);
    });
    return () => { cancelled = true; };
  }, [project]);

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{project?.programTitle || project?.name}</DialogTitle>
          <DialogDescription className="text-xs font-mono">{project?.code}</DialogDescription>
        </DialogHeader>
        {loading && <Spinner />}
        {detail && !loading && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              {/* meta */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Meta label="مدیریت متولی" value={detail.owner?.name || "—"} />
                <Meta label="بازه زمانی" value={`${detail.startJalali} ← ${detail.endJalali}`} />
                <Meta label="تعداد فعالیت" value={toFa(detail.taskCount)} />
                <Meta label="مجموع وزن" value={toFa(detail.totalWeight)} />
              </div>
              {detail.referenceLabel && (
                <div className="flex items-center gap-2 rounded-lg border border-teal-200/60 bg-teal-50/40 dark:border-teal-900/40 dark:bg-teal-950/20 px-3 py-1.5 text-[11px]">
                  <Clock className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                  <span className="text-muted-foreground">وضعیت بر اساس تاریخ مرجع:</span>
                  <span className="font-semibold text-foreground">{detail.referenceLabel}</span>
                </div>
              )}
              {detail.goal && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-semibold mb-1 text-foreground">هدف برنامه</p>
                  <p className="text-muted-foreground leading-relaxed">{detail.goal}</p>
                </div>
              )}

              {/* progress */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="text-center shrink-0">
                  <p className="text-2xl font-bold tabular-nums text-primary">{faPercent(detail.progress)}</p>
                  <p className="text-[10px] text-muted-foreground">پیشرفت وزنی</p>
                </div>
                <div className="flex-1">
                  <ProgressBar value={detail.progress} size="lg" />
                </div>
                <div className="shrink-0">
                  <StatusBadge status={detail.status} />
                </div>
              </div>

              {/* units */}
              {detail.unitLinks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 text-foreground">واحدهای همکار ({toFa(detail.unitLinks.length)})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.unitLinks.map((u) => (
                      <span key={u.id} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]", u.isPrimary ? "bg-primary/10 text-primary font-medium" : "bg-muted text-muted-foreground")}>
                        {u.org.name}
                        <span className="text-[9px] opacity-70">({u.roleType})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* tasks */}
              <div>
                <p className="text-xs font-semibold mb-2 text-foreground">فعالیت‌ها ({toFa(detail.tasks.length)})</p>
                <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scroll pl-1">
                  {detail.tasks.map((t) => (
                    <div key={t.id} className="rounded-lg border bg-card p-2.5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] tabular-nums text-muted-foreground">{toFa(t.sequenceNo)}.</span>
                            <p className="text-xs font-medium line-clamp-1">{t.name}</p>
                            {t.isMilestone && <span className="text-[9px] px-1 rounded bg-violet-100 text-violet-700">نقطه عطف</span>}
                          </div>
                          {t.target && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">هدف: {t.target}</p>}
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-12">وزن {toFa(t.weight)}</span>
                        <ProgressBar value={t.progress} size="sm" />
                        <span className="text-[10px] font-semibold tabular-nums shrink-0 w-10 text-left">{faPercent(t.progress)}</span>
                      </div>
                      {t.units.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">مجری: {t.units.map((u) => u.org.name).join("، ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground mt-0.5 truncate">{value}</p>
    </div>
  );
}

interface OrgNode { id: string; code: string; name: string; children: OrgNode[] }

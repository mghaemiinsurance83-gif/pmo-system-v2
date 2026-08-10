"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar, StatusBadge } from "@/components/pmo/shared";
import { toFa, faPercent } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, X, ChevronRight, ChevronLeft, Target, Calendar, Weight } from "lucide-react";
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
  goal: string;
  taskCount: number;
  unitCount: number;
}

interface Deputy {
  id: string;
  code: string;
  name: string;
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
  progress: number;
  overallWeight: number;
  taskCount: number;
  totalWeight: number;
  unitLinks: { id: string; org: { name: string; code: string }; roleType: string; isPrimary: boolean; participationPercent: number }[];
  tasks: {
    id: string;
    name: string;
    sequenceNo: number;
    weight: number;
    progress: number;
    status: string;
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

export function ProgramsView() {
  const [deputies, setDeputies] = useState<Deputy[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [deputyFilter, setDeputyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectListItem | null>(null);
  const pageSize = 12;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: OrgNode[] }>("/api/orgs/tree").then((t) => {
      const deps = t.items[0]?.children || [];
      setDeputies(deps);
    });
  }, []);

  // Reset to page 1 when filters change — derived-key pattern (setState-during-render is allowed).
  const filterKey = `${search}|${deputyFilter}|${statusFilter}`;
  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey);
  if (filterKey !== appliedFilterKey) {
    setAppliedFilterKey(filterKey);
    setPage(1);
  }

  const loadKey = `${page}|${filterKey}`;
  const loading = loadedKey !== loadKey;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    if (deputyFilter !== "all") params.set("deputyId", deputyFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    apiFetch<{ total: number; items: ProjectListItem[] }>(`/api/projects?${params}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setLoadedKey(loadKey);
        setError(null);
      })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <SectionCard bodyClassName="p-3">
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
            <SelectTrigger className="h-9 w-full sm:w-56 text-sm"><SelectValue placeholder="معاونت" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه معاونت‌ها</SelectItem>
              {deputies.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full sm:w-40 text-sm"><SelectValue placeholder="وضعیت" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              <SelectItem value="IN_PROGRESS">در حال اجرا</SelectItem>
              <SelectItem value="COMPLETED">تکمیل شده</SelectItem>
              <SelectItem value="DELAYED">تأخیر</SelectItem>
              <SelectItem value="NOT_STARTED">شروع نشده</SelectItem>
            </SelectContent>
          </Select>
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
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group text-right rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-muted-foreground mb-0.5">{p.code}</p>
                  <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{p.programTitle || p.name}</h3>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="space-y-1.5 text-[11px] text-muted-foreground mb-3">
                <div className="flex items-center gap-1.5">
                  <Target className="h-3 w-3 shrink-0" />
                  <span className="truncate">متولی: {p.owner}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{p.startJalali} ← {p.endJalali}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Weight className="h-3 w-3" /> {toFa(p.taskCount)} فعالیت</span>
                  <span>{toFa(p.unitCount)} واحد همکار</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar value={p.progress} size="sm" />
                <span className="text-xs font-semibold tabular-nums shrink-0">{faPercent(p.progress)}</span>
              </div>
            </button>
          ))}
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
              {detail.goal && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-semibold mb-1 text-foreground">هدف برنامه</p>
                  <p className="text-muted-foreground leading-relaxed">{detail.goal}</p>
                </div>
              )}

              {/* progress */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-primary">{faPercent(detail.progress)}</p>
                  <p className="text-[10px] text-muted-foreground">پیشرفت وزنی</p>
                </div>
                <div className="flex-1">
                  <ProgressBar value={detail.progress} size="lg" />
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
                <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scroll">
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

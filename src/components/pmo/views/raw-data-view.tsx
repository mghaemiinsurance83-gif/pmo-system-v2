"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, StatusBadge } from "@/components/pmo/shared";
import { toFa } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, X, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RawSheetItem {
  id: string;
  sheetName: string;
  projectTitle: string;
  managerRaw: string;
  programNum: number;
  weight: number;
  rowCount: number;
  rawRowCount: number;
  status: string;
  mappedProject: { id: string; code: string; name: string; owner: string } | null;
}

interface RawSheetDetail {
  id: string;
  sheetName: string;
  projectTitle: string;
  managerRaw: string;
  programTitle: string;
  programNum: number;
  weight: number;
  startDateRaw: string;
  endDateRaw: string;
  goalRaw: string;
  rowCount: number;
  status: string;
  importedAt: string;
  batch: { fileName: string; label: string };
  mappedProject: { id: string; code: string; name: string; owner: string } | null;
  rows: {
    id: string;
    rowNumber: number;
    rowNoRaw: string;
    taskDesc: string;
    weight: number;
    executorsRaw: string;
    target: string;
    prereq: string;
    notes: string;
    activeMonthsRaw: string;
    mappingStatus: string;
    mappedTaskId: string;
    rawJson: string;
  }[];
}

const MAPPING_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  MAPPED: { label: "نگاشت شده", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", icon: CheckCircle2 },
  UNMAPPED: { label: "نگاشت نشده", color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", icon: AlertCircle },
  PENDING: { label: "در انتظار", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", icon: Clock },
  CONFLICT: { label: "تداخل", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", icon: AlertCircle },
};

export function RawDataView() {
  const [items, setItems] = useState<RawSheetItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<RawSheetItem | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const pageSize = 15;
  const loadKey = `${page}|${search}`;
  const loading = loadedKey !== loadKey;

  // Reset page when search changes — derived-key pattern.
  const [appliedSearch, setAppliedSearch] = useState(search);
  if (search !== appliedSearch) {
    setAppliedSearch(search);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    apiFetch<{ total: number; items: RawSheetItem[] }>(`/api/raw?${params}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setLoadedKey(loadKey);
      })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [loadKey]);

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (loading || !items) return <Spinner className="py-16" />;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const mapped = items.filter((i) => i.mappedProject).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">شیت‌های واردشده</p>
          <p className="text-xl font-bold tabular-nums">{toFa(total)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">نگاشت موفق</p>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{toFa(mapped)} / {toFa(items.length)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">منبع داده</p>
          <p className="text-sm font-medium mt-1">(v27-1) برنامه‌های ۱۴۰۵</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">لایه</p>
          <p className="text-sm font-medium mt-1">Raw + Clean (دو لایه)</p>
        </div>
      </div>

      <SectionCard
        title="لایه داده خام (Raw Layer)"
        description="هر شیت Excel به‌صورت یک رکورد ذخیره شده — ردیف‌های خام قابل Trace به تسک‌های نگاشت‌شده"
        bodyClassName="p-0"
        actions={
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="نام شیت…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pr-8 w-40 text-xs" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">شیت</th>
                <th className="px-3 py-2.5 font-medium hidden md:table-cell">عنوان پروژه (خام)</th>
                <th className="px-3 py-2.5 font-medium hidden lg:table-cell">مدیر (خام)</th>
                <th className="px-3 py-2.5 font-medium text-center">ردیف</th>
                <th className="px-3 py-2.5 font-medium">برنامه نگاشت‌شده</th>
                <th className="px-3 py-2.5 font-medium text-center">جزئیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-mono text-xs">{s.sheetName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell max-w-xs"><span className="text-xs line-clamp-1">{s.projectTitle || "—"}</span></td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">{s.managerRaw || "—"}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-xs">{toFa(s.rawRowCount)}</td>
                  <td className="px-3 py-2.5">
                    {s.mappedProject ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-mono truncate">{s.mappedProject.code}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500">نگاشت نشده</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(s)}>
                      مشاهده <ArrowLeft className="h-3 w-3 mr-1" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <div className="flex items-center justify-center gap-2 border-t px-3 py-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</Button>
            <span className="text-xs text-muted-foreground tabular-nums px-2">{toFa(page)} / {toFa(totalPages)}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</Button>
          </div>
        )}
      </SectionCard>

      <RawDetailDialog item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RawDetailDialog({ item, onClose }: { item: RawSheetItem | null; onClose: () => void }) {
  const [detail, setDetail] = useState<RawSheetDetail | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = !!item && loadedId !== item.id;

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    apiFetch<RawSheetDetail>(`/api/raw/${item.id}`).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setLoadedId(item.id);
    });
    return () => { cancelled = true; };
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            شیت: <span className="font-mono">{item?.sheetName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">دادهٔ خام Excel و نگاشت به لایه Clean</DialogDescription>
        </DialogHeader>
        {loading && <Spinner />}
        {detail && !loading && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pb-4">
              {/* Raw header meta */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <RawMeta label="عنوان پروژه (خام)" value={detail.projectTitle} />
                <RawMeta label="مدیر پروژه (خام)" value={detail.managerRaw} />
                <RawMeta label="عنوان برنامه (خام)" value={detail.programTitle} />
                <RawMeta label="شماره برنامه" value={detail.programNum ? toFa(detail.programNum) : "—"} />
                <RawMeta label="وزن برنامه" value={detail.weight ? `${toFa(detail.weight)}٪` : "—"} />
                <RawMeta label="تاریخ شروع (خام)" value={detail.startDateRaw || "—"} />
                <RawMeta label="تاریخ خاتمه (خام)" value={detail.endDateRaw || "—"} />
                <RawMeta label="هدف برنامه (خام)" value={detail.goalRaw || "—"} />
                <RawMeta label="تعداد ردیف" value={toFa(detail.rows.length)} />
              </div>

              {/* Mapping result */}
              {detail.mappedProject && (
                <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    نتیجه نگاشت
                  </p>
                  <p className="text-xs">
                    این شیت به برنامه <span className="font-mono font-semibold">{detail.mappedProject.code}</span> — «{detail.mappedProject.name}» با مدیریت متولی «{detail.mappedProject.owner}» نگاشت شده است.
                  </p>
                </div>
              )}

              {/* Raw rows */}
              <div>
                <p className="text-xs font-semibold mb-2">ردیف‌های خام ({toFa(detail.rows.length)})</p>
                <div className="space-y-1.5">
                  {detail.rows.map((r) => {
                    const ms = MAPPING_STATUS[r.mappingStatus] || MAPPING_STATUS.PENDING;
                    const MsIcon = ms.icon;
                    return (
                      <div key={r.id} className="rounded-lg border bg-card p-2.5">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] tabular-nums text-muted-foreground w-5">{r.rowNoRaw || toFa(r.rowNumber)}</span>
                            <p className="text-xs font-medium line-clamp-2">{r.taskDesc || "—"}</p>
                          </div>
                          <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0", ms.color)}>
                            <MsIcon className="h-3 w-3" />
                            {ms.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] text-muted-foreground">
                          {r.weight != null && <div><span className="opacity-60">وزن:</span> <span className="font-medium tabular-nums">{toFa(r.weight)}</span></div>}
                          {r.executorsRaw && <div className="col-span-2"><span className="opacity-60">مجریان:</span> <span className="font-medium">{r.executorsRaw}</span></div>}
                          {r.target && <div className="col-span-2"><span className="opacity-60">هدف:</span> <span className="font-medium line-clamp-1">{r.target}</span></div>}
                          {r.notes && <div className="col-span-2"><span className="opacity-60">ملاحظات:</span> <span className="font-medium line-clamp-1">{r.notes}</span></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RawMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

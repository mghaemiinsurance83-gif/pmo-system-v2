"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, FolderKanban, FileText, ListTodo } from "lucide-react";

interface ProjectItem {
  id: string;
  projectCode: string;
  projectName: string;
  programTitle: string | null;
  startJalali: string | null;
  endJalali: string | null;
  progressPercent: number;
  overallWeight: number;
  status: string;
  priority: string;
  ownerOrg: { id: string; name: string; code: string } | null;
  taskCount: number;
  documentCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "شروع نشده",
  IN_PROGRESS: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  DELAYED: "تأخیر",
};
const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  IN_STARTED: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  DELAYED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function PortalProjects({ onSelectProject }: { onSelectProject?: (id: string) => void }) {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "12", ...(search && { search }), ...(status !== "ALL" && { status }) });
    fetch(`/api/portal/projects?${params}`)
      .then((r) => r.json())
      .then((d) => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [page, search, status]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="جستجوی پروژه..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pr-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="وضعیت" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
            <SelectItem value="NOT_STARTED">شروع نشده</SelectItem>
            <SelectItem value="IN_PROGRESS">در حال اجرا</SelectItem>
            <SelectItem value="COMPLETED">تکمیل شده</SelectItem>
            <SelectItem value="DELAYED">تأخیر</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} پروژه یافت شد</div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-8 w-full" /></CardContent></Card>)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="hover:border-primary/40 transition-colors cursor-pointer" onClick={() => onSelectProject?.(p.id)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-muted-foreground truncate">{p.projectCode}</p>
                    <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mt-0.5">{p.projectName}</p>
                  </div>
                  <Badge variant="secondary" className={STATUS_COLORS[p.status] || ""}>{STATUS_LABELS[p.status] || p.status}</Badge>
                </div>
                {p.ownerOrg && (
                  <p className="text-xs text-muted-foreground">متولی: {p.ownerOrg.name}</p>
                )}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><ListTodo className="h-3 w-3" />{fa(p.taskCount)} گام</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{fa(p.documentCount)} سند</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">پیشرفت</span>
                    <span className="font-mono font-medium">{fa(p.progressPercent.toFixed(1))}٪</span>
                  </div>
                  <Progress value={p.progressPercent} className="h-1.5" />
                </div>
                {(p.startJalali || p.endJalali) && (
                  <p className="text-[11px] text-muted-foreground font-mono">{p.startJalali ?? "؟"} ← {p.endJalali ?? "؟"}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button>
          <span className="text-sm text-muted-foreground">صفحه {fa(page)} از {fa(totalPages)}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>بعدی</Button>
        </div>
      )}
    </div>
  );
}

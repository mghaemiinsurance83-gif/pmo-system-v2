"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Search, ListTodo, FileText, UploadCloud, Download, Loader2, Calendar, Clock, ChevronLeft, FileCheck2, FileX2, FileClock } from "lucide-react";
import { DocumentUploader } from "./document-uploader";
import { useSession } from "next-auth/react";

interface TaskItem {
  id: string;
  taskCode: string | null;
  taskName: string;
  sequenceNo: number;
  weight: number;
  progressPercent: number;
  status: string;
  dynamicStatus: string;
  startJalali: string | null;
  endJalali: string | null;
  isMilestone: boolean;
  project: { id: string; projectName: string; projectCode: string };
  documentCount: number;
}

interface DocItem {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  forMonth: number | null;
  title: string | null;
  description: string | null;
  uploadedAt: string;
  uploadedBy: { name: string } | null;
  approvalStatus: string; // PENDING | APPROVED | REJECTED
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedBy: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "شروع نشده",
  IN_PROGRESS: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  DELAYED: "تأخیر",
};
const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  IN_PROGRESS: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  DELAYED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

// Document approval status config
const DOC_STATUS: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  PENDING: { label: "در انتظار", icon: FileClock, classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  APPROVED: { label: "تأیید شده", icon: FileCheck2, classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  REJECTED: { label: "رد شده", icon: FileX2, classes: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }
function fmtSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

const PERSIAN_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

export function PortalTasks() {
  const { data: session } = useSession();
  const canEdit = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER" || session?.user?.role === "LIAISON";
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [projectId, setProjectId] = useState<string>("");
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "20", ...(search && { search }), ...(status !== "ALL" && { status }), ...(projectId && { projectId }) });
    fetch(`/api/portal/tasks?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [page, search, status, projectId]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجوی گام..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pr-8" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="وضعیت" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
            <SelectItem value="IN_PROGRESS">در حال اجرا</SelectItem>
            <SelectItem value="NOT_STARTED">در انتظار انجام</SelectItem>
            <SelectItem value="COMPLETED">انجام‌شده</SelectItem>
            <SelectItem value="DELAYED">تأخیر</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} گام یافت شد</div>

      {/* Tasks list */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><ListTodo className="h-10 w-10 mx-auto mb-2 opacity-40" />گامی یافت نشد</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Card key={t.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {t.isMilestone && <Badge variant="outline" className="text-amber-700 border-amber-300">milestone</Badge>}
                      <span className="text-[11px] font-mono text-muted-foreground">ردیف {fa(t.sequenceNo)}</span>
                      <span className="text-[11px] text-muted-foreground truncate">• {t.project.projectName}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-1">{t.taskName}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      {t.endJalali && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t.endJalali}</span>}
                      {t.documentCount > 0 && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{fa(t.documentCount)} سند</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />وزن: {fa(t.weight)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge variant="secondary" className={STATUS_COLORS[t.dynamicStatus] || ""}>{STATUS_LABELS[t.dynamicStatus] || t.dynamicStatus}</Badge>
                    <span className="text-sm font-mono font-semibold">{fa(t.progressPercent.toFixed(0))}٪</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditTaskId(t.id)} disabled={!canEdit}>
                    {canEdit ? "ویرایش" : "مشاهده"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button>
          <span className="text-sm text-muted-foreground">صفحه {fa(page)} از {fa(totalPages)}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>بعدی</Button>
        </div>
      )}

      {/* Edit dialog */}
      {editTaskId && (
        <TaskEditDialog taskId={editTaskId} canEdit={canEdit} onClose={() => setEditTaskId(null)} onSaved={() => {
          setEditTaskId(null);
          // refresh
          setPage(page);
          const sig = ++reqId.current;
          const params = new URLSearchParams({ page: String(page), pageSize: "20", ...(search && { search }), ...(status !== "ALL" && { status }), ...(projectId && { projectId }) });
          fetch(`/api/portal/tasks?${params}`, { credentials: "include" }).then(r=>r.json()).then(d=>{if(reqId.current===sig){setItems(d.data||[]);}});
        }} />
      )}
    </div>
  );
}

function TaskEditDialog({ taskId, canEdit, onClose, onSaved }: { taskId: string; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const [task, setTask] = useState<TaskItem | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [forMonth, setForMonth] = useState(5); // default to current operational month (مرداد)
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/tasks/${taskId}`, { credentials: "include" }).then(r=>r.json()),
      fetch(`/api/portal/tasks/${taskId}/documents`, { credentials: "include" }).then(r=>r.json()),
      fetch(`/api/system/settings`, { credentials: "include" }).then(r=>r.json()).catch(() => ({ jm: 5 })),
    ]).then(([taskData, docsData, sysSettings]) => {
      setTask(taskData.data || null);
      setProgress(taskData.data?.progressPercent ?? 0);
      setForMonth(sysSettings?.jm || 5);
      setDocs(docsData.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [taskId]);

  async function saveProgress() {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/tasks/${taskId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressPercent: progress, forMonth, comment }),
        credentials: "include",
      });
      if (res.ok) {
        toast.success("پیشرفت ثبت شد");
        onSaved();
      } else {
        const e = await res.json();
        toast.error(e.error?.message || "خطا در ثبت");
      }
    } finally { setSaving(false); }
  }

  async function deleteDoc(docId: string) {
    if (!confirm("حذف این مستند؟")) return;
    const res = await fetch(`/api/portal/documents/${docId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setDocs(docs.filter((d) => d.id !== docId));
      toast.success("مستند حذف شد");
    }
  }

  if (loading) return <Dialog open onOpenChange={onClose}><DialogContent><div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></DialogContent></Dialog>;
  if (!task) return <Dialog open onOpenChange={onClose}><DialogContent><div className="py-8 text-center text-muted-foreground">گام یافت نشد</div></DialogContent></Dialog>;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">ویرایش گام</DialogTitle>
          <DialogDescription className="text-right">{task.taskName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Task info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">پروژه:</span> {task.project.projectName}</div>
            <div><span className="text-muted-foreground">وضعیت فعلی:</span> {STATUS_LABELS[task.dynamicStatus] || task.status}</div>
            <div><span className="text-muted-foreground">موعود:</span> {task.endJalali || "—"}</div>
            <div><span className="text-muted-foreground">پیشرفت فعلی:</span> {fa(task.progressPercent.toFixed(0))}٪</div>
          </div>

          {/* Progress slider */}
          {canEdit && (
            <div className="space-y-2 rounded-lg border p-4">
              <Label>ثبت درصد پیشرفت جدید</Label>
              <div className="flex items-center gap-4">
                <Slider value={[progress]} onValueChange={(v) => setProgress(v[0])} max={100} step={5} className="flex-1" />
                <span className="text-xl font-bold text-primary w-16 text-left">{fa(progress)}٪</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">بازه زمانی (ماه)</Label>
                  <Select value={String(forMonth)} onValueChange={(v) => setForMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERSIAN_MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">توضیحات / گزارش</Label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="گزارش دوره..." rows={2} />
                </div>
              </div>
              <Button onClick={saveProgress} disabled={saving} className="w-full">
                {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                ثبت پیشرفت
              </Button>
            </div>
          )}

          {/* Documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><FileText className="h-4 w-4" />مستندات این گام</Label>
              <span className="text-xs text-muted-foreground">{fa(docs.length)} فایل</span>
            </div>

            {canEdit && <DocumentUploader taskId={taskId} onUploaded={async () => {
              const d = await fetch(`/api/portal/tasks/${taskId}/documents`, { credentials: "include" }).then(r=>r.json());
              setDocs(d.data || []);
            }} />}

            {/* Document list */}
            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">هنوز مستندی بارگذاری نشده</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll">
                {docs.map((d) => {
                  const statusCfg = DOC_STATUS[d.approvalStatus] || DOC_STATUS.PENDING;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div key={d.id} className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent/50">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm truncate">{d.title || d.originalFileName}</p>
                          <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${statusCfg.classes}`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {statusCfg.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {fa(fmtSize(d.sizeBytes))} • {d.forMonth ? PERSIAN_MONTHS[d.forMonth - 1] : "—"} • {d.uploadedBy?.name || "—"}
                        </p>
                        {d.approvalStatus === "REJECTED" && d.rejectionReason && (
                          <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">دلیل رد: {d.rejectionReason}</p>
                        )}
                      </div>
                      <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" title="دانلود"><Download className="h-4 w-4" /></Button>
                      </a>
                      {canEdit && <Button variant="ghost" size="icon" onClick={() => deleteDoc(d.id)} title="حذف"><ChevronLeft className="h-4 w-4 text-destructive" /></Button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>بستن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

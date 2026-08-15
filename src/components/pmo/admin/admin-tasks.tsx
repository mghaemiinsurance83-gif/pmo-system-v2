"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, ListTodo, Trash2 } from "lucide-react";

interface TaskItem {
  id: string; taskCode: string | null; taskName: string; sequenceNo: number; weight: number;
  progressPercent: number; status: string; startJalali: string | null; endJalali: string | null;
  project: { id: string; projectName: string; projectCode: string };
}
interface ProjectOpt { id: string; projectName: string }

const STATUS_LABELS: Record<string,string> = { NOT_STARTED: "شروع نشده", IN_PROGRESS: "در حال اجرا", COMPLETED: "تکمیل", DELAYED: "تأخیر" };

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminTasks() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const reqId = useRef(0);

  const load = () => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "20", ...(search && { search }) });
    fetch(`/api/portal/tasks?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetch("/api/admin/projects?pageSize=1000", { credentials: "include" }).then(r=>r.json()).then(d=>setProjects((d.data||[]).map((p:any)=>({id:p.id, projectName:p.projectName})))).catch(()=>{}); }, []);
  useEffect(load, [page, search]);

  async function del(id: string) {
    if (!confirm("حذف این گام؟")) return;
    const res = await fetch(`/api/admin/tasks/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast.success("حذف شد"); load(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجوی گام..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-8" />
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="ml-2 h-4 w-4" />گام جدید</Button>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} گام</div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : (
        <div className="space-y-2">
          {items.map(t => (
            <Card key={t.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{STATUS_LABELS[t.status] || t.status}</Badge>
                      <span className="text-[11px] font-mono text-muted-foreground">ردیف {fa(t.sequenceNo)}</span>
                    </div>
                    <p className="text-sm font-medium truncate mt-0.5">{t.taskName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.project.projectName}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-mono">{fa(t.progressPercent.toFixed(0))}٪</div>
                    <div className="text-[11px] text-muted-foreground">وزن: {fa(t.weight)}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => del(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}>قبلی</Button>
          <span className="text-sm text-muted-foreground">صفحه {fa(page)} از {fa(totalPages)}</span>
          <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}>بعدی</Button>
        </div>
      )}

      {showCreate && <CreateTaskDialog projects={projects} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateTaskDialog({ projects, onClose, onSaved }: { projects: ProjectOpt[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ projectId: "", taskName: "", weight: 0, startJalali: "", endJalali: "", target: "", notes: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), credentials: "include" });
      if (res.ok) { toast.success("گام ایجاد شد"); onSaved(); }
      else { const e = await res.json(); toast.error(e.error?.message || "خطا"); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-right">گام جدید</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>پروژه</Label>
            <Select value={form.projectId} onValueChange={v=>setForm({...form, projectId: v})}>
              <SelectTrigger><SelectValue placeholder="انتخاب پروژه..." /></SelectTrigger>
              <SelectContent className="max-h-72">{projects.map(p=><SelectItem key={p.id} value={p.id}>{p.projectName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>شرح گام</Label><Textarea value={form.taskName} onChange={e=>setForm({...form, taskName: e.target.value})} rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>وزن</Label><Input type="number" value={form.weight} onChange={e=>setForm({...form, weight: Number(e.target.value)})} /></div>
            <div className="space-y-1"><Label>شروع (شمسی)</Label><Input placeholder="1405/03/01" value={form.startJalali} onChange={e=>setForm({...form, startJalali: e.target.value})} /></div>
          </div>
          <div className="space-y-1"><Label>پایان (شمسی)</Label><Input placeholder="1405/06/31" value={form.endJalali} onChange={e=>setForm({...form, endJalali: e.target.value})} /></div>
          <div className="space-y-1"><Label>هدف کمی</Label><Input value={form.target} onChange={e=>setForm({...form, target: e.target.value})} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={submit} disabled={saving || !form.projectId || !form.taskName}>{saving ? "..." : "ایجاد گام"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

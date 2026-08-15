"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, FolderKanban, ListTodo, Trash2, Edit } from "lucide-react";

interface ProjectItem {
  id: string; projectCode: string; projectName: string; programTitle: string | null;
  startJalali: string | null; endJalali: string | null; progressPercent: number; status: string; priority: string;
  ownerOrg: { id: string; name: string; code: string } | null; taskCount: number;
}
interface Org { id: string; name: string; code: string; level: number }

const STATUS_LABELS: Record<string,string> = { NOT_STARTED: "شروع نشده", IN_PROGRESS: "در حال اجرا", COMPLETED: "تکمیل", DELAYED: "تأخیر" };

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminProjects() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = () => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "20", ...(search && { search }) });
    fetch(`/api/admin/projects?${params}`)
      .then(r => r.json())
      .then(d => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetch("/api/admin/orgs").then(r=>r.json()).then(d=>setOrgs(d.data||[])).catch(()=>{}); }, []);
  useEffect(load, [page, search]);

  async function del(id: string) {
    if (!confirm("حذف این پروژه؟")) return;
    const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("حذف شد"); load(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-8" />
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="ml-2 h-4 w-4" />پروژه جدید</Button>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} پروژه</div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : (
        <div className="space-y-2">
          {items.map(p => (
            <Card key={p.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{STATUS_LABELS[p.status] || p.status}</Badge>
                      <span className="text-[11px] font-mono text-muted-foreground">{p.projectCode}</span>
                    </div>
                    <p className="text-sm font-medium truncate mt-0.5">{p.projectName}</p>
                    <p className="text-[11px] text-muted-foreground">{p.ownerOrg?.name} • {fa(p.taskCount)} گام</p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-mono">{fa(p.progressPercent.toFixed(0))}٪</div>
                    <Progress value={p.progressPercent} className="h-1.5 w-20 mt-1" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditId(p.id)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      {showCreate && <ProjectDialog orgs={orgs} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {editId && <ProjectDialog orgs={orgs} projectId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
    </div>
  );
}

function ProjectDialog({ orgs, projectId, onClose, onSaved }: { orgs: Org[]; projectId?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ projectName: "", programTitle: "", ownerOrgId: "", startJalali: "", endJalali: "", priority: "NORMAL", status: "NOT_STARTED", progressPercent: 0, goal: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetch(`/api/admin/projects?pageSize=1000`).then(r=>r.json()).then(d => {
        const p = (d.data || []).find((x: ProjectItem) => x.id === projectId);
        if (p) setForm({ projectName: p.projectName, programTitle: p.programTitle || "", ownerOrgId: p.ownerOrg?.id || "", startJalali: p.startJalali || "", endJalali: p.endJalali || "", priority: "NORMAL", status: p.status, progressPercent: p.progressPercent, goal: "", description: "" });
      });
    }
  }, [projectId]);

  async function submit() {
    setSaving(true);
    try {
      const url = projectId ? `/api/admin/projects/${projectId}` : "/api/admin/projects";
      const method = projectId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, ownerOrgId: form.ownerOrgId || undefined }) });
      if (res.ok) { toast.success(projectId ? "به‌روزرسانی شد" : "ایجاد شد"); onSaved(); }
      else { const e = await res.json(); toast.error(e.error?.message || "خطا"); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-right">{projectId ? "ویرایش پروژه" : "پروژه جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>نام پروژه</Label><Input value={form.projectName} onChange={e=>setForm({...form, projectName: e.target.value})} /></div>
          <div className="space-y-1"><Label>عنوان برنامه</Label><Input value={form.programTitle} onChange={e=>setForm({...form, programTitle: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>واحد مالک</Label>
              <Select value={form.ownerOrgId} onValueChange={v=>setForm({...form, ownerOrgId: v})}>
                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent className="max-h-72">{orgs.map(o=><SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>وضعیت</Label>
              <Select value={form.status} onValueChange={v=>setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">شروع نشده</SelectItem>
                  <SelectItem value="IN_PROGRESS">در حال اجرا</SelectItem>
                  <SelectItem value="COMPLETED">تکمیل</SelectItem>
                  <SelectItem value="DELAYED">تأخیر</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>شروع (شمسی)</Label><Input placeholder="1405/03/01" value={form.startJalali} onChange={e=>setForm({...form, startJalali: e.target.value})} /></div>
            <div className="space-y-1"><Label>پایان (شمسی)</Label><Input placeholder="1405/06/31" value={form.endJalali} onChange={e=>setForm({...form, endJalali: e.target.value})} /></div>
          </div>
          {projectId && (
            <div className="space-y-1"><Label>درصد پیشرفت</Label><Input type="number" min={0} max={100} value={form.progressPercent} onChange={e=>setForm({...form, progressPercent: Number(e.target.value)})} /></div>
          )}
          <div className="space-y-1"><Label>هدف</Label><Textarea value={form.goal} onChange={e=>setForm({...form, goal: e.target.value})} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={submit} disabled={saving || !form.projectName}>{saving ? "..." : "ذخیره"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

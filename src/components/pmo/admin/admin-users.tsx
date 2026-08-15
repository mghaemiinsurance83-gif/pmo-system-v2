"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, UserPlus, Edit, Ban, Users as UsersIcon } from "lucide-react";

interface UserItem {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  authSource: string;
  org: { id: string; name: string; code: string } | null;
  liaisonOrgs: { org: { id: string; name: string; code: string } }[];
}

const ROLE_LABELS: Record<string, string> = { ADMIN: "ادمین", MANAGER: "مدیر", LIAISON: "رابط", VIEWER: "مشاهده‌گر" };
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  MANAGER: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  LIAISON: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  VIEWER: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminUsers({ onEdit }: { onEdit: (id: string) => void }) {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const reqId = useRef(0);

  const load = () => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "20", ...(search && { search }), ...(role !== "ALL" && { role }) });
    fetch(`/api/admin/users?${params}`)
      .then(r => r.json())
      .then(d => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  };

  useEffect(load, [page, search, role]);

  async function toggleActive(u: UserItem) {
    if (!confirm(u.isActive ? "غیرفعال کردن این کاربر؟" : "فعال‌سازی مجدد؟")) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !u.isActive }) });
    if (res.ok) { toast.success("به‌روزرسانی شد"); load(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجوی نام/نام کاربری..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-8" />
        </div>
        <Select value={role} onValueChange={v => { setRole(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="نقش" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه نقش‌ها</SelectItem>
            <SelectItem value="ADMIN">ادمین</SelectItem>
            <SelectItem value="MANAGER">مدیر</SelectItem>
            <SelectItem value="LIAISON">رابط</SelectItem>
            <SelectItem value="VIEWER">مشاهده‌گر</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)}><UserPlus className="ml-2 h-4 w-4" />افزودن کاربر</Button>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} کاربر</div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : (
        <div className="space-y-2">
          {items.map(u => (
            <Card key={u.id} className={u.isActive ? "" : "opacity-60"}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white text-sm font-bold shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <Badge variant="secondary" className={ROLE_COLORS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                      {!u.isActive && <Badge variant="outline" className="text-rose-600">غیرفعال</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">@{u.username} • {u.org?.name || "بدون واحد"} • آخرین ورود: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fa-IR") : "—"}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(u.id)}><Edit className="ml-1 h-3.5 w-3.5" />ویرایش</Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(u)} title={u.isActive ? "غیرفعال" : "فعال"}><Ban className="h-4 w-4" /></Button>
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

      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgs, setOrgs] = useState<{id:string,name:string,code:string,level:number}[]>([]);
  const [form, setForm] = useState({ username: "", name: "", email: "", role: "VIEWER", orgId: "", password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch("/api/admin/orgs").then(r => r.json()).then(d => setOrgs(d.data || [])).catch(() => {}); }, []);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email || undefined, orgId: form.orgId || undefined, liaisonOrgIds: [] }),
      });
      if (res.ok) { toast.success("کاربر ایجاد شد"); onCreated(); }
      else { const e = await res.json(); toast.error(e.error?.message || "خطا"); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-right">افزودن کاربر جدید</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>نام کاربری</Label>
            <Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Label>نام و نام خانوادگی</Label>
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>رمز عبور</Label>
              <Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label>نقش</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">ادمین</SelectItem>
                  <SelectItem value="MANAGER">مدیر</SelectItem>
                  <SelectItem value="LIAISON">رابط</SelectItem>
                  <SelectItem value="VIEWER">مشاهده‌گر</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>واحد متبوع</Label>
            <Select value={form.orgId} onValueChange={v => setForm({...form, orgId: v})}>
              <SelectTrigger><SelectValue placeholder="انتخاب واحد..." /></SelectTrigger>
              <SelectContent>
                {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={submit} disabled={saving || !form.username || !form.name}>{saving ? "در حال ذخیره..." : "ایجاد کاربر"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

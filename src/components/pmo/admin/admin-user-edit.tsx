"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChevronRight, Shield, Clock, FileText, Activity, Save } from "lucide-react";

interface UserData {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  authSource: string;
  adDistinguishedName: string | null;
  createdAt: string;
  org: { id: string; name: string; code: string } | null;
  liaisonOrgs: { id: string; org: { id: string; name: string; code: string } }[];
  _count: { documents: number; progressRecords: number; auditLogs: number };
  authEvents: { id: string; action: string; ipAddress: string | null; createdAt: string; errorReason: string | null }[];
}

interface Org { id: string; name: string; code: string; level: number; orgType: string }

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminUserEdit({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("");
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [liaisonOrgIds, setLiaisonOrgIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/users/${userId}`, { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/orgs", { credentials: "include" }).then(r => r.json()),
    ]).then(([u, o]) => {
      setUser(u);
      setRole(u.role);
      setOrgId(u.org?.id || "");
      setName(u.name);
      setEmail(u.email || "");
      setLiaisonOrgIds(u.liaisonOrgs?.map((l: any) => l.org.id) || []);
      setOrgs(o.data || []);
      setLoading(false);
    });
  }, [userId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || null, role, orgId: orgId || null, password: password || undefined, liaisonOrgIds }),
        credentials: "include",
      });
      if (res.ok) { toast.success("ذخیره شد"); onBack(); }
      else { const e = await res.json(); toast.error(e.error?.message || "خطا"); }
    } finally { setSaving(false); }
  }

  function toggleLiaison(id: string) {
    setLiaisonOrgIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  if (loading) return <div className="space-y-4">{Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>)}</div>;
  if (!user) return <div className="text-muted-foreground">یافت نشد</div>;

  const childrenOf = (parentId: string | null, level: number) => orgs.filter(o => (parentId ? o.level === level && o.id !== parentId : o.level === level));

  return (
    <div className="space-y-4 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-2"><ChevronRight className="ml-1 h-4 w-4" />بازگشت به لیست</Button>

      {/* Profile header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white text-xl font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg">{user.name}</h3>
              <p className="text-sm text-muted-foreground">@{user.username} • {user.email || "بدون ایمیل"}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{user.authSource === "AD" ? "Active Directory" : "محلی"}</Badge>
                {user.isActive ? <Badge variant="secondary" className="text-emerald-600">فعال</Badge> : <Badge variant="secondary" className="text-rose-600">غیرفعال</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />ویرایش نقش و واحد</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>نام</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ایمیل</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label>نقش</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">ادمین</SelectItem>
                  <SelectItem value="MANAGER">مدیر واحد</SelectItem>
                  <SelectItem value="LIAISON">رابط مدیریت</SelectItem>
                  <SelectItem value="VIEWER">مشاهده‌گر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>رمز عبور جدید (اختیاری)</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="—"/>
            </div>
          </div>

          {/* Org tree picker */}
          <div className="space-y-2">
            <Label>واحد متبوع (سلسله‌مراتب)</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue placeholder="انتخاب واحد..." /></SelectTrigger>
              <SelectContent className="max-h-80">
                {orgs.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {"  ".repeat(o.level)}{o.level > 0 ? "└ " : ""}{o.name} ({o.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Liaison orgs */}
          <div className="space-y-2">
            <Label>رابطی برای واحدهای دیگر (اختیاری)</Label>
            <div className="max-h-48 overflow-y-auto custom-scroll rounded-md border p-2 space-y-1">
              {orgs.map(o => (
                <label key={o.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent/50 cursor-pointer">
                  <input type="checkbox" checked={liaisonOrgIds.includes(o.id)} onChange={() => toggleLiaison(o.id)} className="rounded" />
                  <span className="text-sm">{"  ".repeat(o.level)}{o.name}</span>
                  <span className="text-[11px] text-muted-foreground mr-auto">{o.code}</span>
                </label>
              ))}
            </div>
            {liaisonOrgIds.length > 0 && <p className="text-xs text-muted-foreground">{fa(liaisonOrgIds.length)} واحد انتخاب شده</p>}
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}><Save className="ml-2 h-4 w-4" />{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</Button>
            <Button variant="outline" onClick={onBack}>انصراف</Button>
          </div>
        </CardContent>
      </Card>

      {/* Activity stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <div className="text-xl font-bold">{fa(user._count.documents)}</div>
          <div className="text-[11px] text-muted-foreground">مستندات</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Activity className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <div className="text-xl font-bold">{fa(user._count.progressRecords)}</div>
          <div className="text-[11px] text-muted-foreground">ثبت پیشرفت</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Shield className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <div className="text-xl font-bold">{fa(user._count.auditLogs)}</div>
          <div className="text-[11px] text-muted-foreground">رویداد ممیزی</div>
        </CardContent></Card>
      </div>

      {/* Auth events */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-primary" />تاریخچه ورود</h3>
          {user.authEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">ورودی ثبت نشده</p>
          ) : (
            <div className="space-y-1.5">
              {user.authEvents.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-sm border-b last:border-0 pb-1.5 last:pb-0">
                  <Badge variant={e.action === "LOGIN_SUCCESS" ? "secondary" : "outline"} className={e.action === "LOGIN_SUCCESS" ? "text-emerald-600" : "text-rose-600"}>
                    {e.action === "LOGIN_SUCCESS" ? "موفق" : "ناموفق"}
                  </Badge>
                  <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString("fa-IR")}</span>
                  {e.ipAddress && <span className="text-xs text-muted-foreground mr-auto">{e.ipAddress}</span>}
                  {e.errorReason && <span className="text-xs text-rose-600">{e.errorReason}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

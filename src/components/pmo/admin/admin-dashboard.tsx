"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FolderKanban, ListTodo, FileText, Activity, ScrollText } from "lucide-react";

interface DashboardData {
  kpis: { totalProjects: number; totalTasks: number; totalOrgs: number };
  projectStatusDist: { NOT_STARTED: number; IN_PROGRESS: number; COMPLETED: number; DELAYED: number };
}

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [counts, setCounts] = useState({ users: 0, documents: 0, audits: 0 });
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    Promise.all([
      fetch("/api/dashboard", { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/users?pageSize=1", { credentials: "include" }).then(r => r.json()).catch(() => ({ meta: { total: 0 } })),
    ]).then(([dash, users]) => {
      if (reqId.current === sig) {
        setData(dash);
        setCounts(c => ({ ...c, users: users.meta?.total ?? 0 }));
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>)}</div>;

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="کاربران" value={fa(counts.users)} color="from-rose-500 to-rose-600" />
        <StatCard icon={FolderKanban} label="پروژه‌ها" value={fa(k?.totalProjects ?? 0)} color="from-teal-500 to-teal-600" />
        <StatCard icon={ListTodo} label="گام‌ها" value={fa(k?.totalTasks ?? 0)} color="from-emerald-500 to-emerald-600" />
        <StatCard icon={FileText} label="مستندات" value={fa(counts.documents)} color="from-amber-500 to-amber-600" />
        <StatCard icon={Activity} label="واحدهای سازمانی" value={fa(k?.totalOrgs ?? 0)} color="from-violet-500 to-violet-600" />
        <StatCard icon={ScrollText} label="رویدادهای ممیزی" value={fa(counts.audits)} color="from-slate-500 to-slate-600" />
      </div>

      {data?.projectStatusDist && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-4">توزیع وضعیت پروژه‌ها</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "شروع نشده", val: data.projectStatusDist.NOT_STARTED, color: "text-slate-600" },
                { label: "در حال اجرا", val: data.projectStatusDist.IN_PROGRESS, color: "text-teal-600" },
                { label: "تکمیل شده", val: data.projectStatusDist.COMPLETED, color: "text-emerald-600" },
                { label: "تأخیر", val: data.projectStatusDist.DELAYED, color: "text-rose-600" },
              ].map(s => (
                <div key={s.label} className="rounded-lg border p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{fa(s.val)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-white`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent></Card>
  );
}

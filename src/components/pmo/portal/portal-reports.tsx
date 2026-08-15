"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, ListTodo, CheckCircle2 } from "lucide-react";

interface ReportData {
  totalProjects: number;
  totalTasks: number;
  avgProgress: number;
  statusDist: { NOT_STARTED: number; IN_PROGRESS: number; COMPLETED: number; DELAYED: number };
  delayedTasks: Array<{ id: string; taskName: string; delayDays: number; progressPercent: number; project: { projectName: string; projectCode: string } }>;
  perProject: Array<{ id: string; name: string; code: string; progress: number; status: string }>;
}

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function PortalReports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    fetch("/api/portal/reports", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (reqId.current === sig) { setData(d.data); setLoading(false); } })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div>;
  if (!data) return <div className="text-muted-foreground">خطا</div>;

  const total = data.statusDist.NOT_STARTED + data.statusDist.IN_PROGRESS + data.statusDist.COMPLETED + data.statusDist.DELAYED;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">میانگین پیشرفت</p><p className="text-2xl font-bold text-emerald-600 mt-1">{fa(data.avgProgress)}٪</p></div>
            <TrendingUp className="h-8 w-8 text-emerald-500" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">کل گام‌ها</p><p className="text-2xl font-bold mt-1">{fa(data.totalTasks)}</p></div>
            <ListTodo className="h-8 w-8 text-teal-500" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">گام‌های تکمیل‌شده</p><p className="text-2xl font-bold text-emerald-600 mt-1">{fa(data.statusDist.COMPLETED)}</p></div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">گام‌های تأخیری</p><p className="text-2xl font-bold text-rose-600 mt-1">{fa(data.statusDist.DELAYED)}</p></div>
            <AlertTriangle className="h-8 w-8 text-rose-500" />
          </div>
        </CardContent></Card>
      </div>

      {/* Status distribution */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">توزیع وضعیت گام‌ها</h3>
          <div className="space-y-3">
            {[
              { label: "شروع نشده", val: data.statusDist.NOT_STARTED, color: "bg-slate-400" },
              { label: "در حال اجرا", val: data.statusDist.IN_PROGRESS, color: "bg-teal-500" },
              { label: "تکمیل شده", val: data.statusDist.COMPLETED, color: "bg-emerald-500" },
              { label: "تأخیر", val: data.statusDist.DELAYED, color: "bg-rose-500" },
            ].map((s) => {
              const pct = total > 0 ? (s.val / total) * 100 : 0;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm">{s.label}</div>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-left text-sm font-mono">{fa(s.val)} ({fa(pct.toFixed(1))}٪)</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Delayed tasks */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h3 className="font-semibold">انحراف از برنامه — گام‌های تأخیری</h3>
          </div>
          {data.delayedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">گام تأخیری وجود ندارد</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scroll">
              {data.delayedTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-md border p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.taskName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.project.projectName}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <Badge variant="destructive">{fa(t.delayDays)} روز تأخیر</Badge>
                    <p className="text-[11px] text-muted-foreground mt-1">پیشرفت: {fa(t.progressPercent.toFixed(0))}٪</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-project progress */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">پیشرفت به تفکیک واحد</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scroll">
            {data.perProject.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-40 text-sm truncate">{p.name}</div>
                <div className="flex-1"><Progress value={p.progress} className="h-2" /></div>
                <div className="w-12 text-left text-sm font-mono">{fa(p.progress.toFixed(0))}٪</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollText } from "lucide-react";

interface AuditItem {
  id: string; entityType: string; entityId: string; action: string;
  oldValue: string | null; newValue: string | null; createdAt: string;
  user: { id: string; name: string; username: string } | null;
}

const ACTION_LABELS: Record<string,string> = { CREATE: "ایجاد", UPDATE: "ویرایش", DELETE: "حذف" };
const ACTION_COLORS: Record<string,string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  UPDATE: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  DELETE: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};
const ENTITY_LABELS: Record<string,string> = { USER: "کاربر", PROJECT: "پروژه", TASK: "گام", DOCUMENT: "مستند", ORGANIZATION: "واحد" };

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }

export function AdminAuditLog() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const reqId = useRef(0);

  useEffect(() => {
    const sig = ++reqId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "50", ...(entityType !== "ALL" && { entityType }), ...(action !== "ALL" && { action }) });
    fetch(`/api/admin/audit-log?${params}`)
      .then(r => r.json())
      .then(d => { if (reqId.current === sig) { setItems(d.data || []); setTotalPages(d.meta?.totalPages ?? 1); setTotal(d.meta?.total ?? 0); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [page, entityType, action]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={entityType} onValueChange={v => { setEntityType(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="نوع موجودیت" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه موجودیت‌ها</SelectItem>
            <SelectItem value="USER">کاربر</SelectItem>
            <SelectItem value="PROJECT">پروژه</SelectItem>
            <SelectItem value="TASK">گام</SelectItem>
            <SelectItem value="DOCUMENT">مستند</SelectItem>
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={v => { setAction(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="عملیات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">همه عملیات</SelectItem>
            <SelectItem value="CREATE">ایجاد</SelectItem>
            <SelectItem value="UPDATE">ویرایش</SelectItem>
            <SelectItem value="DELETE">حذف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{fa(total)} رویداد</div>

      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><ScrollText className="h-10 w-10 mx-auto mb-2 opacity-40" />رویدادی یافت نشد</CardContent></Card>
      ) : (
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto custom-scroll">
          {items.map(a => (
            <Card key={a.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={ACTION_COLORS[a.action] || ""}>{ACTION_LABELS[a.action] || a.action}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{ENTITY_LABELS[a.entityType] || a.entityType}</span>
                      {a.user && <span className="text-muted-foreground"> توسط {a.user.name}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleString("fa-IR")}</p>
                  </div>
                  {a.newValue && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer">جزئیات</summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap text-[10px]">{a.newValue}</pre>
                    </details>
                  )}
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
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState } from "@/components/pmo/shared";
import { toFa } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, Database, Key, Link2, Table2 } from "lucide-react";

interface SchemaField {
  name: string;
  type: string;
  pk?: boolean;
  fk?: string;
  unique?: boolean;
  required?: boolean;
  default?: string;
  desc?: string;
}
interface SchemaTable {
  table: string;
  group: string;
  description: string;
  fields: SchemaField[];
}
interface SchemaData {
  tables: SchemaTable[];
  groups: string[];
  relationships: { from: string; to: string; type: string; label: string }[];
}

const GROUP_LABEL: Record<string, string> = {
  Master: "جداول اصلی",
  Dictionary: "فرهنگ‌نامه",
  Transaction: "تراکنشی",
  Audit: "ممیزی",
  Raw: "داده خام",
};

const GROUP_COLOR: Record<string, string> = {
  Master: "border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/20",
  Dictionary: "border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20",
  Transaction: "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20",
  Audit: "border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20",
  Raw: "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20",
};

export function DataModelView() {
  const [data, setData] = useState<SchemaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>("all");

  useEffect(() => {
    apiFetch<SchemaData>("/api/schema").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!data) return <Spinner className="py-16" />;

  const tables = activeGroup === "all" ? data.tables : data.tables.filter((t) => t.group === activeGroup);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <Table2 className="h-8 w-8 text-teal-500" />
          <div><p className="text-[11px] text-muted-foreground">جداول</p><p className="text-xl font-bold tabular-nums">{toFa(data.tables.length)}</p></div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <Key className="h-8 w-8 text-amber-500" />
          <div><p className="text-[11px] text-muted-foreground">روابط</p><p className="text-xl font-bold tabular-nums">{toFa(data.relationships.length)}</p></div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <Database className="h-8 w-8 text-violet-500" />
          <div><p className="text-[11px] text-muted-foreground">گروه‌ها</p><p className="text-xl font-bold tabular-nums">{toFa(data.groups.length)}</p></div>
        </div>
        <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
          <Link2 className="h-8 w-8 text-emerald-500" />
          <div><p className="text-[11px] text-muted-foreground">نرمال‌سازی</p><p className="text-xl font-bold">3NF</p></div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveGroup("all")}
          className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-colors", activeGroup === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}
        >
          همه ({toFa(data.tables.length)})
        </button>
        {data.groups.map((g) => {
          const count = data.tables.filter((t) => t.group === g).length;
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-colors", activeGroup === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}
            >
              {GROUP_LABEL[g] || g} ({toFa(count)})
            </button>
          );
        })}
      </div>

      {/* ERD relationships */}
      <SectionCard title="نمودار ارتباط موجودیت‌ها (ERD)" description="روابط کلیدی بین جداول" bodyClassName="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.relationships.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
              <span className="font-mono font-semibold text-teal-700 dark:text-teal-300 shrink-0">{r.from}</span>
              <span className="text-muted-foreground text-[10px] text-center px-1 shrink-0">{r.type}</span>
              <span className="font-mono font-semibold text-amber-700 dark:text-amber-300 shrink-0">{r.to}</span>
              <span className="text-[10px] text-muted-foreground truncate mr-auto">{r.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Tables grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tables.map((t) => (
          <div key={t.table} className={cn("rounded-xl border-2 overflow-hidden", GROUP_COLOR[t.group] || "border-border")}>
            <div className="border-b bg-card/60 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  {t.table}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-card text-muted-foreground">{GROUP_LABEL[t.group] || t.group}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium w-6">#</th>
                    <th className="px-2 py-1.5 font-medium">فیلد</th>
                    <th className="px-2 py-1.5 font-medium">نوع</th>
                    <th className="px-2 py-1.5 font-medium">کلید/مرجع</th>
                    <th className="px-2 py-1.5 font-medium hidden sm:table-cell">توضیح</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {t.fields.map((f, i) => (
                    <tr key={i} className="hover:bg-accent/30">
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{toFa(i + 1)}</td>
                      <td className="px-2 py-1 font-mono font-medium">
                        <div className="flex items-center gap-1">
                          {f.pk && <Key className="h-3 w-3 text-amber-500" />}
                          {f.name}
                        </div>
                      </td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{f.type}</td>
                      <td className="px-2 py-1 font-mono text-[10px]">
                        {f.pk && <span className="text-amber-600">PK</span>}
                        {f.fk && <span className="text-violet-600">FK→{f.fk}</span>}
                        {f.unique && !f.pk && <span className="text-teal-600">UQ</span>}
                        {!f.required && !f.pk && <span className="text-muted-foreground">?</span>}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground hidden sm:table-cell max-w-xs"><span className="line-clamp-1">{f.desc || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState } from "@/components/pmo/shared";
import { toFa } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { AlertTriangle, Search, X, BookMarked, ArrowLeft, GitBranch } from "lucide-react";
import { Input } from "@/components/ui/input";

interface DictItem {
  id: string;
  code: string;
  name: string;
  displayName: string;
  parent: string | null;
  projectCount: number;
  aliases: { id: string; originalName: string; aliasType: string; source: string; confidence: number }[];
}

const ALIAS_TYPE_LABEL: Record<string, string> = {
  CANONICAL: "نام رسمی",
  ALIAS: "نام مستعار",
  SYNONYM: "مترادف",
  ABBREVIATION: "مخفف",
  LEGACY: "نام قدیمی",
  ALTERNATIVE: "نام جایگزین",
  TYPO: "غلط املایی",
  IMPORTED: "واردشده",
};

const ALIAS_TYPE_COLOR: Record<string, string> = {
  CANONICAL: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  ALIAS: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  SYNONYM: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  ABBREVIATION: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  LEGACY: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  ALTERNATIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  TYPO: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  IMPORTED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function DictionaryView() {
  const [items, setItems] = useState<DictItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: DictItem[] }>("/api/dictionary")
      .then((d) => { setItems(d.items); if (d.items[0]) setSelectedId(d.items[0].id); })
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (!search) return items;
    const q = search.trim();
    return items.filter((it) =>
      it.name.includes(q) ||
      it.aliases.some((a) => a.originalName.includes(q))
    );
  }, [items, search]);

  const selected = items?.find((i) => i.id === selectedId) || null;

  if (error) return <EmptyState title="خطا" hint={error} icon={<AlertTriangle className="h-8 w-8" />} />;
  if (!items) return <Spinner className="py-16" />;

  const totalAliases = items.reduce((s, i) => s + i.aliases.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">واحدهای کانونیکال</p>
          <p className="text-xl font-bold tabular-nums">{toFa(items.length)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">مجموع نام‌های نگاشت‌شده</p>
          <p className="text-xl font-bold tabular-nums">{toFa(totalAliases)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">میانگین نام‌ها به ازای واحد</p>
          <p className="text-xl font-bold tabular-nums">{toFa(Math.round(totalAliases / items.length))}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">هدف فرهنگ‌نامه</p>
          <p className="text-sm font-medium leading-tight mt-1">حذف تکرار و استانداردسازی</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <SectionCard
          title="واحدهای کانونیکال"
          description={`${toFa(filtered.length)} واحد`}
          className="lg:col-span-1"
          bodyClassName="p-0"
        >
          <div className="border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجوی نام یا مستعار…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pr-8 text-xs"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto custom-scroll">
            {filtered.map((it) => (
              <button
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                className={cn(
                  "w-full text-right px-3 py-2 border-b hover:bg-accent/40 transition-colors",
                  selectedId === it.id && "bg-primary/10 border-r-2 border-r-primary"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{it.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{toFa(it.aliases.length)} نام</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{it.parent || "مستقیم"}</span>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{toFa(it.projectCount)} برنامه</span>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Detail */}
        <SectionCard
          title={selected?.name || "انتخاب کنید"}
          description={selected ? `${selected.parent || "مستقیم"} • کد: ${selected.code}` : "یک واحد را انتخاب کنید"}
          className="lg:col-span-2"
        >
          {!selected ? (
            <EmptyState title="یک واحد انتخاب کنید" icon={<BookMarked className="h-8 w-8" />} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-gradient-to-br from-teal-500/5 to-transparent p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">نام کانونیکال</span>
                </div>
                <p className="text-lg font-bold text-foreground">{selected.displayName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  این نام به‌عنوان مرجع اصلی در تمام جداول عملیاتی استفاده می‌شود. نام‌های خام Excel به این شناسه نگاشت می‌شوند.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" />
                    نام‌های نگاشت‌شده ({toFa(selected.aliases.length)})
                  </h4>
                  <span className="text-[10px] text-muted-foreground">منبع: Excel</span>
                </div>
                <div className="space-y-1.5">
                  {selected.aliases.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{a.originalName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded", ALIAS_TYPE_COLOR[a.aliasType] || "bg-muted text-muted-foreground")}>
                          {ALIAS_TYPE_LABEL[a.aliasType] || a.aliasType}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{toFa(Math.round(a.confidence * 100))}٪</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">مزیت این ساختار</p>
                <p className="leading-relaxed">
                  وقتی در Excel نام «فاوا»، «آی‌تی» یا «IT» ظاهر می‌شود، همگی به همین واحد کانونیکال نگاشت می‌شوند و در گزارش‌ها، گانت و داشبورد به‌صورت یک موجودیت واحد لحاظ می‌گردند — بدون تکرار یا خطای املایی.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

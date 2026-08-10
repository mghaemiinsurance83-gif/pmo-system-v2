"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import {
  SectionCard,
  Spinner,
  EmptyState,
  ProgressBar,
  StatusBadge,
  KpiCard,
} from "@/components/pmo/shared";
import { toFa, faPercent, PERSIAN_MONTHS, statusColor } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Handshake,
  Crown,
  Scale,
  CalendarRange,
  ChevronDown,
  Users,
  TrendingUp,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────
interface StepExecutor {
  orgId: string;
  name: string;
  code: string;
  isMe: boolean;
  isPrimary: boolean;
}

interface CollabStep {
  taskId: string;
  sequenceNo: number;
  taskCode: string | null;
  taskName: string;
  weight: number;
  progressPercent: number;
  status: string;
  startJalali: string | null;
  endJalali: string | null;
  activeMonths: number[];
  inRange: boolean;
  executorCount: number;
  mySharePercent: number;
  myWeightShare: number;
  myProgressContribution: number;
  myExecutors: StepExecutor[];
}

interface CollabProgram {
  projectId: string;
  code: string;
  name: string;
  title: string | null;
  goal: string | null;
  programNumber: number | null;
  weight: number;
  progress: number;
  status: string;
  startJalali: string | null;
  endJalali: string | null;
  owner: { id: string; name: string; code: string } | null;
  steps: CollabStep[];
  myWeightShare: number;
  myProgressContribution: number;
  mySharePercent: number;           // % of full-program weight in the time window
  inRangeSharePercent: number;      // % of in-range weight (for reference)
  inRangeStepCount: number;
  totalStepCount: number;
  programTotalWeightInRange: number;
  programTotalWeightAllYear: number;
}

interface CollabResponse {
  unit: { id: string; code: string; name: string; orgType: string; isDeputy: boolean };
  referenceDate: string;
  referenceLabel: string;
  period: { type: string; lo: number; hi: number; label: string };
  summary: {
    collaboratingPrograms: number;
    collaboratingSteps: number;
    totalSteps: number;
    totalWeightShare: number;
    totalProgressContribution: number;
    avgSharePercent: number;
    overallSharePercent: number;
  };
  programs: CollabProgram[];
}

// Reuse the participation tree to populate the org selector.
interface TreeManagement { id: string; code: string; name: string; orgType: string; }
interface TreeDeputy extends TreeManagement { managements: TreeManagement[]; }
interface ParticipationTree {
  company: { id: string; name: string } | null;
  deputies: TreeDeputy[];
  independents: TreeManagement[];
}

const SEASONS = [
  { value: "1", label: "بهار (فروردین − خرداد)" },
  { value: "2", label: "تابستان (تیر − شهریور)" },
  { value: "3", label: "پاییز (مهر − آذر)" },
  { value: "4", label: "زمستان (دی − اسفند)" },
];

// ─── Main view ───────────────────────────────────────────────────────────────
export function CollaborationView() {
  const [tree, setTree] = useState<ParticipationTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string>("");
  const [period, setPeriod] = useState<"monthly" | "seasonal">("monthly");
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [season, setSeason] = useState("2");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Load org tree once (reused from /api/participation/programs)
  useEffect(() => {
    apiFetch<ParticipationTree>("/api/participation/programs")
      .then((t) => {
        setTree(t);
        const first = t.deputies[0];
        if (first) setOrgId(first.id);
      })
      .catch((e) => setTreeError(e.message));
  }, []);

  // Signature-based fetch: one state object keyed by the input signature, with a
  // stale-request guard. All setState happens inside async callbacks (never
  // synchronously in the effect body), so this complies with the
  // react-hooks/set-state-in-effect rule.
  const [result, setResult] = useState<{ sig: string; data?: CollabResponse; error?: string } | null>(null);
  const reqRef = useRef(0);
  // Clamp so from <= to (avoid empty/inverted ranges silently producing nonsense)
  const effFrom = period === "monthly" ? Math.min(fromMonth, toMonth) : fromMonth;
  const effTo = period === "monthly" ? Math.max(fromMonth, toMonth) : toMonth;
  const sig = `${orgId}|${period}|${effFrom}|${effTo}|${season}`;

  useEffect(() => {
    if (!orgId) return;
    const myReq = ++reqRef.current;
    const params = new URLSearchParams({ orgId, period });
    if (period === "monthly") {
      params.set("from", String(effFrom));
      params.set("to", String(effTo));
    } else {
      params.set("season", season);
    }
    apiFetch<CollabResponse>(`/api/collaboration/by-unit?${params.toString()}`)
      .then((d) => {
        if (reqRef.current !== myReq) return;
        setResult({ sig, data: d });
      })
      .catch((e) => {
        if (reqRef.current !== myReq) return;
        setResult({ sig, error: e.message });
      });
  }, [sig]);

  const current = result?.sig === sig ? result.data ?? null : null;
  const error = result?.sig === sig ? result.error : null;
  const loading = !!orgId && (result?.sig !== sig);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (treeError) return <EmptyState title="خطا در بارگذاری ساختار سازمانی" hint={treeError} />;
  if (!tree) return <Spinner className="py-16" />;

  return (
    <div className="space-y-4">
      {/* Intro + controls */}
      <SectionCard
        title="مشارکت مدیریت‌ها در برنامه‌های سازمان"
        description="برای هر معاونت/مدیریت، تمام برنامه‌هایی که در آن همکار است (نه متولی) و سهم مشارکت در هر برنامه و گام، به تفکیک بازه زمانی"
      >
        <div className="space-y-4">
          {/* Reference + period info */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-950/30 px-2.5 py-1 font-medium text-teal-700 dark:text-teal-300">
              <CalendarRange className="h-3.5 w-3.5" />
              امروز سیستم: {current?.referenceLabel || "…"}
            </span>
            {current && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-muted-foreground">
                <Scale className="h-3.5 w-3.5" />
                بازه: {current.period.label}
              </span>
            )}
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Org selector — grouped: deputies (aggregate) / child managements / independents */}
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">انتخاب معاونت / مدیریت</label>
              <Select value={orgId || undefined} onValueChange={setOrgId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="یک معاونت یا مدیریت انتخاب کنید…" />
                </SelectTrigger>
                <SelectContent>
                  {tree.deputies.map((d) => (
                    <SelectGroup key={d.id}>
                      <SelectLabel className="text-teal-700 dark:text-teal-300">{d.name} (جمع زیرمجموعه)</SelectLabel>
                      <SelectItem value={d.id}>{d.name} — کل زیرمجموعه</SelectItem>
                      {d.managements.map((m) => (
                        <SelectItem key={m.id} value={m.id}>↳ {m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {tree.independents.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-violet-700 dark:text-violet-300">مدیریت‌های مستقل</SelectLabel>
                      {tree.independents.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Period type */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">نوع بازه زمانی</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as "monthly" | "seasonal")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">ماهانه</SelectItem>
                  <SelectItem value="seasonal">فصلی</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From/To month or season */}
            {period === "monthly" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">از ماه</label>
                  <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERSIAN_MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">تا ماه</label>
                  <Select value={String(toMonth)} onValueChange={(v) => setToMonth(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERSIAN_MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">فصل</label>
                <Select value={season} onValueChange={setSeason}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEASONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Summary KPIs */}
      {current && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            label="برنامه‌های همکاری"
            value={current.summary.collaboratingPrograms}
            unit="برنامه"
            icon={<FolderKanban className="h-5 w-5" />}
            accent="teal"
            hint={current.unit.isDeputy ? "(جمع کل زیرمجموعه)" : undefined}
          />
          <KpiCard
            label="گام‌های همکاری در بازه"
            value={current.summary.collaboratingSteps}
            unit={`از ${toFa(current.summary.totalSteps)}`}
            icon={<Handshake className="h-5 w-5" />}
            accent="violet"
          />
          <KpiCard
            label="میانگین سهم مشارکت"
            value={faPercent(current.summary.avgSharePercent)}
            icon={<Scale className="h-5 w-5" />}
            accent="amber"
            hint={`میانگین سهم در ${toFa(current.summary.collaboratingPrograms)} برنامه`}
          />
          <KpiCard
            label="سهم کل در بازه"
            value={faPercent(current.summary.overallSharePercent)}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="emerald"
            hint="سهم این واحد از کل وزن برنامه‌ها در بازه"
          />
          <KpiCard
            label="مجموع مشارکت در پیشرفت"
            value={toFa(Math.round(current.summary.totalProgressContribution * 10) / 10)}
            unit="نقطه"
            icon={<TrendingUp className="h-5 w-5" />}
            accent="rose"
            hint={`مجموع نقاط پیشرفت در ${toFa(current.summary.collaboratingPrograms)} برنامه`}
          />
        </div>
      )}

      {/* Programs list */}
      {!orgId && (
        <EmptyState
          title="یک معاونت یا مدیریت انتخاب کنید"
          hint="برای مشاهده برنامه‌هایی که در آن همکار است، از منوی بالا یک واحد سازمانی انتخاب کنید."
          icon={<Handshake className="h-10 w-10" />}
        />
      )}
      {orgId && loading && !error && <Spinner className="py-12" />}
      {orgId && error && <EmptyState title="خطا در بارگذاری" hint={error} />}
      {current && current.programs.length === 0 && (
        <SectionCard title="برنامه‌های همکاری">
          <EmptyState
            title="برنامه‌ای یافت نشد"
            hint={`این واحد در هیچ برنامه‌ای به عنوان همکار (در بازه ${current.period.label}) مشارکت ندارد.`}
            icon={<FolderKanban className="h-10 w-10" />}
          />
        </SectionCard>
      )}

      {current && current.programs.length > 0 && (
        <SectionCard
          title={`برنامه‌های همکار (${toFa(current.programs.length)} برنامه)`}
          description={`سهم مشارکت «${current.unit.name}» در برنامه‌هایی که متولی آن‌ها نیست — بازه: ${current.period.label}`}
          bodyClassName="p-0"
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setExpanded(new Set(current.programs.map((p) => p.projectId)))}>باز کردن همه</Button>
              <Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>بستن همه</Button>
            </div>
          }
        >
          {/* search */}
          <div className="border-b px-4 py-2.5">
            <div className="relative max-w-sm">
              <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجوی برنامه…"
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

          <div className="divide-y">
            {current.programs
              .filter((p) => !search || p.name.includes(search) || (p.title || "").includes(search) || p.code.includes(search))
              .map((p) => (
                <ProgramRow
                  key={p.projectId}
                  program={p}
                  unitName={current.unit.name}
                  isOpen={expanded.has(p.projectId)}
                  onToggle={() => toggle(p.projectId)}
                />
              ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Program row (expandable) ────────────────────────────────────────────────
function ProgramRow({
  program,
  unitName,
  isOpen,
  onToggle,
}: {
  program: CollabProgram;
  unitName: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const inRangeSteps = program.steps.filter((s) => s.inRange);
  const outOfRangeSteps = program.steps.filter((s) => !s.inRange);

  return (
    <div className="px-4 py-3 sm:px-5">
      {/* header */}
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-right hover:bg-accent/40 -mx-2 px-2 py-1 rounded-md transition-colors"
      >
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{program.name}</span>
            <StatusBadge status={program.status} />
            {program.owner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40">
                <Crown className="h-3 w-3" />
                متولی: {program.owner.name}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-mono">{program.code}</span>
            {program.startJalali && program.endJalali && (
              <span className="inline-flex items-center gap-1">
                <CalendarRange className="h-3 w-3" />
                {toFa(program.startJalali)} ← {toFa(program.endJalali)}
              </span>
            )}
            <span>گام‌های همکاری در بازه: <b className="text-foreground">{toFa(program.inRangeStepCount)}</b> از {toFa(program.totalStepCount)}</span>
          </div>
        </div>
        {/* share badge — neutral teal palette so it reads as "share" not "status" */}
        <div className="shrink-0 text-left">
          <div className="inline-flex flex-col items-end rounded-lg border border-teal-200/60 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/30 px-3 py-1.5 text-teal-700 dark:text-teal-300">
            <span className="text-[10px] opacity-80">سهم مشارکت</span>
            <span className="text-base font-bold tabular-nums">{faPercent(program.mySharePercent)}</span>
          </div>
        </div>
      </button>

      {/* share bar (always visible) */}
      <div className="mt-2 mr-7">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">سهم در بازه:</span>
          <ProgressBar value={program.mySharePercent} size="sm" className="flex-1 max-w-xs" />
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {faPercent(program.mySharePercent)} از کل برنامه
          </span>
        </div>
        <p className="mt-0.5 mr-20 text-[10px] text-muted-foreground">
          وزن سهم: {toFa(program.myWeightShare)} از {toFa(program.programTotalWeightAllYear)} وزن کل برنامه · {toFa(program.inRangeStepCount)} از {toFa(program.totalStepCount)} گام در بازه
        </p>
      </div>

      {/* expanded: steps */}
      {isOpen && (
        <div className="mt-3 mr-7 space-y-2">
          {inRangeSteps.length > 0 && (
            <div className="rounded-lg border border-teal-200/50 dark:border-teal-900/40 bg-teal-50/40 dark:bg-teal-950/20 p-3">
              <p className="mb-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                <Handshake className="h-3.5 w-3.5" />
                گام‌های همکاری در بازه ({toFa(inRangeSteps.length)} گام)
              </p>
              <div className="space-y-1.5">
                {inRangeSteps.map((s) => (
                  <StepRow key={s.taskId} step={s} unitName={unitName} />
                ))}
              </div>
            </div>
          )}
          {outOfRangeSteps.length > 0 && (
            <details className="rounded-lg border bg-muted/30 p-3">
              <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                گام‌های خارج از بازه ({toFa(outOfRangeSteps.length)} گام) — نمایش
              </summary>
              <div className="mt-2 space-y-1.5">
                {outOfRangeSteps.map((s) => (
                  <StepRow key={s.taskId} step={s} unitName={unitName} dimmed />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step row ────────────────────────────────────────────────────────────────
function StepRow({ step, unitName, dimmed }: { step: CollabStep; unitName: string; dimmed?: boolean }) {
  const c = statusColor(step.status);
  return (
    <div className={cn("rounded-md border bg-card p-2.5", dimmed && "opacity-60")}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
          {toFa(step.sequenceNo)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground leading-snug">{step.taskName}</span>
            <StatusBadge status={step.status} className="scale-90" />
            {!dimmed && step.inRange && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-950 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                در بازه
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span>وزن: <b className="text-foreground">{toFa(step.weight)}</b></span>
            <span>پیشرفت: <b className="text-foreground">{faPercent(step.progressPercent)}</b></span>
            <span>مجری‌ها: <b className="text-foreground">{toFa(step.executorCount)}</b></span>
            {step.activeMonths.length > 0 && (
              <span>ماه‌های فعال: {step.activeMonths.map((m) => PERSIAN_MONTHS[m - 1]).join("، ")}</span>
            )}
          </div>
          {/* this unit's share bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">سهم «{unitName}»:</span>
            <div className="flex-1 max-w-[10rem]">
              <ProgressBar value={step.mySharePercent} size="sm" barClassName={c.bar} />
            </div>
            <span className="text-[11px] font-bold tabular-nums text-foreground">{faPercent(step.mySharePercent)}</span>
            <span className="text-[10px] text-muted-foreground">
              ({toFa(step.myWeightShare)} وزن · مشارکت {toFa(step.myProgressContribution)})
            </span>
          </div>
          {/* executor chips */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {step.myExecutors.map((e) => (
              <span
                key={e.orgId}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium border",
                  e.isMe
                    ? "bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800"
                    : "bg-muted/50 text-muted-foreground border-border"
                )}
              >
                {e.isMe && <Users className="h-2.5 w-2.5" />}
                {e.name}
                {e.isPrimary && <Crown className="h-2.5 w-2.5 text-amber-500" />}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

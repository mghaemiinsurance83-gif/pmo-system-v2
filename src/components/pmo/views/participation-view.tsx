"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import {
  SectionCard,
  Spinner,
  EmptyState,
  ProgressBar,
  StatusBadge,
  KpiCard,
} from "@/components/pmo/shared";
import { toFa, faPercent, PERSIAN_MONTHS, parseJalaliString } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Building2,
  Layers,
  FolderKanban,
  Network,
  Users,
  GitBranch,
  CalendarRange,
  Crown,
  Handshake,
  Scale,
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
interface ProgramListItem {
  id: string;
  code: string;
  name: string;
  title: string | null;
  programNumber: number | null;
  weight: number;
  progress: number;
  status: string;
  startJalali: string | null;
  endJalali: string | null;
  goal: string | null;
}

interface ManagementNode {
  id: string;
  code: string;
  name: string;
  orgType: string;
  programs: ProgramListItem[];
}

interface DeputyNode extends ManagementNode {
  managements: ManagementNode[];
}

interface ParticipationList {
  company: { id: string; name: string } | null;
  deputies: DeputyNode[];
  independents: ManagementNode[];
  unmapped: ProgramListItem[];
  totals: { deputies: number; independentManagements: number; programs: number };
}

interface StepExecutor {
  orgId: string;
  name: string;
  code: string;
  roleType: string;
  isPrimary: boolean;
  sharePercent: number;
}

interface Step {
  id: string;
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
  executors: StepExecutor[];
}

interface Collaborator {
  orgId: string;
  name: string;
  code: string;
  role: string; // OWNER | COLLABORATOR
  roleType: string;
  taskCount: number;
  primaryCount: number;
  weightShare: number;
  sharePercent: number;
  progressContribution: number;
}

interface ParticipationDetail {
  program: {
    id: string;
    code: string;
    name: string;
    title: string | null;
    goal: string | null;
    year: number;
    programNumber: number | null;
    weight: number;
    progress: number;
    status: string;
    startJalali: string | null;
    endJalali: string | null;
    owner: { id: string; name: string; code: string } | null;
  };
  referenceLabel?: string;
  referenceMonth?: number;
  timeRange: { fromMonth: number; toMonth: number };
  totalSteps: number;
  inRangeSteps: number;
  totalWeightInRange: number;
  collaborators: Collaborator[];
  steps: Step[];
}

// ─── Main view ───────────────────────────────────────────────────────────────
export function ParticipationView() {
  const [list, setList] = useState<ParticipationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);

  useEffect(() => {
    apiFetch<ParticipationList>("/api/participation/programs")
      .then((data) => {
        setList(data);
        // expand company + all deputies by default
        const init = new Set<string>();
        if (data.company) init.add(data.company.id);
        data.deputies.forEach((d) => init.add(d.id));
        // also expand "independents" virtual group
        init.add("__independents__");
        setExpanded(init);
        // auto-select first program for immediate context
        const first =
          data.deputies.find((d) => d.programs.length > 0)?.programs[0] ||
          data.deputies.find((d) => d.managements.find((m) => m.programs.length > 0))?.managements.find((m) => m.programs.length > 0)?.programs[0] ||
          data.independents.find((m) => m.programs.length > 0)?.programs[0] ||
          null;
        if (first) setSelectedId(first.id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (error) return <EmptyState title="خطا در بارگذاری" hint={error} />;
  if (!list) return <Spinner className="py-16" />;

  // Flat program list for the mobile <Select>
  const flatPrograms: { id: string; name: string; group: string }[] = [];
  list.deputies.forEach((d) => {
    d.programs.forEach((p) => flatPrograms.push({ id: p.id, name: p.name, group: d.name }));
    d.managements.forEach((m) =>
      m.programs.forEach((p) => flatPrograms.push({ id: p.id, name: p.name, group: `${d.name} ← ${m.name}` }))
    );
  });
  list.independents.forEach((m) =>
    m.programs.forEach((p) => flatPrograms.push({ id: p.id, name: p.name, group: `مدیریت مستقل: ${m.name}` }))
  );

  return (
    <div className="space-y-4">
      {/* Intro */}
      <SectionCard
        title="سهم مشارکت مدیریت‌ها در برنامه‌ها و گام‌ها"
        description="بررسی میزان سهم مشارکت هر مدیریت همکار در هر برنامه و هر گام، در بازه زمانی مورد نظر"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="تعداد معاونت/مرکز" value={list.totals.deputies} unit="عدد" icon={<Layers className="h-5 w-5" />} accent="teal" />
          <KpiCard label="مدیریت‌های مستقل" value={list.totals.independentManagements} unit="عدد" icon={<Building2 className="h-5 w-5" />} accent="violet" />
          <KpiCard label="کل برنامه‌ها" value={list.totals.programs} unit="برنامه" icon={<FolderKanban className="h-5 w-5" />} accent="emerald" />
          <KpiCard label="مدیریت‌های همکار" value="—" hint="با انتخاب هر برنامه مشخص می‌شود" icon={<Handshake className="h-5 w-5" />} accent="amber" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 items-start">
        {/* ── Left: program tree (desktop) / select (mobile) ── */}
        <div className="lg:sticky lg:top-[4.5rem]">
          {/* Mobile: Select dropdown */}
          <div className="lg:hidden">
            <SectionCard title="انتخاب برنامه" bodyClassName="p-3">
              <Select value={selectedId || undefined} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="یک برنامه انتخاب کنید…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>معاونت‌ها و مدیریت‌ها</SelectLabel>
                    {flatPrograms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="text-xs text-muted-foreground ml-1">{p.group}:</span> {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SectionCard>
          </div>

          {/* Desktop: tree */}
          <SectionCard
            title="برنامه‌ها به تفکیک معاونت و مدیریت"
            description="شرکت ← معاونت ← مدیریت ← برنامه"
            className="hidden lg:block"
            bodyClassName="p-0"
            actions={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  const all = new Set<string>();
                  if (list.company) all.add(list.company.id);
                  list.deputies.forEach((d) => { all.add(d.id); d.managements.forEach((m) => all.add(m.id)); });
                  all.add("__independents__");
                  list.independents.forEach((m) => all.add(m.id));
                  setExpanded(all);
                }}>باز کردن همه</Button>
                <Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>بستن همه</Button>
              </div>
            }
          >
            <div className="border-b px-4 py-2.5">
              <div className="relative max-w-sm">
                <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="جستجوی برنامه/مدیریت…"
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
            <div className="max-h-[calc(100vh-13rem)] overflow-auto custom-scroll p-2">
              {/* Company root */}
              {list.company && (
                <GroupRow
                  label={list.company.name}
                  icon={Building2}
                  depth={0}
                  isOpen={expanded.has(list.company.id)}
                  onToggle={() => toggle(list.company.id)}
                  count={list.totals.programs}
                  countLabel="برنامه"
                />
              )}
              {expanded.has(list.company?.id || "") && (
                <div>
                  {list.deputies.map((d) => (
                    <DeputyRow
                      key={d.id}
                      deputy={d}
                      depth={1}
                      expanded={expanded}
                      onToggle={toggle}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      search={search}
                    />
                  ))}
                  {/* Independent managements group */}
                  <GroupRow
                    label="مدیریت‌های مستقل"
                    icon={Network}
                    depth={1}
                    isOpen={expanded.has("__independents__")}
                    onToggle={() => toggle("__independents__")}
                    count={list.independents.length}
                    countLabel="مدیریت"
                  />
                  {expanded.has("__independents__") &&
                    list.independents.map((m) => (
                      <ManagementRow
                        key={m.id}
                        mgt={m}
                        depth={2}
                        expanded={expanded}
                        onToggle={toggle}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        search={search}
                        badge="مستقل"
                      />
                    ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Right: program detail ── */}
        <div className="min-w-0">
          {selectedId ? (
            <ProgramDetailPanel programId={selectedId} fromMonth={fromMonth} toMonth={toMonth} onFromMonth={setFromMonth} onToMonth={setToMonth} />
          ) : (
            <SectionCard>
              <EmptyState
                title="برنامه‌ای انتخاب نشده است"
                hint="از درخت سمت راست (یا فهرست بازشو در موبایل) یک برنامه را انتخاب کنید تا گام‌ها و سهم مشارکت مدیریت‌های همکار نمایش داده شود."
                icon={<FolderKanban className="h-8 w-8" />}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tree rows ───────────────────────────────────────────────────────────────
function GroupRow({
  label,
  icon: Icon,
  depth,
  isOpen,
  onToggle,
  count,
  countLabel,
}: {
  label: string;
  icon: React.ElementType;
  depth: number;
  isOpen: boolean;
  onToggle: () => void;
  count?: number;
  countLabel?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer bg-primary/5"
      style={{ paddingRight: `${depth * 18 + 8}px` }}
      onClick={onToggle}
    >
      <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "-rotate-90")} />
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-sm font-bold truncate flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
          {toFa(count)} {countLabel}
        </span>
      )}
    </div>
  );
}

function DeputyRow({
  deputy,
  depth,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  search,
}: {
  deputy: DeputyNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
}) {
  const isOpen = expanded.has(deputy.id);
  const totalPrograms = deputy.programs.length + deputy.managements.reduce((s, m) => s + m.programs.length, 0);
  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
        style={{ paddingRight: `${depth * 18 + 8}px` }}
        onClick={() => onToggle(deputy.id)}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "-rotate-90")} />
        <Layers className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-semibold truncate flex-1">{deputy.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
          {toFa(totalPrograms)} برنامه
        </span>
      </div>
      {isOpen && (
        <div>
          {deputy.programs.map((p) => (
            <ProgramRow key={p.id} program={p} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} search={search} />
          ))}
          {deputy.managements.map((m) => (
            <ManagementRow
              key={m.id}
              mgt={m}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagementRow({
  mgt,
  depth,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  search,
  badge,
}: {
  mgt: ManagementNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  badge?: string;
}) {
  const isOpen = expanded.has(mgt.id);
  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
        style={{ paddingRight: `${depth * 18 + 8}px` }}
        onClick={() => onToggle(mgt.id)}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "-rotate-90")} />
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
        <span className="text-xs font-medium truncate flex-1">{mgt.name}</span>
        {badge && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 shrink-0">{badge}</span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
          {toFa(mgt.programs.length)} برنامه
        </span>
      </div>
      {isOpen &&
        mgt.programs.map((p) => (
          <ProgramRow key={p.id} program={p} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} search={search} />
        ))}
    </div>
  );
}

function ProgramRow({
  program,
  depth,
  selectedId,
  onSelect,
  search,
}: {
  program: ProgramListItem;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
}) {
  const isSelected = selectedId === program.id;
  const matchesSearch = !search || program.name.includes(search) || (program.title || "").includes(search);
  if (!matchesSearch) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer border-r-2 transition-colors",
        isSelected ? "bg-primary/10 border-primary" : "border-amber-300/60 hover:bg-accent/40"
      )}
      style={{ paddingRight: `${depth * 18 + 8}px` }}
      onClick={() => onSelect(program.id)}
    >
      <span className="w-3.5 shrink-0" />
      <GitBranch className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-amber-600")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-xs truncate", isSelected && "font-semibold text-primary")}>{program.name}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums truncate">
          {toFa(program.programNumber || "—")} • {program.code}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-semibold tabular-nums w-9 text-left">{faPercent(program.progress)}</span>
        <div className="w-12">
          <ProgressBar value={program.progress} size="sm" />
        </div>
      </div>
    </div>
  );
}

// ─── Program detail panel ────────────────────────────────────────────────────
function ProgramDetailPanel({
  programId,
  fromMonth,
  toMonth,
  onFromMonth,
  onToMonth,
}: {
  programId: string;
  fromMonth: number;
  toMonth: number;
  onFromMonth: (m: number) => void;
  onToMonth: (m: number) => void;
}) {
  const loadKey = `${programId}|${fromMonth}|${toMonth}`;
  const [loaded, setLoaded] = useState<{ key: string; detail: ParticipationDetail } | null>(null);
  const [errFor, setErrFor] = useState<{ key: string; msg: string } | null>(null);

  // Derived state: only the data for the *current* key is relevant.
  const detail = loaded?.key === loadKey ? loaded.detail : null;
  const error = errFor?.key === loadKey ? errFor.msg : null;
  const loading = !detail && error === null;

  useEffect(() => {
    let cancelled = false;
    apiFetch<ParticipationDetail>(
      `/api/participation/programs/${programId}?fromMonth=${fromMonth}&toMonth=${toMonth}`,
      { force: true }
    )
      .then((d) => { if (!cancelled) { setLoaded({ key: loadKey, detail: d }); setErrFor(null); } })
      .catch((e) => { if (!cancelled) setErrFor({ key: loadKey, msg: e.message }); });
    return () => { cancelled = true; };
  }, [loadKey, programId, fromMonth, toMonth]);

  if (loading && !detail) return <SectionCard><Spinner className="py-16" /></SectionCard>;
  if (error) return <SectionCard><EmptyState title="خطا" hint={error} /></SectionCard>;
  if (!detail) return null;

  const { program, collaborators, steps } = detail;
  const owner = program.owner;
  const startDate = parseJalaliString(program.startJalali);
  const endDate = parseJalaliString(program.endJalali);

  return (
    <div className="space-y-4">
      {/* Header */}
      <SectionCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-foreground">{program.name}</h3>
                <StatusBadge status={program.status} />
                {detail.referenceLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/60 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-950/30 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300" title="وضعیت بر اساس این تاریخ محاسبه شده">
                    <CalendarRange className="h-3 w-3" />
                    مرجع: {detail.referenceLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                {program.code} • برنامه شماره {toFa(program.programNumber || "—")} • سال {toFa(program.year)}
              </p>
              {program.goal && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  <span className="font-medium text-foreground">هدف:</span> {program.goal}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {owner && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <Crown className="h-3.5 w-3.5" />
                  متولی: {owner.name}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <MiniStat label="پیشرفت کلی" value={faPercent(program.progress)} sub={`${toFa(startDate?.jm || "")} ${startDate ? PERSIAN_MONTHS[startDate.jm - 1] : ""} تا ${toFa(endDate?.jm || "")} ${endDate ? PERSIAN_MONTHS[endDate.jm - 1] : ""}`} />
            <MiniStat label="وزن برنامه" value={toFa(program.weight)} sub="درصد" />
            <MiniStat label="گام‌ها (کل)" value={toFa(detail.totalSteps)} sub={`${toFa(detail.inRangeSteps)} گام در بازه`} />
            <MiniStat label="وزن گام‌های بازه" value={toFa(detail.totalWeightInRange)} sub="مجموع وزن" />
          </div>
          <div className="pt-1">
            <ProgressBar value={program.progress} showLabel size="md" />
          </div>
        </div>
      </SectionCard>

      {/* Time range filter */}
      <SectionCard
        title="بازه زمانی بررسی"
        description="فقط گام‌هایی که در این بازه زمانی فعال‌اند در محاسبه سهم لحاظ می‌شوند"
        actions={<CalendarRange className="h-4 w-4 text-muted-foreground" />}
        bodyClassName="py-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">از ماه:</span>
          <MonthSelect value={fromMonth} onChange={onFromMonth} />
          <span className="text-xs text-muted-foreground">تا ماه:</span>
          <MonthSelect value={toMonth} onChange={onToMonth} />
          <span className="text-[11px] text-muted-foreground mr-auto tabular-nums">
            بازه: {toFa(fromMonth)} تا {toFa(toMonth)} — {toFa(Math.abs(toMonth - fromMonth) + 1)} ماه
          </span>
        </div>
      </SectionCard>

      {/* Collaborators summary */}
      <SectionCard
        title="سهم مشارکت مدیریت‌های همکار"
        description={`میزان سهم هر مدیریت در ${toFa(detail.inRangeSteps)} گامِ بازه زمانی — مجموع وزن: ${toFa(detail.totalWeightInRange)}`}
        bodyClassName="p-0"
      >
        {collaborators.length === 0 ? (
          <EmptyState title="مدیریت همکاری ثبت نشده" hint="در این بازه زمانی گامی با مدیریت مجری وجود ندارد." icon={<Handshake className="h-7 w-7" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40">
                <tr className="text-right">
                  <th className="px-3 py-2 font-medium text-muted-foreground">مدیریت</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">نقش</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">تعداد گام</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">سهم وزنی</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground min-w-[180px]">درصد سهم مشارکت</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center">مشارکت در پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {collaborators.map((c, i) => (
                  <tr key={c.orgId} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {c.role === "OWNER" ? (
                          <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Handshake className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                        )}
                        <span className="font-medium truncate max-w-[200px]">{c.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums mr-5">{c.code}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                        c.role === "OWNER" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                      )}>
                        {c.role === "OWNER" ? "متولی" : "همکار"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {toFa(c.taskCount)}
                      {c.primaryCount > 0 && <span className="text-[10px] text-muted-foreground"> ({toFa(c.primaryCount)} اصلی)</span>}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums font-medium">{toFa(c.weightShare)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-[100px]">
                          <ProgressBar value={c.sharePercent} size="sm" barClassName={c.role === "OWNER" ? "bg-amber-500" : "bg-teal-500"} />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums w-10 text-left">{faPercent(c.sharePercent)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{toFa(c.progressContribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Steps detail */}
      <SectionCard
        title="گام‌های برنامه و سهم مدیریت‌های مجری"
        description={`جزئیات ${toFa(steps.length)} گام — سهم هر مدیریت در هر گام به‌صورت مساوی بین مجریان تقسیم می‌شود`}
        bodyClassName="p-3"
      >
        <div className="space-y-2">
          {steps.map((s) => (
            <StepCard key={s.id} step={s} ownerName={owner?.name} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function StepCard({ step, ownerName }: { step: Step; ownerName?: string }) {
  const activeMonthLabels = step.activeMonths.map((m) => PERSIAN_MONTHS[m - 1]);
  return (
    <div className={cn(
      "rounded-lg border p-3 transition-colors",
      step.inRange ? "bg-card" : "bg-muted/30 opacity-70"
    )}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary tabular-nums">
            {toFa(step.sequenceNo)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">{step.taskName}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-muted-foreground tabular-nums">
              <span>وزن: {toFa(step.weight)}</span>
              <span>•</span>
              <span>{toFa(step.executorCount)} مجری</span>
              {step.startJalali && step.endJalali && (
                <>
                  <span>•</span>
                  <span>{step.startJalali} ← {step.endJalali}</span>
                </>
              )}
              {activeMonthLabels.length > 0 && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[280px]">ماه‌های فعال: {activeMonthLabels.map(toFa).join("، ")}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={step.status} />
          <span className="text-[11px] font-semibold tabular-nums w-9 text-left">{faPercent(step.progressPercent)}</span>
          <div className="w-14">
            <ProgressBar value={step.progressPercent} size="sm" />
          </div>
        </div>
      </div>

      {/* Executor share bar */}
      <div className="mt-2.5">
        <div className="flex items-center gap-1 mb-1.5">
          <Scale className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">سهم مجریان در این گام:</span>
        </div>
        {/* stacked bar */}
        <div className="flex h-5 w-full overflow-hidden rounded-md border">
          {step.executors.map((e, i) => {
            const colors = ["bg-amber-500", "bg-teal-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-sky-500", "bg-orange-500"];
            const color = e.isPrimary ? "bg-amber-500" : colors[(i + 1) % colors.length];
            return (
              <div
                key={e.orgId}
                className={cn("flex items-center justify-center text-[9px] font-bold text-white transition-all", color)}
                style={{ width: `${e.sharePercent}%` }}
                title={`${e.name}: ${e.sharePercent}%`}
              >
                {e.sharePercent >= 12 && toFa(e.sharePercent)}
              </div>
            );
          })}
        </div>
        {/* legend chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          {step.executors.map((e, i) => {
            const colors = ["bg-amber-500", "bg-teal-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-sky-500", "bg-orange-500"];
            const color = e.isPrimary ? "bg-amber-500" : colors[(i + 1) % colors.length];
            const isOwner = e.name === ownerName;
            return (
              <span
                key={e.orgId}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                  e.isPrimary ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-transparent bg-muted"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", color)} />
                <span className="font-medium truncate max-w-[140px]">{e.name}</span>
                {isOwner && <Crown className="h-2.5 w-2.5 text-amber-500" />}
                <span className="text-muted-foreground tabular-nums">{faPercent(e.sharePercent)}</span>
              </span>
            );
          })}
          {!step.inRange && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-300">
              خارج از بازه
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold text-foreground tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-[130px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERSIAN_MONTHS.map((m, i) => (
          <SelectItem key={i} value={String(i + 1)}>
            {m} ({toFa(i + 1)})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


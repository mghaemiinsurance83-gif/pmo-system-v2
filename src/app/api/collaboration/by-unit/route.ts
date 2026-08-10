import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReferenceDate, computeDynamicStatus, monthFromJalali } from "@/lib/system";

// GET /api/collaboration/by-unit?orgId=&period=monthly|seasonal&from=&to=&season=
//
// Management-centric collaboration report (the INVERSE of /api/participation).
// For a given organizational unit (a deputy or a management), returns every
// program where this unit is a COLLABORATOR (i.e. an executor on at least one
// task, but NOT the program owner), together with:
//   • the unit's aggregate share across all in-range tasks of that program,
//   • the per-step breakdown (only steps where this unit is an executor),
//   • the owner (متولی) of each program,
//   • dynamic status of each program/step derived from the live reference date.
//
// Time-range filtering:
//   period=monthly  → from/to are Jalali month indices (1..12)
//   period=seasonal → season=1|2|3|4 maps to {1-3}=بهار, {4-6}=تابستان,
//                     {7-9}=پاییز, {10-12}=زمستان; from/to are derived.
//   A step is "in range" if it has no month info OR any active month ∈ [lo, hi].
//
// If orgId is a DEPUTY, the report is aggregated across all child managements
// of that deputy (i.e. "participation of the whole deputy as collaborator").

const SEASONS: Record<number, { name: string; lo: number; hi: number }> = {
  1: { name: "بهار", lo: 1, hi: 3 },
  2: { name: "تابستان", lo: 4, hi: 6 },
  3: { name: "پاییز", lo: 7, hi: 9 },
  4: { name: "زمستان", lo: 10, hi: 12 },
};

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function parseActiveMonths(json: string | null): number[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.filter((m) => typeof m === "number") : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const period = searchParams.get("period") === "seasonal" ? "seasonal" : "monthly";

  let lo: number, hi: number;
  let periodLabel: string;
  if (period === "seasonal") {
    const season = Number(searchParams.get("season") || "2");
    const s = SEASONS[season] || SEASONS[2];
    lo = s.lo;
    hi = s.hi;
    periodLabel = `فصل ${s.name}`;
  } else {
    const from = Math.max(1, Math.min(12, Number(searchParams.get("from") || "1")));
    const to = Math.max(1, Math.min(12, Number(searchParams.get("to") || "12")));
    lo = Math.min(from, to);
    hi = Math.max(from, to);
    periodLabel = `${PERSIAN_MONTHS[lo - 1]} تا ${PERSIAN_MONTHS[hi - 1]}`;
  }

  const ref = await getReferenceDate();

  // Resolve the selected unit + (if deputy) its descendant management ids.
  const unit = await db.organization.findUnique({ where: { id: orgId } });
  if (!unit) {
    return NextResponse.json({ error: "unit not found" }, { status: 404 });
  }

  // The set of org ids that count as "this unit". For a deputy, include the
  // deputy itself + all child managements. For a management, just itself.
  let scopeOrgIds: string[] = [unit.id];
  let isDeputy = false;
  if (unit.orgType === "DEPUTY" || unit.orgType === "CENTER") {
    isDeputy = true;
    const children = await db.organization.findMany({
      where: { parentOrgId: unit.id, orgType: "MANAGEMENT" },
      select: { id: true },
    });
    scopeOrgIds = [unit.id, ...children.map((c) => c.id)];
  }
  const scopeSet = new Set(scopeOrgIds);

  // Find every TaskUnit where this unit (or a child management) is an executor.
  const taskUnits = await db.taskUnit.findMany({
    where: { orgId: { in: scopeOrgIds } },
    include: {
      task: {
        include: {
          project: { include: { ownerOrg: true } },
          unitLinks: { include: { org: true } },
        },
      },
      org: true,
    },
  });

  // Group task-units by project. Skip programs where this unit IS the owner
  // (we only want collaborations — programs owned by someone else).
  interface StepAgg {
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
    // this unit's share on this step
    mySharePercent: number; // 100 / executorCount
    myWeightShare: number; // weight / executorCount
    myProgressContribution: number; // (weight/N) * progress / 100
    myExecutors: { orgId: string; name: string; code: string; isMe: boolean; isPrimary: boolean }[];
  }
  interface ProgramAgg {
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
    steps: StepAgg[];
    // aggregates over in-range steps
    myWeightShare: number;          // this unit's weight in the selected time window
    myProgressContribution: number; // (weight/N) * progress / 100, in-range steps only
    inRangeStepCount: number;
    totalStepCount: number;
    programTotalWeightInRange: number;   // Σ weight of all in-range steps (all executors)
    programTotalWeightAllYear: number;   // Σ weight of ALL steps (all executors, all year)
  }

  const byProject = new Map<string, ProgramAgg>();
  const inRange = (activeMonths: number[]) =>
    activeMonths.length === 0 ? true : activeMonths.some((m) => m >= lo && m <= hi);

  for (const tu of taskUnits) {
    const t = tu.task;
    const p = t.project;
    // Skip programs owned by this unit (we want collaboration only).
    if (p.ownerOrgId && scopeSet.has(p.ownerOrgId)) continue;

    let pa = byProject.get(p.id);
    if (!pa) {
      const pStartM = monthFromJalali(p.startJalali);
      const pEndM = monthFromJalali(p.endJalali);
      pa = {
        projectId: p.id,
        code: p.projectCode,
        name: p.projectName,
        title: p.programTitle,
        goal: p.goal,
        programNumber: p.programNumber,
        weight: p.overallWeight,
        progress: p.progressPercent,
        status: computeDynamicStatus(p.progressPercent, pStartM, pEndM, ref.jm),
        startJalali: p.startJalali,
        endJalali: p.endJalali,
        owner: p.ownerOrg
          ? { id: p.ownerOrg.id, name: p.ownerOrg.name, code: p.ownerOrg.code }
          : null,
        steps: [],
        myWeightShare: 0,
        myProgressContribution: 0,
        inRangeStepCount: 0,
        totalStepCount: 0,
        programTotalWeightInRange: 0,
        programTotalWeightAllYear: 0,
      };
      byProject.set(p.id, pa);
    }

    // Avoid double-counting the same step if multiple scoped units are on it.
    const existing = pa.steps.find((s) => s.taskId === t.id);
    if (existing) {
      const me = existing.myExecutors.find((e) => e.orgId === tu.orgId);
      if (!me) {
        existing.myExecutors.push({
          orgId: tu.orgId,
          name: tu.org.name,
          code: tu.org.code,
          isMe: true,
          isPrimary: tu.isPrimary,
        });
      }
      continue;
    }

    const activeMonths = parseActiveMonths(t.activeMonths);
    const ranged = inRange(activeMonths);
    const execs = t.unitLinks;
    const n = execs.length || 1;
    const w = t.weight || 0;
    const mySharePercent = Math.round((100 / n) * 10) / 10;
    const myWeightShare = Math.round((w / n) * 100) / 100;
    const myProgressContribution = Math.round(((w / n) * (t.progressPercent || 0)) / 100 * 100) / 100;

    const tStartM = monthFromJalali(t.startJalali);
    const tEndM = monthFromJalali(t.endJalali);
    const dynStatus = computeDynamicStatus(t.progressPercent, tStartM, tEndM, ref.jm);

    const step: StepAgg = {
      taskId: t.id,
      sequenceNo: t.sequenceNo,
      taskCode: t.taskCode,
      taskName: t.taskName,
      weight: w,
      progressPercent: t.progressPercent,
      status: dynStatus,
      startJalali: t.startJalali,
      endJalali: t.endJalali,
      activeMonths,
      inRange: ranged,
      executorCount: n,
      mySharePercent,
      myWeightShare,
      myProgressContribution,
      myExecutors: execs.map((e) => ({
        orgId: e.orgId,
        name: e.org.name,
        code: e.org.code,
        isMe: scopeSet.has(e.orgId),
        isPrimary: e.isPrimary,
      })),
    };
    pa.steps.push(step);
    pa.totalStepCount += 1;
    // The "all year" total always accumulates (regardless of time window) so the
    // share % is a fraction of the FULL program weight.
    pa.programTotalWeightAllYear = Math.round((pa.programTotalWeightAllYear + w) * 100) / 100;
    if (ranged) {
      pa.inRangeStepCount += 1;
      pa.myWeightShare = Math.round((pa.myWeightShare + myWeightShare) * 100) / 100;
      pa.myProgressContribution = Math.round((pa.myProgressContribution + myProgressContribution) * 100) / 100;
      pa.programTotalWeightInRange = Math.round((pa.programTotalWeightInRange + w) * 100) / 100;
    }
  }

  // Build the program list + overall summary.
  // mySharePercent = this unit's weight in the time window / FULL program weight (all year).
  // This makes the % directly sensitive to the selected time range: a narrower
  // window → less of the program's annual weight falls in it → smaller %.
  // Interpretation: "what fraction of the entire program does this unit carry out
  // during this specific time window."
  const programs = [...byProject.values()]
    .map((pa) => ({
      ...pa,
      mySharePercent:
        pa.programTotalWeightAllYear > 0
          ? Math.round((pa.myWeightShare / pa.programTotalWeightAllYear) * 1000) / 10
          : 0,
      // also expose the in-range-only share for reference
      inRangeSharePercent:
        pa.programTotalWeightInRange > 0
          ? Math.round((pa.myWeightShare / pa.programTotalWeightInRange) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.myWeightShare - a.myWeightShare);

  // Summary KPIs. Replace raw "total weight share" (hard to interpret) with the
  // AVERAGE share % across all collaborating programs, plus the time-window
  // coverage ratio (how much of the year's weight falls in this window).
  const avgSharePercent = programs.length > 0
    ? Math.round((programs.reduce((s, p) => s + p.mySharePercent, 0) / programs.length) * 10) / 10
    : 0;
  const totalMyWeightInRange = Math.round(programs.reduce((s, p) => s + p.myWeightShare, 0) * 100) / 100;
  const totalProgramWeightAllYear = Math.round(programs.reduce((s, p) => s + p.programTotalWeightAllYear, 0) * 100) / 100;
  const overallSharePercent = totalProgramWeightAllYear > 0
    ? Math.round((totalMyWeightInRange / totalProgramWeightAllYear) * 1000) / 10
    : 0;

  const summary = {
    collaboratingPrograms: programs.length,
    collaboratingSteps: programs.reduce((s, p) => s + p.inRangeStepCount, 0),
    totalSteps: programs.reduce((s, p) => s + p.totalStepCount, 0),
    totalWeightShare: totalMyWeightInRange,   // kept for backward compat
    totalProgressContribution:
      Math.round(programs.reduce((s, p) => s + p.myProgressContribution, 0) * 100) / 100,
    avgSharePercent,        // NEW: average of per-program share %
    overallSharePercent,    // NEW: this unit's overall share across all programs
  };

  return NextResponse.json({
    unit: {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      orgType: unit.orgType,
      isDeputy,
    },
    referenceDate: ref.jalali,
    referenceLabel: ref.dayLabel,
    period: { type: period, lo, hi, label: periodLabel },
    summary,
    programs,
  });
}

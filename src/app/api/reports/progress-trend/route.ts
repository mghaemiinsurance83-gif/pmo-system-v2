import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { progressTrend, buildOrgTree } from "@/lib/rollup";
import { getReferenceDate, computeDynamicStatus, monthFromJalali } from "@/lib/system";

// GET /api/reports/progress-trend?scope=company|deputy:<id>|management:<id>|independent
// Returns the monthly planned-vs-actual S-Curve for the chosen scope, plus a
// dynamic status distribution and KPI summary computed from the reference date.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "company";
  const ref = await getReferenceDate();
  const tree = await buildOrgTree();

  let projectIds: string[] = [];
  let label = "کل شرکت";

  if (scope === "company") {
    const allProjects = await db.project.findMany({ select: { id: true } });
    projectIds = allProjects.map((p) => p.id);
  } else if (scope === "independent") {
    label = "مدیریت‌های مستقل";
    const company = tree[0];
    const mgmtIds = company?.children.filter((c) => c.orgType === "MANAGEMENT").map((c) => c.id) || [];
    if (mgmtIds.length) {
      const projects = await db.project.findMany({ where: { ownerOrgId: { in: mgmtIds } }, select: { id: true } });
      projectIds = projects.map((p) => p.id);
    }
  } else if (scope.startsWith("deputy:")) {
    const depId = scope.split(":")[1];
    const deputy = tree[0]?.children.find((d) => d.id === depId);
    if (deputy) {
      label = deputy.name;
      const mgmtIds = [deputy.id, ...deputy.children.map((c) => c.id)];
      const projects = await db.project.findMany({ where: { ownerOrgId: { in: mgmtIds } }, select: { id: true } });
      projectIds = projects.map((p) => p.id);
    }
  } else if (scope.startsWith("management:")) {
    const mId = scope.split(":")[1];
    const projects = await db.project.findMany({ where: { ownerOrgId: mId }, select: { id: true, ownerOrg: { select: { name: true } } } });
    projectIds = projects.map((p) => p.id);
    label = projects[0]?.ownerOrg?.name || "مدیریت";
  }

  const trend = await progressTrend(projectIds, ref.operationalYear, ref.jm);

  // Dynamic status distribution for the scope (computed from reference date)
  const projects = await db.project.findMany({
    where: projectIds.length ? { id: { in: projectIds } } : undefined,
    select: { id: true, progressPercent: true, startJalali: true, endJalali: true, overallWeight: true },
  });
  const statusDist: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, DELAYED: 0 };
  let wSum = 0, pSum = 0;
  for (const p of projects) {
    const startM = monthFromJalali(p.startJalali);
    const endM = monthFromJalali(p.endJalali);
    const dyn = computeDynamicStatus(p.progressPercent, startM, endM, ref.jm);
    statusDist[dyn] = (statusDist[dyn] || 0) + 1;
    const w = p.overallWeight || 100;
    wSum += w;
    pSum += p.progressPercent * w;
  }
  const weightedProgress = wSum > 0 ? Math.round((pSum / wSum) * 10) / 10 : 0;
  const totalPrograms = projects.length;

  // Variance at the reference month (the key "are we behind schedule?" metric)
  const refMonthData = trend.find((t) => t.monthIdx === ref.jm);
  const plannedAtRef = refMonthData?.planned ?? 0;
  const actualAtRef = refMonthData?.actual ?? 0;
  const varianceAtRef = Math.round((plannedAtRef - actualAtRef) * 10) / 10;

  // SPI (Schedule Performance Index) = actual / planned (1.0 = on schedule)
  const spi = plannedAtRef > 0 ? Math.round((actualAtRef / plannedAtRef) * 100) / 100 : 0;

  return NextResponse.json({
    scope,
    label,
    referenceDate: ref.jalali,
    referenceLabel: ref.dayLabel,
    referenceMonth: ref.jm,
    trend,
    statusDist,
    kpis: {
      totalPrograms,
      weightedProgress,
      plannedAtRef,
      actualAtRef,
      varianceAtRef,
      spi,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildOrgTree, progressTrend } from "@/lib/rollup";
import { getReferenceDate, computeDynamicStatus, monthFromJalali } from "@/lib/system";

export async function GET(_req: NextRequest) {
  const ref = await getReferenceDate();

  const [
    totalProjects,
    totalTasks,
    totalOrgs,
    totalManagements,
    totalDeputies,
    projects,
    tasksByStatus,
    tree,
  ] = await Promise.all([
    db.project.count(),
    db.task.count(),
    db.organization.count(),
    db.organization.count({ where: { orgType: "MANAGEMENT" } }),
    db.organization.count({ where: { orgType: { in: ["DEPUTY", "CENTER"] } } }),
    db.project.findMany({ select: { id: true, progressPercent: true, overallWeight: true, ownerOrgId: true, status: true, startJalali: true, endJalali: true } }),
    db.task.groupBy({ by: ["status"], _count: { _all: true } }),
    buildOrgTree(),
  ]);

  // Independent managements = MANAGEMENT nodes whose parent is the company.
  // Computed from the tree (root[0] = company; its children are deputies + independents).
  const companyNode = tree[0];
  const totalIndependents = companyNode
    ? companyNode.children.filter((c) => c.orgType === "MANAGEMENT").length
    : 0;

  // company-level weighted progress
  let wSum = 0, pSum = 0;
  for (const p of projects) {
    const w = p.overallWeight || 100;
    wSum += w;
    pSum += p.progressPercent * w;
  }
  const overallProgress = wSum > 0 ? Math.round((pSum / wSum) * 10) / 10 : 0;

  // DYNAMIC status distribution (projects) — computed from reference date
  const projectStatusDist: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, DELAYED: 0 };
  for (const p of projects) {
    const startM = monthFromJalali(p.startJalali);
    const endM = monthFromJalali(p.endJalali);
    const dyn = computeDynamicStatus(p.progressPercent, startM, endM, ref.jm);
    projectStatusDist[dyn] = (projectStatusDist[dyn] || 0) + 1;
  }

  // task status distribution (kept as stored — tasks have per-task progress)
  const taskStatusDist: Record<string, number> = {};
  for (const t of tasksByStatus) taskStatusDist[t.status] = t._count._all;

  // deputy-level rollup (level 1)
  const deputyRollup = tree[0]?.children.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    progress: d.progress,
    projectCount: d.projectCount,
    taskCount: d.taskCount,
  })) || [];

  // management-level rollup (level 2)
  const managementRollup: { id: string; code: string; name: string; deputy: string; progress: number; projectCount: number; taskCount: number }[] = [];
  for (const dep of tree[0]?.children || []) {
    for (const mgmt of dep.children) {
      managementRollup.push({
        id: mgmt.id,
        code: mgmt.code,
        name: mgmt.name,
        deputy: dep.name,
        progress: mgmt.progress,
        projectCount: mgmt.projectCount,
        taskCount: mgmt.taskCount,
      });
    }
  }

  // company trend
  const allProjectIds = projects.map((p) => p.id).slice(0, 200);
  const trend = await progressTrend(allProjectIds);

  // low progress projects (need attention) — use DYNAMIC status to surface delayed + not-started
  const projectIds = projects.map((p) => p.id);
  const lowProgressProjectsRaw = await db.project.findMany({
    where: { id: { in: projectIds } },
    include: { ownerOrg: true, _count: { select: { tasks: true } } },
    orderBy: { progressPercent: "asc" },
    take: 10,
  });
  const lowProgressProjects = lowProgressProjectsRaw.map((p) => {
    const startM = monthFromJalali(p.startJalali);
    const endM = monthFromJalali(p.endJalali);
    const dyn = computeDynamicStatus(p.progressPercent, startM, endM, ref.jm);
    return {
      id: p.id,
      code: p.projectCode,
      name: p.projectName,
      owner: p.ownerOrg?.name || "—",
      progress: p.progressPercent,
      taskCount: p._count.tasks,
      status: dyn,
      startJalali: p.startJalali,
      endJalali: p.endJalali,
    };
  });

  return NextResponse.json({
    referenceDate: ref.jalali,
    referenceMonth: ref.jm,
    referenceLabel: ref.dayLabel,
    operationalYear: ref.operationalYear,
    kpis: {
      totalProjects,
      totalTasks,
      totalOrgs,
      totalManagements,
      totalDeputies,
      totalIndependents,
      overallProgress,
      avgProgress: projects.length ? Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length * 10) / 10 : 0,
    },
    projectStatusDist,
    taskStatusDist,
    deputyRollup: deputyRollup.sort((a, b) => b.progress - a.progress),
    managementRollup: managementRollup.sort((a, b) => b.progress - a.progress),
    trend,
    lowProgressProjects,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildOrgTree, progressTrend } from "@/lib/rollup";

export async function GET(_req: NextRequest) {
  const [
    totalProjects,
    totalTasks,
    totalOrgs,
    totalManagements,
    projects,
    tasksByStatus,
    tree,
  ] = await Promise.all([
    db.project.count(),
    db.task.count(),
    db.organization.count(),
    db.organization.count({ where: { orgType: "MANAGEMENT" } }),
    db.project.findMany({ select: { id: true, progressPercent: true, overallWeight: true, ownerOrgId: true, status: true } }),
    db.task.groupBy({ by: ["status"], _count: { _all: true } }),
    buildOrgTree(),
  ]);

  // company-level weighted progress
  let wSum = 0, pSum = 0;
  for (const p of projects) {
    const w = p.overallWeight || 100;
    wSum += w;
    pSum += p.progressPercent * w;
  }
  const overallProgress = wSum > 0 ? Math.round((pSum / wSum) * 10) / 10 : 0;

  // status distribution (projects)
  const projectStatusDist: Record<string, number> = {};
  for (const p of projects) projectStatusDist[p.status] = (projectStatusDist[p.status] || 0) + 1;

  // task status distribution
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
  const allProjectIds = projects.map((p) => p.id).slice(0, 200); // limit for perf
  const trend = await progressTrend(allProjectIds);

  // top delayed / low progress projects
  const projectIds = projects.map((p) => p.id);
  const lowProgressProjectsRaw = await db.project.findMany({
    where: { id: { in: projectIds } },
    include: { ownerOrg: true, _count: { select: { tasks: true } } },
    orderBy: { progressPercent: "asc" },
    take: 8,
  });
  const lowProgressProjects = lowProgressProjectsRaw.map((p) => ({
    id: p.id,
    code: p.projectCode,
    name: p.projectName,
    owner: p.ownerOrg?.name || "—",
    progress: p.progressPercent,
    taskCount: p._count.tasks,
    status: p.status,
  }));

  return NextResponse.json({
    kpis: {
      totalProjects,
      totalTasks,
      totalOrgs,
      totalManagements,
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

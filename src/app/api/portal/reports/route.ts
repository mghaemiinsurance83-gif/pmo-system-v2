import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";

export async function GET(_req: NextRequest) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const isAll = scope?.has("*");
  const orgIds = isAll ? undefined : [...scope];

  // Projects in scope
  const projects = isAll
    ? await db.project.findMany({ where: { isActive: true }, select: { id: true, progressPercent: true, status: true, ownerOrg: { select: { name: true, code: true } } } })
    : await db.project.findMany({
        where: { isActive: true, OR: [{ ownerOrgId: { in: orgIds } }, { unitLinks: { some: { orgId: { in: orgIds } } } }] },
        select: { id: true, progressPercent: true, status: true, ownerOrg: { select: { name: true, code: true } } },
      });

  const projectIds = projects.map((p) => p.id);
  const tasks = await db.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, status: true, progressPercent: true, endDate: true, taskName: true, sequenceNo: true, project: { select: { id: true, projectName: true, projectCode: true } } },
    orderBy: { sequenceNo: "asc" },
  });

  const today = new Date();

  const delayedTasks = tasks
    .filter((t) => t.status !== "COMPLETED" && t.endDate && t.endDate < today)
    .map((t) => {
      const delayDays = t.endDate ? Math.floor((today.getTime() - t.endDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return { ...t, delayDays };
    });

  const statusDist = {
    NOT_STARTED: tasks.filter((t) => t.status === "NOT_STARTED").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    COMPLETED: tasks.filter((t) => t.status === "COMPLETED").length,
    DELAYED: delayedTasks.length,
  };

  const avgProgress = projects.length ? projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length : 0;

  // Per-project summary
  const perProject = projects.map((p) => ({
    id: p.id,
    name: p.ownerOrg?.name ?? "",
    code: p.ownerOrg?.code ?? "",
    progress: p.progressPercent,
    status: p.status,
  }));

  return Response.json({
    data: {
      totalProjects: projects.length,
      totalTasks: tasks.length,
      avgProgress: Math.round(avgProgress * 10) / 10,
      statusDist,
      delayedTasks: delayedTasks.slice(0, 50), // top 50
      perProject: perProject.slice(0, 50),
    },
  });
}

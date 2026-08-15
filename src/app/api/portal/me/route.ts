import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";

export async function GET(_req: NextRequest) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "نشست نامعتبر" } }, { status: 401 });
  if (!scope) return Response.json({ error: { code: "INTERNAL", message: "scope" } }, { status: 500 });

  const isAll = scope.has("*");
  const orgIds = isAll ? undefined : [...scope];

  // Find projects in scope
  const where = isAll ? {} : { OR: [{ ownerOrgId: { in: orgIds } }, { unitLinks: { some: { orgId: { in: orgIds } } } }] };
  const projects = await db.project.findMany({
    where: { ...where, isActive: true },
    select: { id: true, status: true, progressPercent: true, ownerOrgId: true },
  });
  const projectIds = projects.map((p) => p.id);

  // Tasks in scope
  const tasks = await db.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, status: true, progressPercent: true, endDate: true, startJalali: true, endJalali: true },
  });

  // Reference date (today)
  const today = new Date();
  const delayedTasks = tasks.filter(
    (t) => t.status !== "COMPLETED" && t.endDate && t.endDate < today
  ).length;

  const statusDist = {
    NOT_STARTED: tasks.filter((t) => t.status === "NOT_STARTED").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    COMPLETED: tasks.filter((t) => t.status === "COMPLETED").length,
    DELAYED: delayedTasks,
  };

  // Documents count
  const documentsCount = await db.document.count({
    where: { projectId: { in: projectIds }, isActive: true },
  });

  // Unread notifications
  const unreadNotifications = await db.notification.count({
    where: { userId: user.id, isRead: false },
  });

  // User's org name
  let orgName = null;
  let orgCode = null;
  if (user.orgId) {
    const org = await db.organization.findUnique({ where: { id: user.orgId }, select: { name: true, code: true } });
    orgName = org?.name ?? null;
    orgCode = org?.code ?? null;
  }

  return Response.json({
    data: {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        orgName,
        orgCode,
      },
      kpis: {
        totalProjects: projects.length,
        totalTasks: tasks.length,
        documents: documentsCount,
        unreadNotifications,
      },
      taskStatusDist: statusDist,
      isAllScope: isAll,
    },
  });
}

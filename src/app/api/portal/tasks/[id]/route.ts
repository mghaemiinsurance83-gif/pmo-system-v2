import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!scope) return Response.json({ error: { code: "INTERNAL" } }, { status: 500 });

  const { id: taskId } = await params;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskCode: true,
      taskName: true,
      sequenceNo: true,
      weight: true,
      progressPercent: true,
      status: true,
      startJalali: true,
      endJalali: true,
      startDate: true,
      endDate: true,
      isMilestone: true,
      description: true,
      target: true,
      notes: true,
      projectId: true,
      project: {
        select: {
          id: true,
          projectName: true,
          projectCode: true,
          ownerOrg: { select: { id: true, name: true, code: true } },
          unitLinks: { select: { orgId: true, org: { select: { name: true, code: true } } } },
        },
      },
      unitLinks: { select: { orgId: true, org: { select: { name: true, code: true } } } },
      _count: { select: { documents: true } },
    },
  });

  if (!task) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Scope check
  const isAll = scope.has("*");
  if (!isAll) {
    const taskOrgIds = new Set<string>();
    if (task.project.ownerOrg?.id) taskOrgIds.add(task.project.ownerOrg.id);
    for (const ul of task.project.unitLinks) taskOrgIds.add(ul.orgId);
    for (const ul of task.unitLinks) taskOrgIds.add(ul.orgId);
    const inScope = [...scope].some((id) => taskOrgIds.has(id));
    if (!inScope)
      return Response.json({ error: { code: "FORBIDDEN", message: "این گام خارج از حوزه شماست" } }, { status: 403 });
  }

  // Compute dynamic status
  const today = new Date();
  let dynamicStatus = task.status;
  if (task.status !== "COMPLETED" && task.endDate && task.endDate < today) {
    dynamicStatus = "DELAYED";
  }

  return Response.json({
    data: {
      id: task.id,
      taskCode: task.taskCode,
      taskName: task.taskName,
      sequenceNo: task.sequenceNo,
      weight: task.weight,
      progressPercent: task.progressPercent,
      status: task.status,
      dynamicStatus,
      startJalali: task.startJalali,
      endJalali: task.endJalali,
      isMilestone: task.isMilestone,
      description: task.description,
      target: task.target,
      notes: task.notes,
      project: {
        id: task.project.id,
        projectName: task.project.projectName,
        projectCode: task.project.projectCode,
        ownerOrg: task.project.ownerOrg,
      },
      unitLinks: task.unitLinks,
      documentCount: task._count.documents,
    },
  });
}

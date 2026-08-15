import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserWithScope, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

const schema = z.object({
  progressPercent: z.number().min(0).max(100),
  forMonth: z.number().int().min(1).max(12).optional(),
  comment: z.string().max(2000).optional(),
  status: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canEdit(user.role))
    return Response.json({ error: { code: "FORBIDDEN", message: "اجازه ویرایش ندارید" } }, { status: 403 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر" } }, { status: 422 });
  }

  const taskId = params.id;

  // Fetch task + project to verify scope
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          id: true,
          ownerOrgId: true,
          projectName: true,
          unitLinks: { select: { orgId: true } },
        },
      },
      progressPercent: true,
      status: true,
    },
  });
  if (!task) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Scope check
  const isAll = scope?.has("*");
  if (!isAll) {
    const taskOrgIds = new Set<string>();
    if (task.project.ownerOrgId) taskOrgIds.add(task.project.ownerOrgId);
    for (const ul of task.project.unitLinks) taskOrgIds.add(ul.orgId);
    const inScope = [...(scope ?? [])].some((id) => taskOrgIds.has(id));
    if (!inScope)
      return Response.json({ error: { code: "FORBIDDEN", message: "این گام خارج از حوزه شماست" } }, { status: 403 });
  }

  const oldValue = { progressPercent: task.progressPercent, status: task.status };

  // Create progress history record
  const history = await db.taskProgressHistory.create({
    data: {
      taskId,
      orgId: user.orgId,
      reportDate: new Date(),
      progressPercent: body.progressPercent,
      actualProgressPercent: body.progressPercent,
      comment: body.comment || null,
      recordedById: user.id,
    },
  });

  // Update task progress + status
  const newStatus = body.status || (body.progressPercent >= 100 ? "COMPLETED" : body.progressPercent > 0 ? "IN_PROGRESS" : "NOT_STARTED");
  await db.task.update({
    where: { id: taskId },
    data: { progressPercent: body.progressPercent, status: newStatus },
  });

  await audit({
    userId: user.id,
    entityType: "TASK",
    entityId: taskId,
    action: "UPDATE",
    oldValue,
    newValue: { progressPercent: body.progressPercent, status: newStatus, forMonth: body.forMonth, comment: body.comment },
  });

  // Notify admins
  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        title: "به‌روزرسانی پیشرفت گام",
        body: `${user.name} پیشرفت گام «${task.taskName?.slice(0, 60) ?? ""}» را به ${body.progressPercent}٪ تغییر داد`,
        type: "PROGRESS_UPDATED",
        link: `task:${taskId}`,
      })
    )
  );

  return Response.json({
    data: { taskId, historyId: history.id, newProgress: body.progressPercent, newStatus },
  });
}

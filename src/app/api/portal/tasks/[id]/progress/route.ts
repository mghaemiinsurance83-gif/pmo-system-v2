import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserWithScope, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { gregorianToJalali, formatJalali, PERSIAN_MONTHS, toFa } from "@/lib/jalali";
import { getReferenceDate } from "@/lib/system";

const schema = z.object({
  progressPercent: z.number().min(0).max(100),
  forMonth: z.number().int().min(1).max(12).optional(),
  forYear: z.number().int().min(1390).max(1420).optional(),
  comment: z.string().max(2000).optional(),
  status: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id: taskId } = await params;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskCode: true,
      taskName: true,
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

  // Determine forMonth / forYear (default: current operational month)
  const ref = await getReferenceDate();
  const forYear = body.forYear ?? ref.jy;
  const forMonth = body.forMonth ?? ref.jm;

  // Jalali label for the report date
  const now = new Date();
  const jNow = gregorianToJalali(now);
  const reportJalali = formatJalali(jNow);

  const oldValue = { progressPercent: task.progressPercent, status: task.status };

  // Compute new status
  const newStatus = body.status || (body.progressPercent >= 100 ? "COMPLETED" : body.progressPercent > 0 ? "IN_PROGRESS" : "NOT_STARTED");

  // Check if there's an existing record for this (taskId, forYear, forMonth) — update it; otherwise create new
  const existing = await db.taskProgressHistory.findFirst({
    where: { taskId, forYear, forMonth },
    select: { id: true },
  });

  const historyData = {
    taskId,
    orgId: user.orgId,
    reportDate: now,
    reportJalali,
    forYear,
    forMonth,
    progressPercent: body.progressPercent,
    actualProgressPercent: body.progressPercent,
    status: newStatus,
    comment: body.comment || null,
    recordedById: user.id,
  };

  const history = existing
    ? await db.taskProgressHistory.update({ where: { id: existing.id }, data: historyData })
    : await db.taskProgressHistory.create({ data: historyData });

  // Update task progress + status
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
    newValue: {
      progressPercent: body.progressPercent,
      status: newStatus,
      forYear,
      forMonth,
      comment: body.comment,
      historyId: history.id,
    },
  });

  // Notify admins
  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  const monthLabel = `${PERSIAN_MONTHS[forMonth - 1]} ${toFa(forYear)}`;
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        title: "به‌روزرسانی پیشرفت گام",
        body: `${user.name} پیشرفت گام «${task.taskName?.slice(0, 60) ?? ""}» را برای ${monthLabel} به ${toFa(body.progressPercent)}٪ تغییر داد`,
        type: "PROGRESS_UPDATED",
        link: `task:${taskId}`,
      })
    )
  );

  return Response.json({
    data: {
      taskId,
      historyId: history.id,
      newProgress: body.progressPercent,
      newStatus,
      forYear,
      forMonth,
      monthLabel,
    },
  });
}

// GET — fetch progress history for a task
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: taskId } = await params;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskName: true,
      project: { select: { ownerOrgId: true, unitLinks: { select: { orgId: true } } } },
    },
  });
  if (!task) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Scope check (read-only for VIEWER)
  const isAll = scope?.has("*");
  if (!isAll) {
    const taskOrgIds = new Set<string>();
    if (task.project.ownerOrgId) taskOrgIds.add(task.project.ownerOrgId);
    for (const ul of task.project.unitLinks) taskOrgIds.add(ul.orgId);
    const inScope = [...(scope ?? [])].some((id) => taskOrgIds.has(id));
    if (!inScope)
      return Response.json({ error: { code: "FORBIDDEN", message: "این گام خارج از حوزه شماست" } }, { status: 403 });
  }

  const history = await db.taskProgressHistory.findMany({
    where: { taskId },
    orderBy: { reportDate: "desc" },
    take: 50,
    select: {
      id: true,
      reportDate: true,
      reportJalali: true,
      forYear: true,
      forMonth: true,
      progressPercent: true,
      actualProgressPercent: true,
      status: true,
      comment: true,
      recordedBy: { select: { name: true, username: true } },
      org: { select: { name: true, code: true } },
    },
  });

  return Response.json({
    data: history.map((h) => ({
      ...h,
      monthLabel: h.forMonth && h.forYear ? `${PERSIAN_MONTHS[h.forMonth - 1]} ${toFa(h.forYear)}` : h.reportJalali,
    })),
  });
}

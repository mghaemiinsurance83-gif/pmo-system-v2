import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const updateSchema = z.object({
  taskName: z.string().min(1).max(300).optional(),
  sequenceNo: z.number().int().optional(),
  weight: z.number().optional(),
  startJalali: z.string().optional().nullable(),
  endJalali: z.string().optional().nullable(),
  status: z.string().optional(),
  taskType: z.string().optional(),
  isMilestone: z.boolean().optional(),
  target: z.string().optional().nullable(),
  prereq: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  progressPercent: z.number().min(0).max(100).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر", details: e as object } }, { status: 422 });
  }

  const old = await db.task.findUnique({ where: { id: params.id } });
  if (!old) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  await db.task.update({ where: { id: params.id }, data: { ...body, updatedBy: user.id } });

  await audit({ userId: user.id, entityType: "TASK", entityId: params.id, action: "UPDATE", oldValue: old, newValue: body });

  return Response.json({ data: { id: params.id, updated: true } });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const old = await db.task.findUnique({ where: { id: params.id } });
  if (!old) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  await db.task.delete({ where: { id: params.id } });

  await audit({ userId: user.id, entityType: "TASK", entityId: params.id, action: "DELETE", oldValue: { taskName: old.taskName } });

  return Response.json({ data: { id: params.id, deleted: true } });
}

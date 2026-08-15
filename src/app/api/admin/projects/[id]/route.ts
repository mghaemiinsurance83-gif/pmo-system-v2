import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const updateSchema = z.object({
  projectName: z.string().min(1).max(200).optional(),
  programTitle: z.string().optional().nullable(),
  ownerOrgId: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  startJalali: z.string().optional().nullable(),
  endJalali: z.string().optional().nullable(),
  progressPercent: z.number().min(0).max(100).optional(),
  description: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر", details: e as object } }, { status: 422 });
  }

  const old = await db.project.findUnique({ where: { id: id } });
  if (!old) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  await db.project.update({ where: { id: id }, data: { ...body, updatedBy: user.id } });

  await audit({ userId: user.id, entityType: "PROJECT", entityId: id, action: "UPDATE", oldValue: old, newValue: body });

  return Response.json({ data: { id: id, updated: true } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const old = await db.project.findUnique({ where: { id: id } });
  if (!old) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Soft delete
  await db.project.update({ where: { id: id }, data: { isActive: false } });

  await audit({ userId: user.id, entityType: "PROJECT", entityId: id, action: "DELETE", oldValue: { projectName: old.projectName } });

  return Response.json({ data: { id: id, deactivated: true } });
}

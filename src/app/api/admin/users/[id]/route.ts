import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser, invalidateScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (currentUser.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const user = await db.user.findUnique({
    where: { id: id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      authSource: true,
      adDistinguishedName: true,
      createdAt: true,
      org: { select: { id: true, name: true, code: true } },
      liaisonOrgs: { select: { id: true, org: { select: { id: true, name: true, code: true } } } },
      _count: { select: { documents: true, progressRecords: true, auditLogs: true } },
    },
  });
  if (!user) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Recent auth events
  const authEvents = await db.authEvent.findMany({
    where: { username: user.username },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return Response.json({ data: { ...user, authEvents } });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal("")).or(z.null()),
  role: z.enum(["ADMIN", "MANAGER", "LIAISON", "VIEWER"]).optional(),
  orgId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  password: z.string().min(4).optional(),
  liaisonOrgIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (currentUser.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر", details: e as object } }, { status: 422 });
  }

  const target = await db.user.findUnique({ where: { id: id } });
  if (!target) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Prevent self-demotion (admin can't remove own admin role)
  if (currentUser.id === target.id && body.role && body.role !== "ADMIN") {
    return Response.json({ error: { code: "FORBIDDEN", message: "نمی‌توانید نقش ادمین خود را حذف کنید" } }, { status: 403 });
  }

  const oldValue = { name: target.name, role: target.role, orgId: target.orgId, isActive: target.isActive };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.email !== undefined) data.email = body.email || null;
  if (body.role !== undefined) data.role = body.role;
  if (body.orgId !== undefined) data.orgId = body.orgId || null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.password) data.passwordHash = bcrypt.hashSync(body.password, 12);

  await db.user.update({ where: { id: id }, data });

  // Update liaison orgs if provided
  if (body.liaisonOrgIds !== undefined) {
    await db.userLiaisonOrg.deleteMany({ where: { userId: id } });
    if (body.liaisonOrgIds.length) {
      await db.userLiaisonOrg.createMany({
        data: body.liaisonOrgIds.map((orgId) => ({ userId: id, orgId, assignedBy: currentUser.id })),
      });
    }
  }

  invalidateScope(id);

  await audit({
    userId: currentUser.id,
    entityType: "USER",
    entityId: id,
    action: "UPDATE",
    oldValue,
    newValue: body,
  });

  await notify({
    userId: id,
    title: "به‌روزرسانی پروفایل",
    body: `پروفایل شما توسط ادمین به‌روزرسانی شد${body.role ? ` (نقش جدید: ${body.role})` : ""}`,
    type: "ROLE_ASSIGNED",
  });

  return Response.json({ data: { id: id, updated: true } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (currentUser.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  if (currentUser.id === id) return Response.json({ error: { code: "FORBIDDEN", message: "نمی‌توانید خود را حذف کنید" } }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: id } });
  if (!target) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Soft delete: deactivate
  await db.user.update({ where: { id: id }, data: { isActive: false } });
  invalidateScope(id);

  await audit({
    userId: currentUser.id,
    entityType: "USER",
    entityId: id,
    action: "DELETE",
    oldValue: { username: target.username, name: target.name },
  });

  return Response.json({ data: { id: id, deactivated: true } });
}

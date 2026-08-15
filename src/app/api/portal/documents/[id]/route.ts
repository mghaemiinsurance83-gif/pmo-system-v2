import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope, canEdit } from "@/lib/rbac";
import { markFileDeleted } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canEdit(user.role))
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const doc = await db.document.findUnique({
    where: { id: params.id },
    select: { id: true, storagePath: true, uploadedById: true, taskId: true, projectId: true, originalFileName: true, orgId: true },
  });
  if (!doc) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Owner OR admin can delete
  if (user.role !== "ADMIN" && doc.uploadedById !== user.id) {
    // Also allow if in same org scope
    const isAll = scope?.has("*");
    if (!isAll || !scope?.has(doc.orgId ?? "")) {
      return Response.json({ error: { code: "FORBIDDEN", message: "حذف فقط توسط آپلود‌کننده یا ادمین" } }, { status: 403 });
    }
  }

  await db.document.update({ where: { id: doc.id }, data: { isActive: false } });
  await markFileDeleted(doc.storagePath);

  await audit({
    userId: user.id,
    entityType: "DOCUMENT",
    entityId: doc.id,
    action: "DELETE",
    oldValue: { fileName: doc.originalFileName },
  });

  return Response.json({ data: { id: doc.id, deleted: true } });
}

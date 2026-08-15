import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const notif = await db.notification.findUnique({ where: { id: params.id } });
  if (!notif || notif.userId !== user.id)
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  await db.notification.update({ where: { id: params.id }, data: { isRead: true } });
  return Response.json({ data: { id: params.id, read: true } });
}

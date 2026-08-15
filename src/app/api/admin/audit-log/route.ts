import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") || "50"), 200);
  const entityType = searchParams.get("entityType") || undefined;
  const action = searchParams.get("action") || undefined;

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
  };

  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, name: true, username: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    data: items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

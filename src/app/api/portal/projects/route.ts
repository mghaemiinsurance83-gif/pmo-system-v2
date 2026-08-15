import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "نشست نامعتبر" } }, { status: 401 });
  if (!scope) return Response.json({ error: { code: "INTERNAL" } }, { status: 500 });

  const isAll = scope.has("*");
  const orgIds = isAll ? undefined : [...scope];

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") || "20"), 100);
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  const where = {
    isActive: true,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(search ? { projectName: { contains: search } } : {}),
    ...(isAll
      ? {}
      : { OR: [{ ownerOrgId: { in: orgIds } }, { unitLinks: { some: { orgId: { in: orgIds } } } }] }),
  };

  const [total, items] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        programTitle: true,
        startJalali: true,
        endJalali: true,
        progressPercent: true,
        overallWeight: true,
        status: true,
        priority: true,
        ownerOrg: { select: { id: true, name: true, code: true } },
        _count: { select: { tasks: true, documents: true } },
      },
      orderBy: { progressPercent: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    data: items.map((p) => ({
      ...p,
      taskCount: p._count.tasks,
      documentCount: p._count.documents,
      _count: undefined,
    })),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

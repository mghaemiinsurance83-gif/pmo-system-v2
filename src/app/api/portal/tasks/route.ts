import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!scope) return Response.json({ error: { code: "INTERNAL" } }, { status: 500 });

  const isAll = scope.has("*");
  const orgIds = isAll ? undefined : [...scope];

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") || undefined;
  const status = searchParams.get("status") || "ALL";
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") || "20"), 100);
  const search = searchParams.get("search") || undefined;

  // Find accessible project IDs
  const accessibleProjects = isAll
    ? null
    : await db.project.findMany({
        where: { OR: [{ ownerOrgId: { in: orgIds } }, { unitLinks: { some: { orgId: { in: orgIds } } } }] },
        select: { id: true },
      });
  const projectIdsFilter = accessibleProjects ? accessibleProjects.map((p) => p.id) : undefined;

  const today = new Date();

  const where = {
    ...(projectId ? { projectId } : projectIdsFilter ? { projectId: { in: projectIdsFilter } } : {}),
    ...(search ? { taskName: { contains: search } } : {}),
  };

  const [total, rawItems] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
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
        endDate: true,
        isMilestone: true,
        project: { select: { id: true, projectName: true, projectCode: true } },
        _count: { select: { documents: true } },
      },
      orderBy: [{ projectId: "asc" }, { sequenceNo: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Apply dynamic status filter (DELAYED is computed, not stored)
  let items = rawItems.map((t) => {
    let dynamicStatus = t.status;
    if (t.status !== "COMPLETED" && t.endDate && t.endDate < today) {
      dynamicStatus = "DELAYED";
    }
    return {
      ...t,
      dynamicStatus,
      documentCount: t._count.documents,
      _count: undefined,
    };
  });

  if (status !== "ALL") {
    items = items.filter((t) => t.dynamicStatus === status);
  }

  // Recount total when filtered
  const filteredTotal = status === "ALL" ? total : items.length;

  return Response.json({
    data: items,
    meta: { page, pageSize, total: filteredTotal, totalPages: Math.ceil(filteredTotal / pageSize) },
  });
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";
import { getReferenceDate } from "@/lib/system";
import { gregorianToJalali } from "@/lib/jalali";

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
  const forMonth = searchParams.get("forMonth"); // filter tasks active in this month

  // Find accessible project IDs
  const accessibleProjects = isAll
    ? null
    : await db.project.findMany({
        where: { OR: [{ ownerOrgId: { in: orgIds } }, { unitLinks: { some: { orgId: { in: orgIds } } } }] },
        select: { id: true },
      });
  const projectIdsFilter = accessibleProjects ? accessibleProjects.map((p) => p.id) : undefined;

  // Reference date for dynamic status
  const ref = await getReferenceDate();
  const today = new Date();

  // Build base where clause
  const where = {
    ...(projectId ? { projectId } : projectIdsFilter ? { projectId: { in: projectIdsFilter } } : {}),
    ...(search ? { taskName: { contains: search } } : {}),
  };

  // Fetch all matching tasks (we need to compute dynamic status; for scope-filtered users this is bounded)
  // For ADMIN (all), we paginate first then compute dynamic status on the page
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
        startDate: true,
        endDate: true,
        isMilestone: true,
        projectId: true,
        project: { select: { id: true, projectName: true, projectCode: true, ownerOrg: { select: { name: true, code: true } } } },
        _count: { select: { documents: true } },
      },
      orderBy: [{ projectId: "asc" }, { sequenceNo: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Compute dynamic status (DELAYED if past end date and not COMPLETED)
  let items = rawItems.map((t) => {
    let dynamicStatus = t.status;
    if (t.status !== "COMPLETED" && t.endDate && t.endDate < today) {
      dynamicStatus = "DELAYED";
    }
    // Also consider ON_HOLD, CANCELLED preserved
    return {
      id: t.id,
      taskCode: t.taskCode,
      taskName: t.taskName,
      sequenceNo: t.sequenceNo,
      weight: t.weight,
      progressPercent: t.progressPercent,
      status: t.status,
      dynamicStatus,
      startJalali: t.startJalali,
      endJalali: t.endJalali,
      isMilestone: t.isMilestone,
      projectId: t.projectId,
      project: t.project,
      documentCount: t._count.documents,
    };
  });

  // Apply dynamic status filter post-query (only when filtered)
  if (status !== "ALL") {
    items = items.filter((t) => t.dynamicStatus === status);
  }

  // If filtering by status changed count, recompute total — but we can't know exact count without fetching all.
  // For correctness when status filter is active, we fetch all matching and filter then paginate.
  let finalTotal = total;
  let finalItems = items;
  let finalTotalPages = Math.ceil(total / pageSize);

  if (status !== "ALL") {
    // Re-fetch ALL matching tasks (without pagination) to compute accurate filtered count + paginate
    const allMatching = await db.task.findMany({
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
        projectId: true,
        project: { select: { id: true, projectName: true, projectCode: true, ownerOrg: { select: { name: true, code: true } } } },
        _count: { select: { documents: true } },
      },
      orderBy: [{ projectId: "asc" }, { sequenceNo: "asc" }],
    });

    const filtered = allMatching
      .map((t) => {
        let dynamicStatus = t.status;
        if (t.status !== "COMPLETED" && t.endDate && t.endDate < today) {
          dynamicStatus = "DELAYED";
        }
        return {
          id: t.id,
          taskCode: t.taskCode,
          taskName: t.taskName,
          sequenceNo: t.sequenceNo,
          weight: t.weight,
          progressPercent: t.progressPercent,
          status: t.status,
          dynamicStatus,
          startJalali: t.startJalali,
          endJalali: t.endJalali,
          isMilestone: t.isMilestone,
          projectId: t.projectId,
          project: t.project,
          documentCount: t._count.documents,
        };
      })
      .filter((t) => t.dynamicStatus === status);

    finalTotal = filtered.length;
    finalTotalPages = Math.max(1, Math.ceil(finalTotal / pageSize));
    finalItems = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  }

  return Response.json({
    data: finalItems,
    meta: {
      page,
      pageSize,
      total: finalTotal,
      totalPages: finalTotalPages,
      scope: isAll ? "ALL" : orgIds?.length ?? 0,
      refDate: `${ref.jy}/${ref.jm}/${ref.jd}`,
    },
  });
}

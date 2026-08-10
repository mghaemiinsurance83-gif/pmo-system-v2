import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReferenceDate, computeDynamicStatus, monthFromJalali, type DynamicStatus } from "@/lib/system";

// GET /api/projects
// Query params:
//   page, pageSize — pagination
//   search         — free text in title/code/goal
//   deputyId       — filter to a deputy + its descendant managements
//   managementId   — filter to a single management (takes precedence over deputyId)
//   status         — DYNAMIC status filter (NOT_STARTED | IN_PROGRESS | COMPLETED | DELAYED)
//   fromMonth,toMonth — schedule-overlap date filter (1..12). A project is kept if its
//                      [startMonth, endMonth] window overlaps [fromMonth, toMonth].
//   summary=1      — include a status-breakdown summary in the response
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ownerOrgId = searchParams.get("ownerOrgId");
  const deputyId = searchParams.get("deputyId");
  const managementId = searchParams.get("managementId");
  const statusFilter = searchParams.get("status"); // dynamic status
  const search = searchParams.get("search");
  const fromMonth = searchParams.get("fromMonth");
  const toMonth = searchParams.get("toMonth");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "20")));
  const wantSummary = searchParams.get("summary") === "1";

  const ref = await getReferenceDate();

  // Build org-id filter set from deputy / management selection.
  let orgIdFilter: string[] | undefined;
  if (managementId) {
    orgIdFilter = [managementId];
  } else if (deputyId) {
    const deputy = await db.organization.findUnique({ where: { id: deputyId }, include: { children: true } });
    if (deputy) orgIdFilter = [deputy.id, ...deputy.children.map((c) => c.id)];
  }

  const where: any = {};
  if (ownerOrgId) where.ownerOrgId = ownerOrgId;
  if (orgIdFilter) where.ownerOrgId = { in: orgIdFilter };
  if (search) {
    where.OR = [
      { projectName: { contains: search } },
      { programTitle: { contains: search } },
      { projectCode: { contains: search } },
      { goal: { contains: search } },
    ];
  }

  // We need ALL matching rows to compute dynamic status + summary, then paginate.
  // With ~163 projects this is cheap.
  const allRows = await db.project.findMany({
    where,
    include: {
      ownerOrg: true,
      _count: { select: { tasks: true, unitLinks: true } },
    },
    orderBy: { progressPercent: "desc" },
  });

  // Date-range filter (schedule overlap)
  const loM = fromMonth ? Math.max(1, Math.min(12, Number(fromMonth))) : null;
  const hiM = toMonth ? Math.max(1, Math.min(12, Number(toMonth))) : null;

  const enriched = allRows.map((p) => {
    const startM = monthFromJalali(p.startJalali);
    const endM = monthFromJalali(p.endJalali);
    const dynStatus: DynamicStatus = computeDynamicStatus(p.progressPercent, startM, endM, ref.jm);
    // schedule-overlap test
    let inRange = true;
    if (loM !== null && hiM !== null && startM != null && endM != null) {
      inRange = !(endM < loM || startM > hiM);
    }
    return {
      id: p.id,
      code: p.projectCode,
      name: p.projectName,
      programTitle: p.programTitle,
      owner: p.ownerOrg?.name || "—",
      ownerCode: p.ownerOrg?.code || null,
      ownerOrgId: p.ownerOrgId,
      year: p.year,
      programNumber: p.programNumber,
      progress: p.progressPercent,
      weight: p.overallWeight,
      status: dynStatus, // DYNAMIC status (overrides stale stored status)
      storedStatus: p.status,
      priority: p.priority,
      startJalali: p.startJalali,
      endJalali: p.endJalali,
      startMonth: startM,
      endMonth: endM,
      goal: p.goal,
      taskCount: p._count.tasks,
      unitCount: p._count.unitLinks,
      inRange,
    };
  });

  // Apply dynamic status + date-range filters
  let filtered = enriched;
  if (statusFilter) filtered = filtered.filter((p) => p.status === statusFilter);
  if (loM !== null && hiM !== null) filtered = filtered.filter((p) => p.inRange);

  const total = filtered.length;

  // Summary (computed BEFORE pagination, on the filtered-by-org/search set but
  // BEFORE status/date filters so the chips always reflect the full context).
  let summary: Record<string, number> | undefined;
  if (wantSummary) {
    summary = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, DELAYED: 0 };
    for (const p of enriched) {
      summary[p.status] = (summary[p.status] || 0) + 1;
    }
  }

  const items = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map(({ inRange: _ir, storedStatus: _ss, ...rest }) => rest);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items,
    summary,
    referenceDate: ref.jalali,
    referenceMonth: ref.jm,
    referenceLabel: ref.monthLabel,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

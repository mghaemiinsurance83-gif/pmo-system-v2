import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ownerOrgId = searchParams.get("ownerOrgId");
  const deputyId = searchParams.get("deputyId");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "20")));

  // If deputyId given, get all its descendant org ids
  let orgIdFilter: string[] | undefined;
  if (deputyId) {
    const deputy = await db.organization.findUnique({ where: { id: deputyId }, include: { children: true } });
    if (deputy) {
      orgIdFilter = [deputy.id, ...deputy.children.map((c) => c.id)];
    }
  }

  const where: any = {};
  if (ownerOrgId) where.ownerOrgId = ownerOrgId;
  if (orgIdFilter) where.ownerOrgId = { in: orgIdFilter };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { projectName: { contains: search } },
      { programTitle: { contains: search } },
      { projectCode: { contains: search } },
      { goal: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      include: {
        ownerOrg: true,
        _count: { select: { tasks: true, unitLinks: true } },
      },
      orderBy: { progressPercent: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: items.map((p) => ({
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
      status: p.status,
      priority: p.priority,
      startJalali: p.startJalali,
      endJalali: p.endJalali,
      goal: p.goal,
      taskCount: p._count.tasks,
      unitCount: p._count.unitLinks,
    })),
  });
}

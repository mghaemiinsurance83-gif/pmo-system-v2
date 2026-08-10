import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const mappingStatus = searchParams.get("mappingStatus");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "20")));

  const where: any = {};
  if (search) where.sheetName = { contains: search };
  if (mappingStatus) {
    // filter sheets that have at least one row with this status — approximate via rawRows
    where.rawRows = { some: { mappingStatus } };
  }

  const [total, items] = await Promise.all([
    db.rawSheetImport.count({ where }),
    db.rawSheetImport.findMany({
      where,
      include: {
        _count: { select: { rawRows: true } },
      },
      orderBy: { sheetName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // mappedProjectId is a plain string (not a relation), so resolve mapped projects
  // in a second query when present.
  const mappedIds = items
    .map((s) => s.mappedProjectId)
    .filter((id): id is string => !!id);
  const mappedProjects = mappedIds.length
    ? await db.project.findMany({
        where: { id: { in: mappedIds } },
        select: { id: true, projectCode: true, projectName: true, ownerOrg: { select: { name: true } } },
      })
    : [];
  const projById = new Map(mappedProjects.map((p) => [p.id, p]));

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: items.map((s) => {
      const p = s.mappedProjectId ? projById.get(s.mappedProjectId) : null;
      return {
        id: s.id,
        sheetName: s.sheetName,
        projectTitle: s.projectTitle,
        managerRaw: s.managerRaw,
        programNum: s.programNum,
        weight: s.weight,
        rowCount: s.rowCount,
        rawRowCount: s._count.rawRows,
        status: s.status,
        mappedProject: p
          ? { id: p.id, code: p.projectCode, name: p.projectName, owner: p.ownerOrg?.name || "—" }
          : null,
      };
    }),
  });
}

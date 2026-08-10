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
        mappedProject: { select: { id: true, projectCode: true, projectName: true, ownerOrg: { select: { name: true } } } },
      },
      orderBy: { sheetName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    items: items.map((s) => ({
      id: s.id,
      sheetName: s.sheetName,
      projectTitle: s.projectTitle,
      managerRaw: s.managerRaw,
      programNum: s.programNum,
      weight: s.weight,
      rowCount: s.rowCount,
      rawRowCount: s._count.rawRows,
      status: s.status,
      mappedProject: s.mappedProject
        ? { id: s.mappedProject.id, code: s.mappedProject.projectCode, name: s.mappedProject.projectName, owner: s.mappedProject.ownerOrg?.name || "—" }
        : null,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = await db.rawSheetImport.findUnique({
    where: { id },
    include: {
      batch: true,
      rawRows: { orderBy: { rowNumber: "asc" } },
      mappedProject: { select: { id: true, projectCode: true, projectName: true, ownerOrg: { select: { name: true } } } },
    },
  });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: sheet.id,
    sheetName: sheet.sheetName,
    projectTitle: sheet.projectTitle,
    managerRaw: sheet.managerRaw,
    programTitle: sheet.programTitle,
    programNum: sheet.programNum,
    weight: sheet.weight,
    startDateRaw: sheet.startDateRaw,
    endDateRaw: sheet.endDateRaw,
    goalRaw: sheet.goalRaw,
    rowCount: sheet.rowCount,
    status: sheet.status,
    importedAt: sheet.importedAt,
    batch: { fileName: sheet.batch.fileName, label: sheet.batch.batchLabel },
    mappedProject: sheet.mappedProject
      ? {
          id: sheet.mappedProject.id,
          code: sheet.mappedProject.projectCode,
          name: sheet.mappedProject.projectName,
          owner: sheet.mappedProject.ownerOrg?.name || "—",
        }
      : null,
    rows: sheet.rawRows.map((r) => ({
      id: r.id,
      rowNumber: r.rowNumber,
      rowNoRaw: r.rowNoRaw,
      taskDesc: r.taskDesc,
      weight: r.weight,
      executorsRaw: r.executorsRaw,
      target: r.target,
      prereq: r.prereq,
      notes: r.notes,
      activeMonthsRaw: r.activeMonthsRaw,
      mappingStatus: r.mappingStatus,
      mappedTaskId: r.mappedTaskId,
      rawJson: r.rawJson,
    })),
  });
}

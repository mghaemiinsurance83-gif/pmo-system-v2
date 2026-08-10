import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const PERSIAN_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ownerOrgId = searchParams.get("ownerOrgId");
  const deputyId = searchParams.get("deputyId");

  let orgIdFilter: string[] | undefined;
  if (deputyId) {
    const deputy = await db.organization.findUnique({ where: { id: deputyId }, include: { children: true } });
    if (deputy) orgIdFilter = [deputy.id, ...deputy.children.map((c) => c.id)];
  }

  const where: any = {};
  if (ownerOrgId) where.ownerOrgId = ownerOrgId;
  if (orgIdFilter) where.ownerOrgId = { in: orgIdFilter };

  const projects = await db.project.findMany({
    where,
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      programTitle: true,
      startJalali: true,
      endJalali: true,
      progressPercent: true,
      status: true,
      overallWeight: true,
      ownerOrgId: true,
      ownerOrg: { select: { id: true, name: true, code: true } },
      tasks: {
        select: {
          id: true,
          taskName: true,
          sequenceNo: true,
          weight: true,
          progressPercent: true,
          status: true,
          startJalali: true,
          endJalali: true,
          activeMonths: true,
          isMilestone: true,
          parentTaskId: true,
        },
        orderBy: { sequenceNo: "asc" },
      },
    },
    orderBy: [{ ownerOrgId: "asc" }, { programNumber: "asc" }],
  });

  // parse start/end month for each item
  const monthFromJalali = (s: string | null): number => {
    if (!s) return 1;
    const parts = s.split("/");
    return Number(parts[1]) || 1;
  };

  const result = projects.map((p) => ({
    id: p.id,
    code: p.projectCode,
    name: p.programTitle || p.projectName,
    owner: p.ownerOrg?.name || "—",
    ownerCode: p.ownerOrg?.code || null,
    startMonth: monthFromJalali(p.startJalali),
    endMonth: monthFromJalali(p.endJalali),
    progress: p.progressPercent,
    status: p.status,
    weight: p.overallWeight,
    tasks: p.tasks.map((t) => ({
      id: t.id,
      name: t.taskName,
      seq: t.sequenceNo,
      weight: t.weight,
      progress: t.progressPercent,
      status: t.status,
      startMonth: monthFromJalali(t.startJalali),
      endMonth: monthFromJalali(t.endJalali),
      activeMonths: t.activeMonths ? JSON.parse(t.activeMonths) : [],
      isMilestone: t.isMilestone,
    })),
  }));

  return NextResponse.json({
    months: PERSIAN_MONTHS,
    year: 1405,
    projects: result,
  });
}

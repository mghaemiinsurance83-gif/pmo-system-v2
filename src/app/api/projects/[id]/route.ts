import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { progressTrend } from "@/lib/rollup";
import { getReferenceDate, computeDynamicStatus, monthFromJalali } from "@/lib/system";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ref = await getReferenceDate();
  const project = await db.project.findUnique({
    where: { id },
    include: {
      ownerOrg: true,
      unitLinks: { include: { org: true } },
      tasks: {
        orderBy: { sequenceNo: "asc" },
        include: { _count: { select: { unitLinks: true, childTasks: true } } },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // task units
  const taskIds = project.tasks.map((t) => t.id);
  const taskUnits = await db.taskUnit.findMany({
    where: { taskId: { in: taskIds } },
    include: { org: true },
  });
  const taskUnitMap = new Map<string, typeof taskUnits>();
  for (const tu of taskUnits) {
    if (!taskUnitMap.has(tu.taskId)) taskUnitMap.set(tu.taskId, []);
    taskUnitMap.get(tu.taskId)!.push(tu);
  }

  // progress trend
  const trend = await progressTrend([project.id]);

  // weight summary
  const totalWeight = project.tasks.reduce((s, t) => s + t.weight, 0);

  return NextResponse.json({
    id: project.id,
    code: project.projectCode,
    name: project.projectName,
    programTitle: project.programTitle,
    type: project.projectType,
    owner: project.ownerOrg,
    goal: project.goal,
    year: project.year,
    programNumber: project.programNumber,
    startDate: project.startDate,
    endDate: project.endDate,
    startJalali: project.startJalali,
    endJalali: project.endJalali,
    plannedDuration: project.plannedDuration,
    status: computeDynamicStatus(project.progressPercent, monthFromJalali(project.startJalali), monthFromJalali(project.endJalali), ref.jm),
    storedStatus: project.status,
    priority: project.priority,
    overallWeight: project.overallWeight,
    progress: project.progressPercent,
    taskCount: project.tasks.length,
    totalWeight,
    referenceDate: ref.jalali,
    referenceMonth: ref.jm,
    referenceLabel: ref.monthLabel,
    unitLinks: project.unitLinks.map((ul) => ({
      id: ul.id,
      org: ul.org,
      roleType: ul.roleType,
      isPrimary: ul.isPrimary,
      participationPercent: ul.participationPercent,
    })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      taskCode: t.taskCode,
      name: t.taskName,
      sequenceNo: t.sequenceNo,
      weight: t.weight,
      progress: t.progressPercent,
      status: computeDynamicStatus(t.progressPercent, monthFromJalali(t.startJalali), monthFromJalali(t.endJalali), ref.jm),
      storedStatus: t.status,
      startJalali: t.startJalali,
      endJalali: t.endJalali,
      isMilestone: t.isMilestone,
      taskType: t.taskType,
      target: t.target,
      prereq: t.prereq,
      notes: t.notes,
      activeMonths: t.activeMonths ? JSON.parse(t.activeMonths) : [],
      parentTaskId: t.parentTaskId,
      childCount: t._count.childTasks,
      units: (taskUnitMap.get(t.id) || []).map((tu) => ({ org: tu.org, roleType: tu.roleType, isPrimary: tu.isPrimary })),
    })),
    trend,
  });
}

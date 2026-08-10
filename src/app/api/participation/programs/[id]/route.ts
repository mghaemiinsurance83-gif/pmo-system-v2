import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/participation/programs/[id]?fromMonth=1&toMonth=12
// Returns a program's steps (گام‌ها) with each collaborating management's share,
// plus an aggregate collaborator summary. The fromMonth/toMonth filter narrows
// which steps are counted (by active-months overlap) and is the "بازه زمانی".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fromMonth = Math.max(1, Math.min(12, Number(searchParams.get("fromMonth") || "1")));
  const toMonth = Math.max(1, Math.min(12, Number(searchParams.get("toMonth") || "12")));
  const lo = Math.min(fromMonth, toMonth);
  const hi = Math.max(fromMonth, toMonth);

  const project = await db.project.findUnique({
    where: { id },
    include: { ownerOrg: true },
  });
  if (!project) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const tasks = await db.task.findMany({
    where: { projectId: id },
    include: { unitLinks: { include: { org: true } } },
    orderBy: { sequenceNo: "asc" },
  });

  const parseMonths = (json: string | null): number[] => {
    try {
      const arr = JSON.parse(json || "[]");
      return Array.isArray(arr) ? arr.filter((m) => typeof m === "number") : [];
    } catch {
      return [];
    }
  };

  // A task is "in range" if it has no month info, or any active month falls in [lo, hi].
  const inRange = (activeMonths: number[]) =>
    activeMonths.length === 0 ? true : activeMonths.some((m) => m >= lo && m <= hi);

  // Aggregate per-org share across in-range tasks.
  interface OrgAgg {
    orgId: string;
    name: string;
    code: string;
    roleType: string;
    taskCount: number;
    primaryCount: number;
    weightShare: number; // Σ task.weight / N_executors
    progressContribution: number; // Σ (task.weight / N) × task.progress / 100
    isOwner: boolean;
  }
  const orgAgg = new Map<string, OrgAgg>();
  let totalWeightInRange = 0;

  const steps = [];
  for (const t of tasks) {
    const activeMonths = parseMonths(t.activeMonths);
    const ranged = inRange(activeMonths);
    const w = t.weight || 0;
    const execs = t.unitLinks;
    const n = execs.length || 1;
    const perExecShare = w / n;

    if (ranged) totalWeightInRange += w;

    const stepExecutors = execs.map((ul) => ({
      orgId: ul.orgId,
      name: ul.org.name,
      code: ul.org.code,
      roleType: ul.roleType,
      isPrimary: ul.isPrimary,
      sharePercent: Math.round((100 / n) * 10) / 10,
    }));

    steps.push({
      id: t.id,
      sequenceNo: t.sequenceNo,
      taskCode: t.taskCode,
      taskName: t.taskName,
      weight: w,
      progressPercent: t.progressPercent,
      status: t.status,
      startJalali: t.startJalali,
      endJalali: t.endJalali,
      activeMonths,
      inRange: ranged,
      executorCount: n,
      executors: stepExecutors,
    });

    if (!ranged) continue;

    for (const ul of execs) {
      const key = ul.orgId;
      let a = orgAgg.get(key);
      if (!a) {
        a = {
          orgId: key,
          name: ul.org.name,
          code: ul.org.code,
          roleType: ul.roleType,
          taskCount: 0,
          primaryCount: 0,
          weightShare: 0,
          progressContribution: 0,
          isOwner: key === project.ownerOrgId,
        };
        orgAgg.set(key, a);
      }
      a.taskCount += 1;
      if (ul.isPrimary) a.primaryCount += 1;
      a.weightShare += perExecShare;
      a.progressContribution += (perExecShare * (t.progressPercent || 0)) / 100;
      // Owner flag takes precedence
      if (key === project.ownerOrgId) a.isOwner = true;
    }
  }

  const collaborators = [...orgAgg.values()]
    .map((a) => ({
      orgId: a.orgId,
      name: a.name,
      code: a.code,
      role: a.isOwner ? "OWNER" : "COLLABORATOR",
      roleType: a.roleType,
      taskCount: a.taskCount,
      primaryCount: a.primaryCount,
      weightShare: Math.round(a.weightShare * 10) / 10,
      sharePercent: totalWeightInRange > 0 ? Math.round((a.weightShare / totalWeightInRange) * 1000) / 10 : 0,
      progressContribution: Math.round(a.progressContribution * 10) / 10,
    }))
    .sort((a, b) => b.weightShare - a.weightShare);

  const inRangeStepCount = steps.filter((s) => s.inRange).length;

  return NextResponse.json({
    program: {
      id: project.id,
      code: project.projectCode,
      name: project.projectName,
      title: project.programTitle,
      goal: project.goal,
      year: project.year,
      programNumber: project.programNumber,
      weight: project.overallWeight,
      progress: project.progressPercent,
      status: project.status,
      startJalali: project.startJalali,
      endJalali: project.endJalali,
      owner: project.ownerOrg
        ? { id: project.ownerOrg.id, name: project.ownerOrg.name, code: project.ownerOrg.code }
        : null,
    },
    timeRange: { fromMonth: lo, toMonth: hi },
    totalSteps: tasks.length,
    inRangeSteps: inRangeStepCount,
    totalWeightInRange: Math.round(totalWeightInRange * 10) / 10,
    collaborators,
    steps,
  });
}

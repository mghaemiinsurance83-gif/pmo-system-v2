import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  // management performance ranking
  const managements = await db.organization.findMany({
    where: { orgType: "MANAGEMENT" },
    include: {
      ownedProjects: { select: { id: true, progressPercent: true, overallWeight: true, status: true } },
      parent: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const taskCounts = await db.task.groupBy({
    by: ["projectId"],
    _count: { _all: true },
  });
  const pTaskCount = new Map(taskCounts.map((t) => [t.projectId, t._count._all]));

  const items = managements.map((m) => {
    let wSum = 0, pSum = 0;
    let completed = 0, inProgress = 0, delayed = 0, notStarted = 0;
    let taskCount = 0;
    for (const p of m.ownedProjects) {
      const w = p.overallWeight || 100;
      wSum += w;
      pSum += p.progressPercent * w;
      taskCount += pTaskCount.get(p.id) || 0;
      if (p.status === "COMPLETED") completed++;
      else if (p.status === "IN_PROGRESS") inProgress++;
      else if (p.status === "DELAYED") delayed++;
      else notStarted++;
    }
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      deputy: m.parent?.name || "مستقیم",
      progress: wSum > 0 ? Math.round((pSum / wSum) * 10) / 10 : 0,
      projectCount: m.ownedProjects.length,
      taskCount,
      completed,
      inProgress,
      delayed,
      notStarted,
    };
  });

  items.sort((a, b) => b.progress - a.progress);

  return NextResponse.json({ items });
}

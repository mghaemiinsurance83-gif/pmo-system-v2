import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { progressTrend } from "@/lib/rollup";
import { buildOrgTree } from "@/lib/rollup";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "company"; // company | deputy:<id> | management:<id>
  const tree = await buildOrgTree();

  let projectIds: string[] = [];
  let label = "کل شرکت";

  if (scope === "company") {
    const allProjects = await db.project.findMany({ select: { id: true } });
    projectIds = allProjects.map((p) => p.id).slice(0, 200);
  } else if (scope.startsWith("deputy:")) {
    const depId = scope.split(":")[1];
    const deputy = tree[0]?.children.find((d) => d.id === depId);
    if (deputy) {
      label = deputy.name;
      const mgmtIds = [deputy.id, ...deputy.children.map((c) => c.id)];
      const projects = await db.project.findMany({ where: { ownerOrgId: { in: mgmtIds } }, select: { id: true } });
      projectIds = projects.map((p) => p.id);
    }
  } else if (scope.startsWith("management:")) {
    const mId = scope.split(":")[1];
    const projects = await db.project.findMany({ where: { ownerOrgId: mId }, select: { id: true, ownerOrg: { select: { name: true } } } });
    projectIds = projects.map((p) => p.id);
    label = projects[0]?.ownerOrg?.name || "مدیریت";
  }

  const trend = await progressTrend(projectIds);

  // status distribution for the scope
  const statusDist = await db.project.groupBy({
    by: ["status"],
    where: projectIds.length ? { id: { in: projectIds } } : undefined,
    _count: { _all: true },
  });

  return NextResponse.json({
    scope,
    label,
    trend,
    statusDist: statusDist.reduce((acc, s) => { acc[s.status] = s._count._all; return acc; }, {} as Record<string, number>),
  });
}

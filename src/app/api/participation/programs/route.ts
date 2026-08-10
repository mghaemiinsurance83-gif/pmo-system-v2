import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/participation/programs
// Returns all programs grouped hierarchically:
//   company → deputies (with their child managements) → independent managements.
// Each management/deputy node carries its owned programs (with progress, weight, dates).
export async function GET() {
  const [orgs, projects] = await Promise.all([
    db.organization.findMany({ orderBy: [{ level: "asc" }, { code: "asc" }] }),
    db.project.findMany({
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        programTitle: true,
        ownerOrgId: true,
        programNumber: true,
        overallWeight: true,
        progressPercent: true,
        status: true,
        startJalali: true,
        endJalali: true,
        goal: true,
      },
      orderBy: { programNumber: "asc" },
    }),
  ]);

  // Group projects by owner org
  const projsByOrg = new Map<string, typeof projects>();
  for (const p of projects) {
    const k = p.ownerOrgId || "__null__";
    if (!projsByOrg.has(k)) projsByOrg.set(k, []);
    projsByOrg.get(k)!.push(p);
  }

  const company = orgs.find((o) => o.orgType === "COMPANY");
  const companyId = company?.id ?? null;

  const programShape = (p: (typeof projects)[number]) => ({
    id: p.id,
    code: p.projectCode,
    name: p.projectName,
    title: p.programTitle,
    programNumber: p.programNumber,
    weight: p.overallWeight,
    progress: p.progressPercent,
    status: p.status,
    startJalali: p.startJalali,
    endJalali: p.endJalali,
    goal: p.goal,
  });

  const programsOf = (orgId: string | null) =>
    (projsByOrg.get(orgId || "__null__") || []).map(programShape);

  const managementNode = (m: (typeof orgs)[number]) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    orgType: m.orgType,
    programs: programsOf(m.id),
  });

  // Deputies / centers (level-1 grouping nodes under the company)
  const deputies = orgs
    .filter((o) => (o.orgType === "DEPUTY" || o.orgType === "CENTER") && o.parentOrgId === companyId)
    .map((d) => {
      const childMgts = orgs
        .filter((m) => m.orgType === "MANAGEMENT" && m.parentOrgId === d.id)
        .map(managementNode);
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        orgType: d.orgType,
        programs: programsOf(d.id),
        managements: childMgts,
      };
    });

  // Independent managements — level-1 MANAGEMENT nodes whose parent is the company
  // (these report directly to the company, NOT under any deputy).
  const independents = orgs
    .filter((o) => o.orgType === "MANAGEMENT" && o.parentOrgId === companyId)
    .map(managementNode);

  // Programs whose owner could not be mapped (ownerOrgId null) — surfaced separately
  const unmapped = programsOf(null);

  return NextResponse.json({
    company: company ? { id: company.id, name: company.name } : null,
    deputies,
    independents,
    unmapped,
    totals: {
      deputies: deputies.length,
      independentManagements: independents.length,
      programs: projects.length,
    },
  });
}

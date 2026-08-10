import { db } from "@/lib/db";
import { toJalaali } from "jalaali-js";

// Convert a Gregorian Date to a Jalali "1405/03/01" string.
export function toJalaliStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  const j = toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const mm = String(j.jm).padStart(2, "0");
  const dd = String(j.jd).padStart(2, "0");
  return `${j.jy}/${mm}/${dd}`;
}

export interface OrgNode {
  id: string;
  code: string;
  name: string;
  displayName: string;
  orgType: string;
  level: number;
  parentId: string | null;
  childCount: number;
  projectCount: number;
  taskCount: number;
  progress: number;
  statusBreakdown: Record<string, number>;
  children: OrgNode[];
}

/**
 * Build the full org tree with rolled-up progress, project/task counts.
 * Progress is weighted: Σ(project progress × project weight) / Σ(project weight).
 */
export async function buildOrgTree(): Promise<OrgNode[]> {
  const orgs = await db.organization.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
    include: {
      ownedProjects: { select: { id: true, progressPercent: true, overallWeight: true, status: true } },
    },
  });

  // count tasks per org (via project ownership)
  const taskCounts = await db.task.groupBy({
    by: ["projectId"],
    _count: { _all: true },
  });
  const projectTaskCount = new Map<string, number>();
  for (const t of taskCounts) projectTaskCount.set(t.projectId, t._count._all);

  const nodeMap = new Map<string, OrgNode>();
  for (const o of orgs) {
    let wSum = 0;
    let pSum = 0;
    const statusBreakdown: Record<string, number> = {};
    let taskCount = 0;
    for (const p of o.ownedProjects) {
      const w = p.overallWeight || 100;
      wSum += w;
      pSum += p.progressPercent * w;
      statusBreakdown[p.status] = (statusBreakdown[p.status] || 0) + 1;
      taskCount += projectTaskCount.get(p.id) || 0;
    }
    const progress = wSum > 0 ? Math.round((pSum / wSum) * 10) / 10 : 0;
    nodeMap.set(o.id, {
      id: o.id,
      code: o.code,
      name: o.name,
      displayName: o.displayName,
      orgType: o.orgType,
      level: o.level,
      parentId: o.parentOrgId,
      childCount: 0,
      projectCount: o.ownedProjects.length,
      taskCount,
      progress,
      statusBreakdown,
      children: [],
    });
  }

  // link children
  const roots: OrgNode[] = [];
  for (const o of orgs) {
    const node = nodeMap.get(o.id)!;
    if (o.parentOrgId && nodeMap.has(o.parentOrgId)) {
      nodeMap.get(o.parentOrgId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // roll up counts & progress from children into parents
  function rollup(node: OrgNode): { projectCount: number; taskCount: number; wSum: number; pSum: number } {
    let pc = node.projectCount;
    let tc = node.taskCount;
    // direct projects' weighted progress
    let wSum = 0;
    let pSum = 0;
    const directProjects = orgs.find((o) => o.id === node.id)!.ownedProjects;
    for (const p of directProjects) {
      const w = p.overallWeight || 100;
      wSum += w;
      pSum += p.progressPercent * w;
    }
    for (const child of node.children) {
      const c = rollup(child);
      pc += c.projectCount;
      tc += c.taskCount;
      wSum += c.wSum;
      pSum += c.pSum;
    }
    node.projectCount = pc;
    node.taskCount = tc;
    if (wSum > 0) node.progress = Math.round((pSum / wSum) * 10) / 10;
    return { projectCount: pc, taskCount: tc, wSum, pSum };
  }
  for (const r of roots) rollup(r);

  // sort children: group by org type first (company → deputy/center → management → group/other)
  // then by name within each group. This keeps deputies above independent managements.
  function typeOrder(t: string): number {
    if (t === "COMPANY") return 0;
    if (t === "DEPUTY" || t === "CENTER") return 1;
    if (t === "MANAGEMENT") return 2;
    return 3; // GROUP, UNIT, DEPARTMENT, OTHER
  }
  function sortChildren(node: OrgNode) {
    node.children.sort((a, b) => {
      const ta = typeOrder(a.orgType);
      const tb = typeOrder(b.orgType);
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, "fa");
    });
    node.childCount = node.children.length;
    for (const c of node.children) sortChildren(c);
  }
  for (const r of roots) sortChildren(r);

  return roots;
}

/** Flatten the tree into a list with depth info for table rendering. */
export function flattenTree(roots: OrgNode[], expanded: Set<string> | null = null): { node: OrgNode; depth: number; hasChildren: boolean }[] {
  const out: { node: OrgNode; depth: number; hasChildren: boolean }[] = [];
  function walk(node: OrgNode, depth: number) {
    out.push({ node, depth, hasChildren: node.children.length > 0 });
    if (!expanded || expanded.has(node.id)) {
      for (const c of node.children) walk(c, depth + 1);
    }
  }
  for (const r of roots) walk(r, 0);
  return out;
}

/**
 * Monthly progress trend (planned vs actual) rolled up across a set of projects.
 * Returns 12 data points for the Jalali year.
 */
export async function progressTrend(projectIds: string[], year = 1405) {
  if (projectIds.length === 0) return [];
  const PERSIAN_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
  const hist = await db.projectProgressHistory.findMany({
    where: { projectId: { in: projectIds } },
    select: { reportDate: true, reportJalali: true, progressPercent: true, plannedProgressPercent: true, projectId: true },
  });
  // group by month
  const byMonth: Record<number, { planned: number; actual: number; count: number }> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = { planned: 0, actual: 0, count: 0 };
  // We need weighted average. Get project weights.
  const projects = await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, overallWeight: true } });
  const weightMap = new Map(projects.map((p) => [p.id, p.overallWeight || 100]));

  for (const h of hist) {
    const m = h.reportJalali ? Number(h.reportJalali.split("/")[1]) : h.reportDate.getUTCMonth() + 1;
    const w = weightMap.get(h.projectId) || 100;
    byMonth[m].planned += h.plannedProgressPercent * w;
    byMonth[m].actual += h.progressPercent * w;
    byMonth[m].count += w;
  }
  return PERSIAN_MONTHS.map((name, i) => {
    const m = i + 1;
    const b = byMonth[m];
    return {
      month: name,
      monthIdx: m,
      planned: b.count > 0 ? Math.round((b.planned / b.count) * 10) / 10 : 0,
      actual: b.count > 0 ? Math.round((b.actual / b.count) * 10) / 10 : 0,
    };
  });
}

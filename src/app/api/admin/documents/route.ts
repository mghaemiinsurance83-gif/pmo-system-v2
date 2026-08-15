import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

// GET /api/admin/documents — list documents for approval queue
// Query params: status=PENDING|APPROVED|REJECTED|ALL (default PENDING), page, pageSize, search, orgId
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "PENDING";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));
  const search = url.searchParams.get("search")?.trim() || "";
  const orgId = url.searchParams.get("orgId") || "";

  const where: any = { isActive: true };
  if (status !== "ALL") where.approvalStatus = status;
  if (orgId) where.orgId = orgId;
  if (search) {
    where.OR = [
      { originalFileName: { contains: search } },
      { title: { contains: search } },
      { description: { contains: search } },
      { task: { taskName: { contains: search } } },
      { project: { projectName: { contains: search } } },
    ];
  }

  const [total, items] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        task: { select: { id: true, taskName: true, taskCode: true, progressPercent: true, status: true } },
        project: { select: { id: true, projectName: true, projectCode: true } },
        org: { select: { id: true, name: true, displayName: true } },
        uploadedBy: { select: { id: true, name: true, username: true } },
        approvedBy: { select: { id: true, name: true, username: true } },
      },
    }),
  ]);

  // Summary counts for tabs
  const counts = await db.document.groupBy({
    by: ["approvalStatus"],
    where: { isActive: true },
    _count: { _all: true },
  });
  const summary = {
    PENDING: counts.find((c) => c.approvalStatus === "PENDING")?._count._all || 0,
    APPROVED: counts.find((c) => c.approvalStatus === "APPROVED")?._count._all || 0,
    REJECTED: counts.find((c) => c.approvalStatus === "REJECTED")?._count._all || 0,
    ALL: counts.reduce((sum, c) => sum + c._count._all, 0),
  };

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    summary,
  });
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const orgs = await db.organization.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, displayName: true, orgType: true, level: true, parentOrgId: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  return Response.json({ data: orgs });
}

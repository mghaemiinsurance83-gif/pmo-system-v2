import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const canonicalOrgId = searchParams.get("canonicalOrgId");
  const search = searchParams.get("search");

  const where: any = {};
  if (canonicalOrgId) where.canonicalOrgId = canonicalOrgId;
  if (search) {
    where.OR = [
      { originalName: { contains: search } },
      { normalizedName: { contains: search } },
    ];
  }

  const orgs = await db.organization.findMany({
    where: { orgType: { in: ["MANAGEMENT", "GROUP"] } },
    orderBy: [{ level: "asc" }, { name: "asc" }],
    include: {
      dictionaryEntries: { where, orderBy: { aliasType: "asc" } },
      parent: true,
      _count: { select: { ownedProjects: true } },
    },
  });

  return NextResponse.json({
    items: orgs.map((o) => ({
      id: o.id,
      code: o.code,
      name: o.name,
      displayName: o.displayName,
      parent: o.parent?.name || null,
      projectCount: o._count.ownedProjects,
      aliases: o.dictionaryEntries.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        aliasType: d.aliasType,
        source: d.source,
        confidence: d.confidence,
      })),
    })),
  });
}

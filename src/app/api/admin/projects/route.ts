import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") || "20"), 100);
  const search = searchParams.get("search") || undefined;

  const where = {
    ...(search ? { OR: [{ projectName: { contains: search } }, { projectCode: { contains: search } }, { programTitle: { contains: search } }] } : {}),
  };

  const [total, items] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
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
        priority: true,
        ownerOrg: { select: { id: true, name: true, code: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    data: items.map((p) => ({ ...p, taskCount: p._count.tasks, _count: undefined })),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

const createSchema = z.object({
  projectName: z.string().min(1).max(200),
  programTitle: z.string().optional(),
  ownerOrgId: z.string().optional().nullable(),
  year: z.number().int().optional(),
  programNumber: z.number().int().optional(),
  startJalali: z.string().optional(),
  endJalali: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  overallWeight: z.number().optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر", details: e as object } }, { status: 422 });
  }

  // Generate code
  const count = await db.project.count();
  const projectCode = `PRG-${body.year || 1405}-MANUAL-${count + 1}`;

  const project = await db.project.create({
    data: {
      projectCode,
      projectName: body.projectName,
      programTitle: body.programTitle || null,
      ownerOrgId: body.ownerOrgId || null,
      year: body.year || 1405,
      programNumber: body.programNumber || null,
      startJalali: body.startJalali || null,
      endJalali: body.endJalali || null,
      priority: body.priority || "NORMAL",
      overallWeight: body.overallWeight || 100,
      description: body.description || null,
      goal: body.goal || null,
      createdBy: user.id,
    },
  });

  await audit({ userId: user.id, entityType: "PROJECT", entityId: project.id, action: "CREATE", newValue: body });

  return Response.json({ data: { id: project.id, projectCode } }, { status: 201 });
}

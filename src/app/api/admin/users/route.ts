import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { invalidateScope } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Math.min(Number(searchParams.get("pageSize") || "20"), 100);
  const role = searchParams.get("role") || undefined;
  const search = searchParams.get("search") || undefined;

  const where = {
    ...(role ? { role } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { username: { contains: search } }, { email: { contains: search } }] } : {}),
  };

  const [total, items] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        authSource: true,
        createdAt: true,
        org: { select: { id: true, name: true, code: true } },
        liaisonOrgs: { select: { org: { select: { id: true, name: true, code: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    data: items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

const createSchema = z.object({
  username: z.string().min(2).max(50),
  name: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["ADMIN", "MANAGER", "LIAISON", "VIEWER"]),
  orgId: z.string().optional().nullable(),
  password: z.string().min(4).optional(),
  liaisonOrgIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (currentUser.role !== "ADMIN") return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION", message: "ورودی نامعتبر", details: e as object } }, { status: 422 });
  }

  const existing = await db.user.findUnique({ where: { username: body.username } });
  if (existing) return Response.json({ error: { code: "CONFLICT", message: "نام کاربری تکراری است" } }, { status: 409 });

  const passwordHash = body.password ? bcrypt.hashSync(body.password, 12) : null;

  const user = await db.user.create({
    data: {
      username: body.username,
      name: body.name,
      email: body.email || null,
      role: body.role,
      orgId: body.orgId || null,
      authSource: "LOCAL",
      passwordHash,
      liaisonOrgs: body.liaisonOrgIds?.length
        ? { create: body.liaisonOrgIds.map((orgId) => ({ orgId, assignedBy: currentUser.id })) }
        : undefined,
    },
  });

  await audit({
    userId: currentUser.id,
    entityType: "USER",
    entityId: user.id,
    action: "CREATE",
    newValue: { username: user.username, role: user.role, orgId: user.orgId },
  });

  return Response.json({ data: { id: user.id } }, { status: 201 });
}

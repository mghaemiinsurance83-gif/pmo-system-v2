import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  projectId: z.string(),
  taskName: z.string().min(1).max(300),
  sequenceNo: z.number().int().optional(),
  weight: z.number().optional(),
  startJalali: z.string().optional().nullable(),
  endJalali: z.string().optional().nullable(),
  status: z.string().optional(),
  taskType: z.string().optional(),
  isMilestone: z.boolean().optional(),
  target: z.string().optional().nullable(),
  prereq: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
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

  const maxSeq = await db.task.findFirst({
    where: { projectId: body.projectId },
    orderBy: { sequenceNo: "desc" },
    select: { sequenceNo: true },
  });

  const task = await db.task.create({
    data: {
      projectId: body.projectId,
      taskName: body.taskName,
      sequenceNo: body.sequenceNo ?? (maxSeq?.sequenceNo ?? 0) + 1,
      weight: body.weight ?? 0,
      startJalali: body.startJalali ?? null,
      endJalali: body.endJalali ?? null,
      status: body.status ?? "NOT_STARTED",
      taskType: body.taskType ?? "ACTIVITY",
      isMilestone: body.isMilestone ?? false,
      target: body.target ?? null,
      prereq: body.prereq ?? null,
      notes: body.notes ?? null,
      description: body.description ?? null,
      createdBy: user.id,
    },
  });

  await audit({ userId: user.id, entityType: "TASK", entityId: task.id, action: "CREATE", newValue: body });

  return Response.json({ data: { id: task.id } }, { status: 201 });
}

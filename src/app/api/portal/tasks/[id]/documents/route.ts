import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope, canEdit } from "@/lib/rbac";
import { saveFile, validateFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const taskId = params.id;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { project: { select: { ownerOrgId: true, unitLinks: { select: { orgId: true } } } } },
  });
  if (!task) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const isAll = scope?.has("*");
  if (!isAll) {
    const orgIds = new Set<string>();
    if (task.project.ownerOrgId) orgIds.add(task.project.ownerOrgId);
    for (const ul of task.project.unitLinks) orgIds.add(ul.orgId);
    const inScope = [...(scope ?? [])].some((id) => orgIds.has(id));
    if (!inScope) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const docs = await db.document.findMany({
    where: { taskId, isActive: true },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      forMonth: true,
      forJalali: true,
      title: true,
      description: true,
      uploadedAt: true,
      uploadedBy: { select: { name: true } },
    },
  });

  return Response.json({ data: docs });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canEdit(user.role))
    return Response.json({ error: { code: "FORBIDDEN", message: "اجازه آپلود ندارید" } }, { status: 403 });

  const taskId = params.id;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, project: { select: { ownerOrgId: true, unitLinks: { select: { orgId: true } } } } },
  });
  if (!task) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Scope check
  const isAll = scope?.has("*");
  if (!isAll) {
    const orgIds = new Set<string>();
    if (task.project.ownerOrgId) orgIds.add(task.project.ownerOrgId);
    for (const ul of task.project.unitLinks) orgIds.add(ul.orgId);
    const inScope = [...(scope ?? [])].some((id) => orgIds.has(id));
    if (!inScope) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: { code: "VALIDATION", message: "فایل الزامی است" } }, { status: 422 });

  const validationError = validateFile(file);
  if (validationError) return Response.json({ error: { code: "VALIDATION", message: validationError } }, { status: 422 });

  const { storedFileName, storagePath, sizeBytes } = await saveFile(file, taskId);
  const forMonthStr = formData.get("forMonth");
  const forMonth = forMonthStr ? Number(forMonthStr) : null;
  const title = (formData.get("title") as string) || null;
  const description = (formData.get("description") as string) || null;

  const doc = await db.document.create({
    data: {
      taskId,
      projectId: task.projectId,
      orgId: user.orgId,
      originalFileName: file.name,
      storedFileName,
      mimeType: file.type,
      sizeBytes,
      storagePath,
      forMonth,
      title,
      description,
      uploadedById: user.id,
    },
  });

  await audit({
    userId: user.id,
    entityType: "DOCUMENT",
    entityId: doc.id,
    action: "CREATE",
    newValue: { fileName: file.name, taskId, forMonth },
  });

  return Response.json({ data: doc }, { status: 201 });
}

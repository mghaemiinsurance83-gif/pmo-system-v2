import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

// PATCH /api/admin/documents/[id]/approve
// Body: { approvedProgressPercent?: number, comment?: string }
//   - If approvedProgressPercent provided, updates Task.approvedProgressPercent
//   - Sets document.approvalStatus = APPROVED
//   - Notifies uploader
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const approvedProgressPercent = typeof body.approvedProgressPercent === "number"
    ? Math.max(0, Math.min(100, body.approvedProgressPercent))
    : undefined;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";

  const doc = await db.document.findUnique({
    where: { id },
    include: { task: true, uploadedBy: true },
  });
  if (!doc || !doc.isActive) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const now = new Date();
  const updated = await db.document.update({
    where: { id },
    data: {
      approvalStatus: "APPROVED",
      approvedById: user.id,
      approvedAt: now,
      reviewedAt: now,
      rejectionReason: null,
    },
  });

  // If admin provided an approved progress %, update the Task
  if (approvedProgressPercent !== undefined && doc.task) {
    await db.task.update({
      where: { id: doc.taskId },
      data: { approvedProgressPercent },
    });
  }

  await audit({
    userId: user.id,
    entityType: "DOCUMENT",
    entityId: id,
    action: "APPROVE",
    oldValue: JSON.stringify({ approvalStatus: doc.approvalStatus }),
    newValue: JSON.stringify({
      approvalStatus: "APPROVED",
      approvedProgressPercent,
      comment,
    }),
  });

  // Notify uploader
  if (doc.uploadedById) {
    await notify({
      userId: doc.uploadedById,
      title: "تأیید مستند",
      body: `مستند «${doc.originalFileName}» توسط ادمین تأیید شد.`,
      type: "DOC_APPROVED",
      link: `/portal/tasks/${doc.taskId}`,
    });
  }

  return NextResponse.json({ ok: true, document: updated });
}

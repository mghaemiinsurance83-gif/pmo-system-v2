import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

// PATCH /api/admin/documents/[id]/reject
// Body: { rejectionReason: string (required) }
//   - Sets document.approvalStatus = REJECTED
//   - Notifies uploader with reason
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
  const rejectionReason = typeof body.rejectionReason === "string"
    ? body.rejectionReason.trim()
    : "";

  if (!rejectionReason) {
    return NextResponse.json(
      { error: "دلیل رد مستند الزامی است" },
      { status: 400 }
    );
  }

  const doc = await db.document.findUnique({
    where: { id },
    include: { uploadedBy: true },
  });
  if (!doc || !doc.isActive) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const now = new Date();
  const updated = await db.document.update({
    where: { id },
    data: {
      approvalStatus: "REJECTED",
      approvedById: user.id,
      reviewedAt: now,
      rejectionReason,
    },
  });

  await audit({
    userId: user.id,
    entityType: "DOCUMENT",
    entityId: id,
    action: "REJECT",
    oldValue: JSON.stringify({ approvalStatus: doc.approvalStatus }),
    newValue: JSON.stringify({ approvalStatus: "REJECTED", rejectionReason }),
  });

  // Notify uploader
  if (doc.uploadedById) {
    await notify({
      userId: doc.uploadedById,
      title: "رد مستند",
      body: `مستند «${doc.originalFileName}» توسط ادمین رد شد. دلیل: ${rejectionReason}`,
      type: "DOC_REJECTED",
      link: `/portal/tasks/${doc.taskId}`,
    });
  }

  return NextResponse.json({ ok: true, document: updated });
}

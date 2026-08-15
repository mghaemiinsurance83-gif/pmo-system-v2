import { db } from "@/lib/db";

/**
 * Write an audit log entry.
 */
export async function audit(params: {
  userId?: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
        newValue: params.newValue ? JSON.stringify(params.newValue) : null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write:", e);
  }
}

import { db } from "@/lib/db";

/**
 * Create a notification for a user.
 */
export async function notify(params: {
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string;
}) {
  try {
    await db.notification.create({ data: params });
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}

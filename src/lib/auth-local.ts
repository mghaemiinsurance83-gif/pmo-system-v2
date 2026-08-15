import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export interface LocalAuthResult {
  displayName: string;
  mail?: string;
  dn?: string;
  orgId?: string | null;
}

/**
 * LOCAL authentication fallback (for dev/sandbox without AD).
 * Validates against User.passwordHash in DB.
 */
export async function authenticateLocal(
  username: string,
  password: string
): Promise<LocalAuthResult | null> {
  const user = await db.user.findUnique({
    where: { username },
    select: { name: true, email: true, passwordHash: true, orgId: true },
  });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    displayName: user.name,
    mail: user.email ?? undefined,
    orgId: user.orgId,
  };
}

import { db } from "@/lib/db";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type Role = "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";

const scopeCache = new Map<string, { ids: Set<string>; exp: number }>();
const SCOPE_TTL = 5 * 60 * 1000; // 5 min

export interface AuthUser {
  id: string;
  name: string;
  email?: string | null;
  role: Role;
  orgId: string | null;
  username: string;
}

/**
 * Get current authenticated user from server session.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = (await getServerSession(authOptions)) as (Session & {
    user?: AuthUser;
  }) | null;
  if (!session?.user?.id) return null;
  return session.user;
}

/**
 * Compute the set of Organization IDs a user can access.
 * - ADMIN → ["*"] (entire company)
 * - MANAGER/LIAISON → their orgId + all descendants + liaison orgs + their descendants
 * - VIEWER → same as MANAGER (read-only)
 */
export async function getUserScope(
  userId: string,
  role: Role,
  orgId: string | null
): Promise<Set<string>> {
  if (role === "ADMIN") return new Set(["*"]);

  const cacheKey = userId;
  const cached = scopeCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return cached.ids;

  const ids = new Set<string>();

  // Primary org + descendants
  if (orgId) {
    ids.add(orgId);
    const queue = [orgId];
    while (queue.length) {
      const parent = queue.shift()!;
      const children = await db.organization.findMany({
        where: { parentOrgId: parent, isActive: true },
        select: { id: true },
      });
      for (const c of children) {
        if (!ids.has(c.id)) {
          ids.add(c.id);
          queue.push(c.id);
        }
      }
    }
  }

  // Liaison orgs + their descendants
  const liaisons = await db.userLiaisonOrg.findMany({
    where: { userId },
    select: { orgId: true },
  });
  for (const l of liaisons) {
    if (!ids.has(l.orgId)) {
      ids.add(l.orgId);
      const queue = [l.orgId];
      while (queue.length) {
        const parent = queue.shift()!;
        const children = await db.organization.findMany({
          where: { parentOrgId: parent, isActive: true },
          select: { id: true },
        });
        for (const c of children) {
          if (!ids.has(c.id)) {
            ids.add(c.id);
            queue.push(c.id);
          }
        }
      }
    }
  }

  scopeCache.set(cacheKey, { ids, exp: Date.now() + SCOPE_TTL });
  return ids;
}

/**
 * Convenience: get current user + scope in one call.
 */
export async function getCurrentUserWithScope() {
  const user = await getCurrentUser();
  if (!user) return { user: null, scope: null };
  const scope = await getUserScope(user.id, user.role, user.orgId);
  return { user, scope };
}

/**
 * Check if a user can edit (upload docs, set progress).
 */
export function canEdit(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "LIAISON";
}

/**
 * Invalidate scope cache for a user (call when role/org changes).
 */
export function invalidateScope(userId: string) {
  scopeCache.delete(userId);
}

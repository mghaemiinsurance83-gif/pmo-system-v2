import { db } from "@/lib/db";

export interface ADAuthResult {
  displayName: string;
  mail?: string;
  dn: string;
  orgId?: string | null;
}

/**
 * Active Directory authentication via LDAP.
 *
 * In sandbox/dev we don't have a real AD server, so this stub returns null
 * (caller falls back to LOCAL when AUTH_MODE=LOCAL).
 *
 * To enable real AD, install `ldapjs` and uncomment the implementation below,
 * then set AUTH_MODE=AD and configure AD_URL etc in .env.
 */
export async function authenticateWithAD(
  _username: string,
  _password: string
): Promise<ADAuthResult | null> {
  // ─── STUB (no AD in sandbox) ────────────────────────────────────────────
  // Real implementation would use ldapjs:
  //
  //   import ldap from "ldapjs";
  //   const client = ldap.createClient({ url: process.env.AD_URL! });
  //   const userDN = process.env.AD_USERNAME_FORMAT!.replace("{username}", _username);
  //   await new Promise<void>((resolve, reject) => {
  //     client.bind(userDN, _password, (err) => err ? reject(err) : resolve());
  //   });
  //   // ...search for attributes...
  //   client.unbind();
  //   return { displayName, mail, dn: userDN, orgId };
  //
  // For now, return null so LOCAL auth is used.
  return null;
}

/**
 * Map AD `department` attribute → Organization.id via UnitDictionary.
 * (Placeholder for future implementation.)
 */
export async function mapDepartmentToOrg(department: string): Promise<string | null> {
  if (!department) return null;
  const dict = await db.unitDictionary.findFirst({
    where: { normalizedName: { contains: department } },
    select: { canonicalOrgId: true },
  });
  return dict?.canonicalOrgId ?? null;
}

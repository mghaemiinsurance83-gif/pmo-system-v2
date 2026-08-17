import NextAuth, { type NextAuthOptions } from "next-auth";
import { decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authenticateLocal } from "@/lib/auth-local";
import { authenticateWithAD } from "@/lib/auth-ad";

const AUTH_MODE = process.env.AUTH_MODE || "LOCAL";

export interface AppUser {
  id: string;
  name: string;
  email?: string | null;
  role: "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";
  orgId: string | null;
  username: string;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 hours
  providers: [
    CredentialsProvider({
      name: "ورود سازمانی",
      credentials: {
        username: { label: "نام کاربری", type: "text" },
        password: { label: "رمز عبور", type: "password" },
      },
      async authorize(creds) {
        const username = creds?.username?.trim();
        const password = creds?.password ?? "";
        if (!username || !password) return null;

        // 1. Authenticate (AD or LOCAL)
        const result =
          AUTH_MODE === "AD"
            ? await authenticateWithAD(username, password)
            : await authenticateLocal(username, password);

        if (!result) {
          // Log failed attempt
          await db.authEvent.create({
            data: { username, action: "LOGIN_FAILED", errorReason: "Invalid credentials" },
          });
          return null;
        }

        // 2. Upsert user in DB
        const user = await db.user.upsert({
          where: { username },
          create: {
            username,
            name: result.displayName,
            email: result.mail,
            role: "VIEWER",
            orgId: result.orgId,
            lastLoginAt: new Date(),
            authSource: AUTH_MODE,
            adDistinguishedName: result.dn,
            adSyncedAt: AUTH_MODE === "AD" ? new Date() : null,
          },
          update: {
            name: result.displayName,
            email: result.mail ?? undefined,
            lastLoginAt: new Date(),
            adSyncedAt: AUTH_MODE === "AD" ? new Date() : undefined,
          },
        });

        if (!user.isActive) {
          await db.authEvent.create({
            data: { userId: user.id, username, action: "LOGIN_FAILED", errorReason: "Account disabled" },
          });
          return null;
        }

        // 3. Log success
        await db.authEvent.create({
          data: { userId: user.id, username, action: "LOGIN_SUCCESS" },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          orgId: user.orgId,
          username: user.username,
        } as AppUser & { id: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as AppUser & { id: string };
        token.id = u.id;
        token.role = u.role;
        token.orgId = u.orgId;
        token.username = u.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as AppUser).id = token.id as string;
        (session.user as AppUser).role = token.role as AppUser["role"];
        (session.user as AppUser).orgId = (token.orgId as string) || null;
        (session.user as AppUser).username = token.username as string;
      }
      return session;
    },
  },
  pages: { signIn: "/" }, // single-page constraint: login is a view within /
};

export default NextAuth(authOptions);

// =============================================================================
// Next.js 16 compat: getServerSession() from next-auth v4 is broken because
// Next.js 16 made cookies()/headers() async. We manually read the session JWT
// from the cookie store and decode it. This is the single source of truth for
// server-side session reading in this app — used by src/lib/rbac.ts.
// =============================================================================

function getAuthSecret(): string {
  const envSecret = process.env.NEXTAUTH_SECRET;
  if (envSecret) return envSecret;
  // NextAuth v4 dev fallback: hash of URL. We replicate so tokens issued
  // before NEXTAUTH_SECRET was set still decode. (Set NEXTAUTH_SECRET to
  // make this deterministic.)
  const url = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return createHash("sha256").update(url).digest().toString();
}

export interface ServerSession {
  user: AppUser;
  expires: string;
}

/**
 * Read the NextAuth JWT session from cookies, fully compatible with
 * Next.js 16's async cookies(). Replaces getServerSession(authOptions).
 */
export async function getServerSessionCompat(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const tokenCookie =
    cookieStore.get("next-auth.session-token") ||
    cookieStore.get("__Secure-next-auth.session-token");
  if (!tokenCookie?.value) return null;

  let decoded: Record<string, unknown> | null = null;
  try {
    decoded = await decode({
      token: tokenCookie.value,
      secret: getAuthSecret(),
    });
  } catch {
    return null;
  }
  if (!decoded) return null;

  const id = decoded.id as string | undefined;
  const role = decoded.role as AppUser["role"] | undefined;
  if (!id || !role) return null;

  return {
    user: {
      id,
      name: (decoded.name as string) || "",
      email: (decoded.email as string) || null,
      role,
      orgId: (decoded.orgId as string) || null,
      username: (decoded.username as string) || "",
    },
    expires: (decoded.exp as number)
      ? new Date((decoded.exp as number) * 1000).toISOString()
      : new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
  };
}

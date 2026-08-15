import NextAuth, { type NextAuthOptions } from "next-auth";
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

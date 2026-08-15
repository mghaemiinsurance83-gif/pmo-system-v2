import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";
    orgId?: string | null;
    username?: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      role: "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";
      orgId: string | null;
      username: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";
    orgId?: string | null;
    username?: string;
  }
}
